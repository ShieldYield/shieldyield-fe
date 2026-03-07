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
    warning:  { MorphoAdapter: "WARNING" },    // sim-inject-medium: AI score 75 on Morpho
    critical: { YieldMaxAdapter: "CRITICAL" }, // sim-inject-critical: TVL -25.5% on YieldMax
};

const RISK_REGISTRY = "0x28B38104F3cD62EABE17E927d61DbC50B834b1B7" as const;

// Known adapters
const ADAPTERS: Record<string, Address> = {
  AaveAdapter: "0x8BdCad76328f00AB9A0712E8292fc1a1aDCaa82a",
  CompoundAdapter: "0xF2F0fa5fC187cFE6538d72C86ccCADa996956aAA",
  MorphoAdapter: "0x3f5b509a1d59814567fe370a471463c3AEa38400",
  YieldMaxAdapter: "0xaFD04A3A43a8B8d4523e3F1031071D1D378D8096",
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
    // ── 1. Check mock variance server first (CLI inject: bun sim:inject-*) ──
    try {
        const mockRes = await fetch(`${MOCK_SERVER}/inject-state`, {
            signal: AbortSignal.timeout(1_000),
        });
        if (mockRes.ok) {
            const mockData = await mockRes.json() as { scenario?: { type?: string } | null };
            const scenarioType = mockData.scenario?.type;
            if (scenarioType && SCENARIO_THREAT[scenarioType]) {
                return NextResponse.json({
                    scenario: scenarioType,
                    details: SCENARIO_THREAT[scenarioType],
                    _source: "mock",
                });
            }
        }
    } catch {
        // mock server not running → fall through to on-chain
    }

    // ── 2. Fall back to RiskRegistry on-chain (real CRE daemon scores) ──
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
