import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { arbitrumSepolia } from "viem/chains";

/**
 * GET /api/inject-state
 * ─────────────────────────────────────────────────────────────
 * Priority:
 * 1. Mock variance server (port 3099) — for demo inject via CLI
 *    (bun sim:inject-medium / bun sim:inject-critical)
 *    → immediate FE reaction, no chain write needed
 * 2. RiskRegistry on-chain — real scores from CRE daemon
 * ─────────────────────────────────────────────────────────────
 */

export const dynamic = "force-dynamic";

const MOCK_SERVER = "http://localhost:3099";

// Maps injected scenario type → which adapter shows the threat on dashboard
const SCENARIO_THREAT: Record<string, Record<string, string>> = {
    warning: { MorphoAdapter: "WARNING" },    // sim-inject-medium: AI score 75 on Morpho
    critical: { YieldMaxAdapter: "CRITICAL" }, // sim-inject-critical: TVL -25.5% on YieldMax
};

const RISK_REGISTRY = "0xD5Ebe945197198cAE3846444f2c158981C7450F2" as const;

// Known adapters
const ADAPTERS: Record<string, Address> = {
    AaveAdapter: "0xC085b5604561DeE55c15a002fFc8782450429635",
    CompoundAdapter: "0xD7069532cD6c4Bca265aA12db46c68c56e596649",
    MorphoAdapter: "0x35cCD4Bf836ca9482Ad7DB9f66d68Dca77F03857",
    YieldMaxAdapter: "0xF481704d78A155B31083ecF580D678790FA3A1a4",
};

const RISK_REGISTRY_ABI = [
    {
        name: "getProtocolRisk",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "protocol", type: "address" }],
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    { name: "riskScore", type: "uint8" },
                    { name: "threatLevel", type: "uint8" },
                    { name: "lastUpdated", type: "uint256" },
                    { name: "isActive", type: "bool" },
                ],
            },
        ],
    },
] as const;

const THREAT_LEVELS = ["SAFE", "WATCH", "WARNING", "CRITICAL"] as const;

const rpcUrl =
    process.env.ARBITRUM_SEPOLIA_RPC_URL ||
    "https://sepolia-rollup.arbitrum.io/rpc";

const client = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(rpcUrl),
});

export async function GET() {
    // ── Fall back to RiskRegistry on-chain (real CRE daemon scores) ──
    try {
        const calls = Object.values(ADAPTERS).map((addr) => ({
            address: RISK_REGISTRY as Address,
            abi: RISK_REGISTRY_ABI,
            functionName: "getProtocolRisk" as const,
            args: [addr],
        }));

        const results = await client.multicall({ contracts: calls });

        const activeThreats: Record<string, string> = {};
        const adapterNames = Object.keys(ADAPTERS);

        for (let i = 0; i < adapterNames.length; i++) {
            const res = results[i];
            const name = adapterNames[i];
            if (res.status === "success") {
                const data = res.result as { threatLevel: number };
                const level = THREAT_LEVELS[data.threatLevel] || "SAFE";
                if (level === "WARNING" || level === "CRITICAL") {
                    activeThreats[name] = level;
                }
            }
        }

        let scenario = null;
        if (activeThreats["YieldMaxAdapter"] === "CRITICAL") {
            scenario = "critical";
        } else if (activeThreats["MorphoAdapter"] === "WARNING") {
            scenario = "warning";
        } else if (Object.keys(activeThreats).length > 0) {
            scenario = "custom";
        }

        return NextResponse.json({ scenario, details: activeThreats, _source: "chain" });
    } catch (err) {
        console.error("inject-state fetch error:", err);
        return NextResponse.json({ scenario: null });
    }
}
