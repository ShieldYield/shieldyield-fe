import {
    createPublicClient,
    http,
    type Address,
    parseAbiItem,
} from "viem";
import { arbitrumSepolia, baseSepolia } from "viem/chains";

// ============================================================================
// Contract Addresses
// ============================================================================
// Multiple ShieldBridge deployments on Arbitrum Sepolia
const ARB_SHIELD_BRIDGES: Address[] = [
    "0xa66A087dFb94a198c793B65E66C412F063C15476", // Latest Clean Deploy
    "0x4B8381d50A8D609A43060Fc19692289870afC80f", // Staging/Old from screenshot
    "0xd58Dc4Cc584b1b5c1dD393934956D91Ce6cB3f8e", // Previous V2
    "0xA5D0CF3DC85538FfC93EF8941819e2b1b0460387", // Production V1
    "0xCB24bbdC0F6f32f4555A4FdA1542A8BB0F5221C0", // CRE Staging
];
// Multiple potential receivers on Base
const BASE_SHIELD_BRIDGES: Address[] = [
    "0x87Ed95Ef9fB41BeA722f4575f54b4c24EB38F679", // Latest Clean Deploy
    "0x32583f9C0A0d9Fa6517cf4005826148d81C85056", // Previous V2
    "0x4B8381d50A8D609A43060Fc19692289870afC80f", // Old Bridge
];

// NOTE: We no longer use a static AUTHORIZED_SENDERS list. 
// Any event emitted by the contracts in ARB_SHIELD_BRIDGES is considered 
// an authorized system action and will be displayed.

// ============================================================================
// CCIP Chain Selectors → Human-readable names
// ============================================================================

const CHAIN_SELECTOR_NAMES: Record<string, string> = {
    "10344971235874465080": "Base Sepolia",
    "16015286601757825753": "Ethereum Sepolia",
    "5224473277236331295": "Optimism Sepolia",
    "3478487238524512106": "Arbitrum Sepolia",
};

// ============================================================================
// ABI Events
// ============================================================================

// NEW: Supports both indexed (v2) and non-indexed (v1) senders
const EMERGENCY_BRIDGE_INITIATED_V2 = parseAbiItem(
    "event EmergencyBridgeInitiated(bytes32 indexed messageId, uint64 destinationChain, address indexed token, uint256 amount, address indexed sender)"
);

const EMERGENCY_BRIDGE_INITIATED_V1 = parseAbiItem(
    "event EmergencyBridgeInitiated(bytes32 indexed messageId, uint64 destinationChain, address indexed token, uint256 amount, address sender)"
);

const EMERGENCY_BRIDGE_RECEIVED_EVENT = parseAbiItem(
    "event EmergencyBridgeReceived(bytes32 indexed messageId, uint64 indexed sourceChain, address indexed token, uint256 amount)"
);

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Cache — shared across all callers within the same server process
// ============================================================================

let statusCache: { data: BridgeStatusResult; timestamp: number } | null = null;
const CACHE_TTL_MS = 10_000;

// ============================================================================
// Viem Clients (singleton per process) with Fallback Transports
// ============================================================================

import { fallback } from "viem";

const arbClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: fallback([
        ...(process.env.ARBITRUM_SEPOLIA_RPC_URL ? [http(process.env.ARBITRUM_SEPOLIA_RPC_URL)] : []),
        http("https://sepolia-rollup.arbitrum.io/rpc"),
        http("https://arbitrum-sepolia.blockpi.network/v1/rpc/public"),
        http("https://endpoints.omniatech.io/v1/arbitrum/sepolia/public"),
    ]),
});

const baseClient = createPublicClient({
    chain: baseSepolia,
    transport: fallback([
        http("https://sepolia.base.org"),
        http("https://base-sepolia.blockpi.network/v1/rpc/public"),
    ]),
});

// ============================================================================
// CCIP API: Query Chainlink's public API for real-time message status
// ============================================================================

// CCIP state mapping: https://ccip.chain.link/api/h/atlas/message/{messageId}
// state: 0 = Untouched, 1 = InFlight, 2 = Committed/Executed, 3 = Failed
const CCIP_STATE_MAP: Record<number, BridgeMessageStatus> = {
    0: "PENDING",
    1: "IN_PROGRESS",
    2: "SUCCESS",
    3: "FAILED",
};

async function queryCcipApiStatus(messageId: string): Promise<BridgeMessageStatus> {
    try {
        // CCIP Public Atlas API for message status
        const url = `https://ccip.chain.link/api/h/atlas/messages/${messageId}`;
        const res = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
            cache: "no-store",
        });

        if (!res.ok) return "PENDING"; 

        const data = await res.json();
        // The Atlas API usually returns a status field like "Success", "Failed", "InFlight"
        const status = (data?.status || "").toUpperCase();

        if (status.includes("SUCCESS") || status.includes("EXECUTED") || status === "COMPLETE") return "SUCCESS";
        if (status.includes("FAIL")) return "FAILED";
        if (status.includes("FLIGHT") || status.includes("PROGRESS") || status === "COMMITTED") return "IN_PROGRESS";

        return "PENDING";
    } catch {
        return "PENDING"; 
    }
}

// ============================================================================
// Core Logic: Read on-chain events + CCIP API to determine bridge status
// ============================================================================

export async function fetchBridgeStatus(options?: { noCache?: boolean; wallet?: string }): Promise<BridgeStatusResult> {
    // Return cached data if fresh and no wallet filter (wallet-specific results shouldn't be globally cached)
    if (!options?.noCache && !options?.wallet && statusCache && Date.now() - statusCache.timestamp < CACHE_TTL_MS) {
        return statusCache.data;
    }

    // Get recent block numbers from both chains
    let arbBlock = 0n;
    let baseBlock = 0n;

    try {
        const [a, b] = await Promise.all([
            arbClient.getBlockNumber().catch(e => { console.error("[bridge-status] Arb getBlockNumber failed:", e); return 0n; }),
            baseClient.getBlockNumber().catch(e => { console.error("[bridge-status] Base getBlockNumber failed:", e); return 0n; }),
        ]);
        arbBlock = a;
        baseBlock = b;
    } catch (err) {
        console.error("[bridge-status] Failed to fetch block numbers:", err);
    }

    // Balanced lookback for stability (limit to 10k blocks per request)
    // Arbitrum Sepolia: ~0.26s/block. 10,000 blocks ≈ 45 minutes.
    // Base Sepolia: ~2s/block. 5,000 blocks ≈ 2.5 hours.
    const ARB_LOOKBACK = 10000n; 
    const BASE_LOOKBACK = 5000n; 
    const arbFromBlock = arbBlock > ARB_LOOKBACK ? arbBlock - ARB_LOOKBACK : 0n;
    const baseFromBlock = baseBlock > BASE_LOOKBACK ? baseBlock - BASE_LOOKBACK : 0n;

    let initiatedLogs: any[] = [];
    let receivedLogs: any[] = [];

    // Fetch initiation events from Arbitrum
    try {
        const initiatedLogArrays = await Promise.all(
            ARB_SHIELD_BRIDGES.flatMap((addr) => [
                arbClient.getLogs({
                    address: addr,
                    event: EMERGENCY_BRIDGE_INITIATED_V2,
                    fromBlock: arbFromBlock,
                    toBlock: "latest",
                }),
                arbClient.getLogs({
                    address: addr,
                    event: EMERGENCY_BRIDGE_INITIATED_V1,
                    fromBlock: arbFromBlock,
                    toBlock: "latest",
                })
            ])
        );
        initiatedLogs = initiatedLogArrays.flat();
    } catch (err) {
        console.error("[bridge-status] Failed to fetch Arbitrum logs:", err);
    }

    // Fetch received events from Base
    try {
        const receivedLogArrays = await Promise.all(
            BASE_SHIELD_BRIDGES.map((addr) => 
                baseClient.getLogs({
                    address: addr,
                    event: EMERGENCY_BRIDGE_RECEIVED_EVENT,
                    fromBlock: baseFromBlock,
                    toBlock: "latest",
                })
            )
        );
        receivedLogs = receivedLogArrays.flat();
    } catch (err) {
        // This is where the 413 error was happening. 
        // Now it's caught and won't crash the whole GET request.
        console.error("[bridge-status] Failed to fetch Base logs (Received events):", err);
    }

    console.log(`[bridge-status] Block range: Arb(${arbFromBlock}-latest), Base(${baseFromBlock}-latest)`);
    console.log(`[bridge-status] Raw logs found: Initiated=${initiatedLogs.length}, Received=${receivedLogs.length}`);

    // Build a set of messageIds that have been received on Base → SUCCESS
    const receivedMessageIds = new Set(
        receivedLogs.map((log) => (log as any).args?.messageId as string)
    );

    // Filter by wallet if provided
    const walletLower = options?.wallet?.toLowerCase();

    // Process each initiated event — first pass: on-chain status
    const allMessages: BridgeMessage[] = [];
    const pendingMessageIds: string[] = [];

    for (const log of initiatedLogs) {
        const args = (log as any).args;
        if (!args?.messageId) continue;

        const messageId = args.messageId as string;
        const sender = (args.sender as string) ?? "System";
        const senderLower = sender.toLowerCase();
        
        // SMART FILTER:
        // 1. Tampilkan jika ini milik wallet user.
        // 2. Tampilkan jika pengirimnya adalah System (ShieldVault kita).
        // 3. ABAIKAN jika itu milik user lain (alamat wallet asing).
        const SHIELD_VAULT_ADDRESS = "0xE2b7f9E85ee0390B2c3bC874301CAeB941Fc88eB";
        const isSystem = senderLower === SHIELD_VAULT_ADDRESS.toLowerCase();
        const isUser = walletLower && senderLower === walletLower;

        if (walletLower && !isUser && !isSystem) continue;

        // SAFE DECIMAL CALCULATION:
        const rawAmount = BigInt(args.amount ?? 0n);
        const amount = Number(rawAmount) / 1e18; // USDC-BnM is 18 decimals on CCIP

        const token = (args.token as string) ?? "";
        const destChainSelector = String(args.destinationChain ?? "");
        const destinationChain = CHAIN_SELECTOR_NAMES[destChainSelector] ?? `Chain ${destChainSelector}`;

        // On-chain check: was EmergencyBridgeReceived emitted on Base?
        const isReceivedOnChain = receivedMessageIds.has(messageId);

        const msg: BridgeMessage = {
            messageId,
            status: isReceivedOnChain ? "SUCCESS" : "PENDING",
            amount,
            token,
            sender: isSystem ? "ShieldVault (System)" : sender,
            destinationChain,
            sourceChain: "Arbitrum Sepolia",
            sourceTxHash: log.transactionHash ?? "",
            sourceBlockNumber: Number(log.blockNumber ?? 0),
            ccipExplorerUrl: `https://ccip.chain.link/msg/${messageId}`,
        };

        allMessages.push(msg);

        if (!isReceivedOnChain) {
            pendingMessageIds.push(messageId);
        }
    }

    // Second pass: for messages still PENDING on-chain, query CCIP API for real status
    // (EmergencyBridgeReceived may not always be emitted if ccipReceive has issues,
    //  but the CCIP network itself tracks delivery status accurately)
    if (pendingMessageIds.length > 0) {
        const ccipStatuses = await Promise.all(
            pendingMessageIds.map((id) => queryCcipApiStatus(id))
        );

        for (let i = 0; i < pendingMessageIds.length; i++) {
            const msg = allMessages.find((m) => m.messageId === pendingMessageIds[i]);
            if (msg && ccipStatuses[i] !== "PENDING") {
                msg.status = ccipStatuses[i];
            }
        }
    }

    // Sort by block number descending (newest first)
    allMessages.sort((a, b) => b.sourceBlockNumber - a.sourceBlockNumber);

    const pendingMessages = allMessages.filter(
        (m) => m.status === "PENDING" || m.status === "IN_PROGRESS"
    );
    const completedMessages = allMessages.filter(
        (m) => m.status === "SUCCESS" || m.status === "FAILED"
    );

    const totalPendingAmount = pendingMessages.reduce((sum, m) => sum + m.amount, 0);
    const totalBridgedAmount = completedMessages
        .filter((m) => m.status === "SUCCESS")
        .reduce((sum, m) => sum + m.amount, 0);

    const result: BridgeStatusResult = {
        pendingMessages,
        completedMessages,
        totalPendingAmount,
        totalBridgedAmount,
        emergencyBridgeCount: allMessages.length,
        lastUpdated: new Date().toISOString(),
    };

    // Update cache
    statusCache = { data: result, timestamp: Date.now() };

    return result;
}
