import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address, erc20Abi } from "viem";
import { baseSepolia } from "viem/chains";
import { fetchBridgeStatus } from "@/lib/bridge-status";

// Base Sepolia deployed contract addresses (with depositFor support)
const BASE_ADDRESSES = {
    shieldVault: "0xf723Cf2629A7461Ad92c7eF6cAD51cd853d332a7" as Address,
    shieldBridge: "0x83995931A5BE0cc67811ed1D4714F4eEE213EE8D" as Address,
    aaveAdapter: "0xb62Ea26b218166bfd1808E76BEF5222D7E4c5aCd" as Address,
    compoundAdapter: "0xaa862cddE53DCD2878Dc49B1c0618EA23eEcdF1B" as Address,
    morphoAdapter: "0x184B015698FB9Cd5f5c9CAE1cdBCe0d7E0e5Ee46" as Address,
    yieldMaxAdapter: "0x28B38104F3cD62EABE17E927d61DbC50B834b1B7" as Address,
};

const ADAPTER_ABI = [
    {
        name: "getBalanceBreakdown",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [
            { name: "principal", type: "uint256" },
            { name: "accruedYield", type: "uint256" },
            { name: "currentBalance", type: "uint256" },
        ],
    },
    {
        name: "getCurrentAPY",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "isHealthy",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "bool" }],
    },
] as const;

const SHIELD_BRIDGE_ABI = [
    {
        name: "emergencyBridgeCount",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "EmergencyBridgeInitiated",
        type: "event",
        inputs: [
            { name: "messageId", type: "bytes32", indexed: true },
            { name: "destinationChain", type: "uint64", indexed: true },
            { name: "token", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
            { name: "sender", type: "address", indexed: false },
        ],
    },
    {
        name: "EmergencyBridgeReceived",
        type: "event",
        inputs: [
            { name: "messageId", type: "bytes32", indexed: true },
            { name: "sourceChain", type: "uint64", indexed: true },
            { name: "token", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
        ],
    },
] as const;
const SHIELD_VAULT_ABI = [
    {
        name: "getUserBalance",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "user", type: "address" }],
        outputs: [{ name: "balance", type: "uint256" }],
    },
    {
        name: "crossChainClaims",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "user", type: "address" }],
        outputs: [{ name: "claim", type: "uint256" }],
    },
] as const;

const baseClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
});

async function readAdapter(name: string, address: Address) {
    try {
        const [breakdown, apy, isHealthy] = await Promise.all([
            baseClient.readContract({ address, abi: ADAPTER_ABI, functionName: "getBalanceBreakdown" }),
            baseClient.readContract({ address, abi: ADAPTER_ABI, functionName: "getCurrentAPY" }),
            baseClient.readContract({ address, abi: ADAPTER_ABI, functionName: "isHealthy" }),
        ]);
        const [principal, accruedYield, balance] = breakdown as [bigint, bigint, bigint];
        return {
            name,
            address,
            balance: Number(balance) / 1e18,
            principal: Number(principal) / 1e18,
            accruedYield: Number(accruedYield) / 1e18,
            apy: Number(apy) / 100,
            isHealthy: isHealthy as boolean,
        };
    } catch {
        return { name, address, balance: 0, principal: 0, accruedYield: 0, apy: 0, isHealthy: false };
    }
}

export async function GET(request: NextRequest) {
    const wallet = request.nextUrl.searchParams.get("wallet");

    try {
        const [aave, compound, morpho, yieldMax, bridgeCount, escrowBalanceRaw] = await Promise.all([
            readAdapter("AaveAdapter", BASE_ADDRESSES.aaveAdapter),
            readAdapter("CompoundAdapter", BASE_ADDRESSES.compoundAdapter),
            readAdapter("MorphoAdapter", BASE_ADDRESSES.morphoAdapter),
            readAdapter("YieldMaxAdapter", BASE_ADDRESSES.yieldMaxAdapter),
            baseClient.readContract({
                address: BASE_ADDRESSES.shieldBridge,
                abi: SHIELD_BRIDGE_ABI,
                functionName: "emergencyBridgeCount",
            }).catch(() => 0n),
            baseClient.readContract({
                address: "0x88A2d74F47a237a62e7A51cdDa67270CE381555e", // CCIP-BnM on Base Sepolia
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [BASE_ADDRESSES.shieldBridge],
            }).catch(() => 0n),
        ]);

        const escrowBalance = Number(escrowBalanceRaw) / 1e18;
        const adapters = [aave, compound, morpho, yieldMax];

        // Fetch CCIP pending balance via shared module (no localhost fetch — avoids deadlock)
        let ccipPendingBalance = 0;
        let pendingBridgeMessages: Array<{
            messageId: string;
            status: string;
            amount: number;
            destinationChain: string;
            ccipExplorerUrl: string;
        }> = [];
        try {
            // FIX: Pass the wallet to fetchBridgeStatus to filter pending funds correctly
            const bridgeData = await fetchBridgeStatus({ 
                wallet: wallet || undefined 
            });
            ccipPendingBalance = bridgeData.totalPendingAmount;
            pendingBridgeMessages = bridgeData.pendingMessages;
        } catch (err) {
            console.warn("[base-safe-haven] bridge status fetch failed:", err);
        }

        // Calculate global balance
        const globalTotalBalance = adapters.reduce((s, a) => s + a.balance, 0) + escrowBalance + ccipPendingBalance;

        let personalBalance = 0;
        let personalClaims = 0;
        const isZeroAddress = wallet === "0x0000000000000000000000000000000000000000";
        if (wallet && !isZeroAddress) {
            try {
                const [balanceRaw, claimsRaw] = await Promise.all([
                    baseClient.readContract({
                        address: BASE_ADDRESSES.shieldVault,
                        abi: SHIELD_VAULT_ABI,
                        functionName: "getUserBalance",
                        args: [wallet as Address],
                    }),
                    baseClient.readContract({
                        address: BASE_ADDRESSES.shieldVault,
                        abi: SHIELD_VAULT_ABI,
                        functionName: "crossChainClaims",
                        args: [wallet as Address],
                    }).catch(() => 0n)
                ]);
                personalBalance = Number(balanceRaw) / 1e18;
                personalClaims = Number(claimsRaw) / 1e18;
            } catch (err) {
                console.warn("[base-safe-haven] failed to read user balance or claims:", err);
            }
        }

        const totalBalance = (wallet && !isZeroAddress) ? (personalBalance + personalClaims) : 0;
        const primarySafeHaven = [aave, compound]; // Aave + Compound are the designated safe havens

        return NextResponse.json({
            chain: "Base Sepolia",
            chainId: 84532,
            shieldVault: BASE_ADDRESSES.shieldVault,
            shieldBridge: BASE_ADDRESSES.shieldBridge,
            emergencyBridgeCount: Number(bridgeCount),
            escrowBalance, // Keep for debugging, but UI should ignore
            ccipPendingBalance,
            pendingBridgeMessages,
            totalBalance, // This is now strictly specific per wallet
            unclaimedCrossChainFunds: personalClaims,
            adapters,
            safeHavenAdapters: primarySafeHaven,
            hasFunds: totalBalance > 0,
            ccipExplorer: "https://ccip.chain.link",
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: "Failed to read Base Sepolia state", details: err?.message },
            { status: 500 }
        );
    }
}
