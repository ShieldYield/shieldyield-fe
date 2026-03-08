import {
    createPublicClient,
    http,
    type Address,
    parseAbiItem,
} from "viem";
import { arbitrumSepolia, baseSepolia } from "viem/chains";

// ============================================================================
// Contract Addresses (UPDATED after Stateful CCIP Deploy)
// ============================================================================
const ARB_SHIELD_BRIDGES: Address[] = [
    "0x2C9dA99e2Af99aa0e559e63068165889f38a70ec", // Latest Stateful Deploy
    "0xa66A087dFb94a198c793B65E66C412F063C15476", // Previous
];
const BASE_SHIELD_BRIDGES: Address[] = [
    "0x83995931A5BE0cc67811ed1D4714F4eEE213EE8D", // Latest Stateful Deploy
    "0x87Ed95Ef9fB41BeA722f4575f54b4c24EB38F679", // Previous
];

const CHAIN_SELECTOR_NAMES: Record<string, string> = {
    "10344971235874465080": "Base Sepolia",
    "16015286601757825753": "Ethereum Sepolia",
    "5224473277236331295": "Optimism Sepolia",
    "3478487238524512106": "Arbitrum Sepolia",
};

const EMERGENCY_BRIDGE_INITIATED_V2 = parseAbiItem(
    "event EmergencyBridgeInitiated(bytes32 indexed messageId, uint64 destinationChain, address indexed token, uint256 amount, address indexed sender)"
);

const EMERGENCY_BRIDGE_INITIATED_V1 = parseAbiItem(
    "event EmergencyBridgeInitiated(bytes32 indexed messageId, uint64 destinationChain, address indexed token, uint256 amount, address sender)"
);

const EMERGENCY_BRIDGE_RECEIVED_EVENT = parseAbiItem(
    "event EmergencyBridgeReceived(bytes32 indexed messageId, uint64 indexed sourceChain, address indexed token, uint256 amount)"
);

export type BridgeMessageStatus = "PENDING" | "IN_PROGRESS" | "SUCCESS" | "FAILED";

export interface BridgeMessage {
    messageId: string;
    status: BridgeMessageStatus;
    amount: number;
    token: string;
    sender: string;
    destinationChain: string;
    sourceChain: string;
    sourceTxHash: string;
    sourceBlockNumber: number;
    ccipExplorerUrl: string;
}

export interface BridgeStatusResult {
    pendingMessages: BridgeMessage[];
    completedMessages: BridgeMessage[];
    totalPendingAmount: number;
    totalBridgedAmount: number;
    emergencyBridgeCount: number;
    lastUpdated: string;
}

let statusCacheMap = new Map<string, { data: BridgeStatusResult; timestamp: number }>();
const CACHE_TTL_MS = 5_000;

const arbRpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";

const arbClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(arbRpcUrl),
});

const baseClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
});

async function queryCcipApiStatus(messageId: string): Promise<BridgeMessageStatus> {
    try {
        const url = `https://ccip.chain.link/api/h/atlas/messages/${messageId}`;
        const res = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
            cache: "no-store",
        });
        if (!res.ok) return "PENDING"; 
        const data = await res.json();
        const status = (data?.status || "").toUpperCase();
        if (status.includes("SUCCESS") || status.includes("EXECUTED") || status === "COMPLETE") return "SUCCESS";
        if (status.includes("FAIL")) return "FAILED";
        if (status.includes("FLIGHT") || status.includes("PROGRESS") || status === "COMMITTED") return "IN_PROGRESS";
        return "PENDING";
    } catch { return "PENDING"; }
}

export async function fetchBridgeStatus(options?: { noCache?: boolean; wallet?: string }): Promise<BridgeStatusResult> {
    const walletKey = (options?.wallet || "GLOBAL").toLowerCase();
    if (!options?.noCache && statusCacheMap.has(walletKey)) {
        const cached = statusCacheMap.get(walletKey)!;
        if (Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;
    }

    const [arbBlock, baseBlock] = await Promise.all([
        arbClient.getBlockNumber(),
        baseClient.getBlockNumber(),
    ]);

    const ARB_LOOKBACK = 40000n; 
    const BASE_LOOKBACK = 9000n;
    const arbFromBlock = arbBlock > ARB_LOOKBACK ? arbBlock - ARB_LOOKBACK : 0n;
    const baseFromBlock = baseBlock > BASE_LOOKBACK ? baseBlock - BASE_LOOKBACK : 0n;

    let initiatedLogs: any[] = [];
    let receivedLogs: any[] = [];

    try {
        const initiatedLogArrays = await Promise.all(
            ARB_SHIELD_BRIDGES.flatMap((addr) => [
                arbClient.getLogs({ address: addr, event: EMERGENCY_BRIDGE_INITIATED_V2, fromBlock: arbFromBlock, toBlock: "latest" }),
                arbClient.getLogs({ address: addr, event: EMERGENCY_BRIDGE_INITIATED_V1, fromBlock: arbFromBlock, toBlock: "latest" })
            ])
        );
        initiatedLogs = initiatedLogArrays.flat();
    } catch (err) { console.error("[bridge-status] Failed to fetch Arb logs", err); }

    try {
        const receivedLogArrays = await Promise.all(
            BASE_SHIELD_BRIDGES.map((addr) => baseClient.getLogs({ address: addr, event: EMERGENCY_BRIDGE_RECEIVED_EVENT, fromBlock: baseFromBlock, toBlock: "latest" }))
        );
        receivedLogs = receivedLogArrays.flat();
    } catch (err) { console.error("[bridge-status] Failed to fetch Base logs", err); }

    const receivedMessageIds = new Set(receivedLogs.map((log) => (log as any).args?.messageId as string));
    const walletLower = options?.wallet?.toLowerCase();

    const allMessages: BridgeMessage[] = [];
    for (const log of initiatedLogs) {
        const args = (log as any).args;
        if (!args?.messageId) continue;
        const sender = (args.sender as string) ?? "System";
        const senderLower = sender.toLowerCase();
        
        // STRICT PERSONAL FILTER:
        // If a wallet is provided, we ONLY show and count messages where the sender matches.
        // We MUST ignore system-wide pooled bridges for individual users.
        if (walletLower && senderLower !== walletLower) continue;

        const amount = Number(BigInt(args.amount ?? 0n)) / 1e18;
        const msg: BridgeMessage = {
            messageId: args.messageId,
            status: receivedMessageIds.has(args.messageId) ? "SUCCESS" : "PENDING",
            amount,
            token: (args.token as string) ?? "",
            sender,
            destinationChain: CHAIN_SELECTOR_NAMES[String(args.destinationChain ?? "")] ?? "Safe Chain",
            sourceChain: "Arbitrum Sepolia",
            sourceTxHash: log.transactionHash ?? "",
            sourceBlockNumber: Number(log.blockNumber ?? 0),
            ccipExplorerUrl: `https://ccip.chain.link/msg/${args.messageId}`,
        };
        allMessages.push(msg);
    }

    const pendingForApi = allMessages.filter(m => m.status === "PENDING");
    if (pendingForApi.length > 0) {
        const ccipStatuses = await Promise.all(pendingForApi.map((m) => queryCcipApiStatus(m.messageId)));
        for (let i = 0; i < pendingForApi.length; i++) {
            if (ccipStatuses[i] !== "PENDING") pendingForApi[i].status = ccipStatuses[i];
        }
    }

    allMessages.sort((a, b) => b.sourceBlockNumber - a.sourceBlockNumber);
    const pendingMessages = allMessages.filter((m) => m.status === "PENDING" || m.status === "IN_PROGRESS");
    const completedMessages = allMessages.filter((m) => m.status === "SUCCESS" || m.status === "FAILED");

    const result: BridgeStatusResult = {
        pendingMessages,
        completedMessages,
        totalPendingAmount: pendingMessages.reduce((sum, m) => sum + m.amount, 0),
        totalBridgedAmount: completedMessages.filter((m) => m.status === "SUCCESS").reduce((sum, m) => sum + m.amount, 0),
        emergencyBridgeCount: allMessages.length,
        lastUpdated: new Date().toISOString(),
    };

    statusCacheMap.set(walletKey, { data: result, timestamp: Date.now() });
    return result;
}
