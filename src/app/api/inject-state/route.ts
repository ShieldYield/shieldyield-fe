import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { arbitrumSepolia } from "viem/chains";

/**
 * GET /api/inject-state
 * ─────────────────────────────────────────────────────────────
 * Updated for Hackathon:
 * Reads risk levels directly from the Arbitrum Sepolia
 * RiskRegistry contract instead of a local mock server.
 * ─────────────────────────────────────────────────────────────
 */

export const dynamic = "force-dynamic";

const RISK_REGISTRY = "0xDd00b97Cd8Df07BbC95D9eAfb680A86358943C06" as const;

// Known adapters
const ADAPTERS: Record<string, Address> = {
  AaveAdapter: "0x2AB8a676Ca67bAB1C9e78f70C48b5b04eb288D8a",
  CompoundAdapter: "0x7816D0b6399CfA2e81AE3c07721EE43cb3b3c6c8",
  MorphoAdapter: "0x9D64139FEd95CFAd4d606aA8f145351068Cf36ac",
  YieldMaxAdapter: "0xf6b7306abe85B6B7236C4e5e79443773Ef13B4f3",
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
    try {
        const calls = Object.values(ADAPTERS).map((addr) => ({
            address: RISK_REGISTRY as Address,
            abi: RISK_REGISTRY_ABI,
            functionName: "getProtocolRisk" as const,
            args: [addr],
        }));

        const results = await client.multicall({ contracts: calls });

        // Build a scenario object mapping adapters to threat levels
        const activeThreats: Record<string, string> = {};
        const adapterNames = Object.keys(ADAPTERS);

        for (let i = 0; i < adapterNames.length; i++) {
            const res = results[i];
            const name = adapterNames[i];
            if (res.status === "success") {
                const data = res.result as { threatLevel: number };
                const level = THREAT_LEVELS[data.threatLevel] || "SAFE";
                // Only track protocols that are WARNING or CRITICAL
                if (level === "WARNING" || level === "CRITICAL") {
                    activeThreats[name] = level;
                }
            }
        }

        // Determine synthetic scenario based on active threats
        let scenario = null;
        if (activeThreats["YieldMaxAdapter"] === "CRITICAL") {
            scenario = "critical";
        } else if (activeThreats["YieldMaxAdapter"] === "WARNING") {
            scenario = "warning";
        } else if (Object.keys(activeThreats).length > 0) {
            scenario = "custom"; // Other threats detected
        }

        return NextResponse.json({
            scenario,
            details: activeThreats,
        });
    } catch (err) {
        console.error("inject-state fetch error:", err);
        return NextResponse.json({ scenario: null });
    }
}
