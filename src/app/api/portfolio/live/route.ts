import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, formatUnits, type Address } from "viem";
import { arbitrumSepolia } from "viem/chains";

// ============================================================================
// Contract Addresses (Arbitrum Sepolia)
// ============================================================================

const SHIELD_VAULT = "0xcFBd47c63D284A8F824e586596Df4d5c57326c8B" as const;
const RISK_REGISTRY = "0xa23BE1297F836FF7D4E3297320ff16dbc7903e6D" as const;

const ADAPTERS: Record<string, Address> = {
  AaveAdapter: "0xB81961aA49d7E834404e299e688B3Dc09a5EFe5a",
  CompoundAdapter: "0xcc547a2B0f18b34095623809977D54cfe306BEBF",
  MorphoAdapter: "0x5f8A64Bc67f23b8d5d02c7CFE187AD42D59f1D59",
  YieldMaxAdapter: "0x5EbD6F3DA76C2B9C9d6aAC89DA08c388EaB2B3cb",
};

// ============================================================================
// Minimal ABIs
// ============================================================================

const SHIELD_VAULT_ABI = [
  {
    name: "getUserBalance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    name: "getUserPosition",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "totalDeposited", type: "uint256" },
          { name: "totalShares", type: "uint256" },
          { name: "lastDepositTime", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getPoolAllocations",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "adapter", type: "address" },
          { name: "tier", type: "uint8" },
          { name: "targetWeight", type: "uint256" },
          { name: "currentAmount", type: "uint256" },
          { name: "isActive", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "getTotalAssets",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "total", type: "uint256" }],
  },
] as const;

const ADAPTER_ABI = [
  {
    name: "getBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    name: "getCurrentAPY",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "apy", type: "uint256" }],
  },
  {
    name: "isHealthy",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "healthy", type: "bool" }],
  },
] as const;

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

// ============================================================================
// Threat Level Mapping
// ============================================================================

const THREAT_LEVELS = ["SAFE", "WATCH", "WARNING", "CRITICAL"] as const;

// ============================================================================
// Cache (15s) + Price Change Tracking (global, not per-wallet)
// ============================================================================

interface CachedResult {
  data: Record<string, unknown>;
  timestamp: number;
  wallet: string;
}

let cache: CachedResult | null = null;
const CACHE_TTL_MS = 15_000;

// Global in-memory store for previous adapter balances (vault-level, not per-user)
const previousBalances: Map<string, number> = new Map();
let previousTotalValue = 0;

function calcChange(current: number, previous: number): { changePercent: number; changeDirection: "up" | "down" | "neutral" } {
  if (previous === 0) return { changePercent: 0, changeDirection: "neutral" };
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct * 100) / 100;
  return {
    changePercent: Math.abs(rounded),
    changeDirection: rounded > 0 ? "up" : rounded < 0 ? "down" : "neutral",
  };
}

// ============================================================================
// viem Client
// ============================================================================

const rpcUrl =
  process.env.ARBITRUM_SEPOLIA_RPC_URL ||
  "https://sepolia-rollup.arbitrum.io/rpc";

const client = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(rpcUrl),
});

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  const walletLower = wallet.toLowerCase();

  // Check cache
  if (cache && cache.wallet === walletLower && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cache.data, { headers: { "X-Cache": "HIT" } });
  }

  try {
    const adapterEntries = Object.entries(ADAPTERS);

    // Batch 1: User balance, user position, pool allocations, total assets
    const vaultCalls = [
      {
        address: SHIELD_VAULT,
        abi: SHIELD_VAULT_ABI,
        functionName: "getUserBalance" as const,
        args: [wallet as Address],
      },
      {
        address: SHIELD_VAULT,
        abi: SHIELD_VAULT_ABI,
        functionName: "getUserPosition" as const,
        args: [wallet as Address],
      },
      {
        address: SHIELD_VAULT,
        abi: SHIELD_VAULT_ABI,
        functionName: "getPoolAllocations" as const,
      },
      {
        address: SHIELD_VAULT,
        abi: SHIELD_VAULT_ABI,
        functionName: "getTotalAssets" as const,
      },
    ];

    // Batch 2: Per-adapter reads (getBalance, getCurrentAPY, isHealthy) + risk scores
    const adapterCalls = adapterEntries.flatMap(([, addr]) => [
      { address: addr, abi: ADAPTER_ABI, functionName: "getBalance" as const },
      { address: addr, abi: ADAPTER_ABI, functionName: "getCurrentAPY" as const },
      { address: addr, abi: ADAPTER_ABI, functionName: "isHealthy" as const },
      {
        address: RISK_REGISTRY as Address,
        abi: RISK_REGISTRY_ABI,
        functionName: "getProtocolRisk" as const,
        args: [addr],
      },
    ]);

    const [vaultResults, adapterResults] = await Promise.all([
      client.multicall({ contracts: vaultCalls }),
      client.multicall({ contracts: adapterCalls }),
    ]);

    // Parse vault results
    const userBalance =
      vaultResults[0].status === "success" ? (vaultResults[0].result as bigint) : 0n;
    const userPosition =
      vaultResults[1].status === "success"
        ? (vaultResults[1].result as { totalDeposited: bigint; totalShares: bigint; lastDepositTime: bigint })
        : null;
    const totalAssets =
      vaultResults[3].status === "success" ? (vaultResults[3].result as bigint) : 0n;

    // Total balance in USDC (6 decimals)
    const totalValueUsd = Number(formatUnits(userBalance, 6));

    // Parse per-adapter results
    const adapters: Record<string, unknown> = {};
    const riskScores: Record<string, unknown> = {};
    let totalAdapterBalance = 0n;

    // Pre-calculate total adapter balance for allocation percentages
    for (let i = 0; i < adapterEntries.length; i++) {
      const baseIdx = i * 4;
      const balance =
        adapterResults[baseIdx].status === "success"
          ? (adapterResults[baseIdx].result as bigint)
          : 0n;
      totalAdapterBalance += balance;
    }

    for (let i = 0; i < adapterEntries.length; i++) {
      const [name, addr] = adapterEntries[i];
      const baseIdx = i * 4;

      const balance =
        adapterResults[baseIdx].status === "success"
          ? (adapterResults[baseIdx].result as bigint)
          : 0n;
      const apyBps =
        adapterResults[baseIdx + 1].status === "success"
          ? (adapterResults[baseIdx + 1].result as bigint)
          : 0n;
      const healthy =
        adapterResults[baseIdx + 2].status === "success"
          ? (adapterResults[baseIdx + 2].result as boolean)
          : true;
      const riskData =
        adapterResults[baseIdx + 3].status === "success"
          ? (adapterResults[baseIdx + 3].result as {
              riskScore: number;
              threatLevel: number;
              lastUpdated: bigint;
              isActive: boolean;
            })
          : null;

      const balanceUsd = Number(formatUnits(balance, 6));
      const principalUsd = userPosition
        ? Number(formatUnits(userPosition.totalDeposited, 6)) / adapterEntries.length
        : 0;
      const allocation =
        totalAdapterBalance > 0n
          ? Number((balance * 10000n) / totalAdapterBalance) / 100
          : 0;

      const prevBalance = previousBalances.get(name) ?? 0;
      const adapterChange = calcChange(balanceUsd, prevBalance);

      adapters[name] = {
        address: addr,
        balance: balanceUsd,
        apy: Number(apyBps) / 100, // basis points to percentage
        isHealthy: healthy,
        principal: principalUsd,
        accruedYield: Math.max(0, balanceUsd - principalUsd),
        allocation,
        changePercent: adapterChange.changePercent,
        changeDirection: adapterChange.changeDirection,
      };

      // Update global previous balance for next comparison
      previousBalances.set(name, balanceUsd);

      if (riskData) {
        riskScores[name] = {
          score: riskData.riskScore,
          level: THREAT_LEVELS[riskData.threatLevel] || "SAFE",
        };
      }
    }

    const totalChange = calcChange(totalValueUsd, previousTotalValue);
    previousTotalValue = totalValueUsd;

    const responseData = {
      totalValueUsd,
      totalChangePercent: totalChange.changePercent,
      totalChangeDirection: totalChange.changeDirection,
      adapters,
      riskScores,
      totalAssets: Number(formatUnits(totalAssets, 6)),
      lastUpdated: new Date().toISOString(),
    };

    // Cache
    cache = { data: responseData, timestamp: Date.now(), wallet: walletLower };

    return NextResponse.json(responseData, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, max-age=15",
      },
    });
  } catch (err: unknown) {
    console.error("[portfolio/live] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch portfolio data", details: String(err) },
      { status: 500 }
    );
  }
}
