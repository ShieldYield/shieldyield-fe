import { NextResponse } from "next/server";
import { createPublicClient, http, type Address, erc20Abi } from "viem";
import { baseSepolia } from "viem/chains";

// Base Sepolia deployed contract addresses (with depositFor support)
const BASE_ADDRESSES = {
    shieldVault:     "0x220b8e0733e0E1eD90a44d9Bd81D558D685c0fE0" as Address,
    shieldBridge:    "0x4B8381d50A8D609A43060Fc19692289870afC80f" as Address,
    aaveAdapter:     "0xc8c06751384601300AfA12BeE12888f6dAf4A167" as Address,
    compoundAdapter: "0xc66627589c2d1Eeee420c1C2F4918747f5906106" as Address,
    morphoAdapter:   "0x35E683F8bc9Bf0ff63256F65bAb0dD62604ED85D" as Address,
    yieldMaxAdapter: "0xf7Bf7ddC5d261b60C25a291134FA1312912A599E" as Address,
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
] as const;

const client = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
});

async function readAdapter(name: string, address: Address) {
    try {
        const [breakdown, apy, isHealthy] = await Promise.all([
            client.readContract({ address, abi: ADAPTER_ABI, functionName: "getBalanceBreakdown" }),
            client.readContract({ address, abi: ADAPTER_ABI, functionName: "getCurrentAPY" }),
            client.readContract({ address, abi: ADAPTER_ABI, functionName: "isHealthy" }),
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

export async function GET() {
    try {
        const [aave, compound, morpho, yieldMax, bridgeCount, escrowBalanceRaw] = await Promise.all([
            readAdapter("AaveAdapter",     BASE_ADDRESSES.aaveAdapter),
            readAdapter("CompoundAdapter", BASE_ADDRESSES.compoundAdapter),
            readAdapter("MorphoAdapter",   BASE_ADDRESSES.morphoAdapter),
            readAdapter("YieldMaxAdapter", BASE_ADDRESSES.yieldMaxAdapter),
            client.readContract({
                address: BASE_ADDRESSES.shieldBridge,
                abi: SHIELD_BRIDGE_ABI,
                functionName: "emergencyBridgeCount",
            }).catch(() => 0n),
            client.readContract({
                address: "0x88A2d74F47a237a62e7A51cdDa67270CE381555e", // CCIP-BnM on Base Sepolia
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [BASE_ADDRESSES.shieldBridge],
            }).catch(() => 0n),
        ]);

        const escrowBalance = Number(escrowBalanceRaw) / 1e18;
        const adapters = [aave, compound, morpho, yieldMax];
        const totalBalance = adapters.reduce((s, a) => s + a.balance, 0) + escrowBalance;
        const primarySafeHaven = [aave, compound]; // Aave + Compound are the designated safe havens

        return NextResponse.json({
            chain: "Base Sepolia",
            chainId: 84532,
            shieldVault: BASE_ADDRESSES.shieldVault,
            shieldBridge: BASE_ADDRESSES.shieldBridge,
            emergencyBridgeCount: Number(bridgeCount),
            escrowBalance,
            totalBalance,
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
