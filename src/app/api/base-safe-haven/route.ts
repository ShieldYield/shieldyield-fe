import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";

// Base Sepolia deployed contract addresses (with depositFor support)
const BASE_ADDRESSES = {
    shieldVault:     "0x61A40b866cAE11aC17986FbEeb9c700f4c8F088B" as Address,
    shieldBridge:    "0xE665F22b138191Cf6B9C534f8206D05A09d016b5" as Address,
    aaveAdapter:     "0xe7A9d43cb9D751995E18884D58a6D5fE53B479F2" as Address,
    compoundAdapter: "0xF32aF905922fbCcF5fCe4B843115F70fE28C6c34" as Address,
    morphoAdapter:   "0xe99FeF6a4670597053544F1923B6485ba9DeA27E" as Address,
    yieldMaxAdapter: "0xC7e1F2d8B24F1740e0b7b1Bb5a7E41633BE361FA" as Address,
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
            balance: Number(balance) / 1e6,
            principal: Number(principal) / 1e6,
            accruedYield: Number(accruedYield) / 1e6,
            apy: Number(apy) / 100,
            isHealthy: isHealthy as boolean,
        };
    } catch {
        return { name, address, balance: 0, principal: 0, accruedYield: 0, apy: 0, isHealthy: false };
    }
}

export async function GET() {
    try {
        const [aave, compound, morpho, yieldMax, bridgeCount] = await Promise.all([
            readAdapter("AaveAdapter",     BASE_ADDRESSES.aaveAdapter),
            readAdapter("CompoundAdapter", BASE_ADDRESSES.compoundAdapter),
            readAdapter("MorphoAdapter",   BASE_ADDRESSES.morphoAdapter),
            readAdapter("YieldMaxAdapter", BASE_ADDRESSES.yieldMaxAdapter),
            client.readContract({
                address: BASE_ADDRESSES.shieldBridge,
                abi: SHIELD_BRIDGE_ABI,
                functionName: "emergencyBridgeCount",
            }).catch(() => 0n),
        ]);

        const adapters = [aave, compound, morpho, yieldMax];
        const totalBalance = adapters.reduce((s, a) => s + a.balance, 0);
        const primarySafeHaven = [aave, compound]; // Aave + Compound are the designated safe havens

        return NextResponse.json({
            chain: "Base Sepolia",
            chainId: 84532,
            shieldVault: BASE_ADDRESSES.shieldVault,
            shieldBridge: BASE_ADDRESSES.shieldBridge,
            emergencyBridgeCount: Number(bridgeCount),
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
