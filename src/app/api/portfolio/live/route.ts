import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, formatUnits, type Address } from "viem";
import { arbitrumSepolia } from "viem/chains";
import * as fs from "fs";

// ============================================================================
// DeFiLlama APY Integration
// Fetch real-world APY for each adapter from DeFiLlama yields API.
// YieldMax = highest APY found across all USDC pools on Arbitrum.
// ============================================================================

const DEFILLAMA_POOLS_URL = "https://yields.llama.fi/pools";

// DeFiLlama project slugs for each adapter (try multiple slugs per protocol)
const ADAPTER_DEFILLAMA_PROJECTS: Record<string, string[]> = {
  AaveAdapter: ["aave-v3"],
  CompoundAdapter: ["compound-v3"],
  MorphoAdapter: ["morpho-v1"],
};

// For adapters that are mockups on testnet, fetch APY reference from another chain.
// MorphoAdapter is deployed as a mockup on Arbitrum Sepolia — real morpho-blue lives on Ethereum.
const ADAPTER_CHAIN_OVERRIDE: Record<string, string> = {
  MorphoAdapter: "Ethereum",
};

export interface YieldPool {
  protocol: string;
  apy: number;
}

interface DefiLlamaResult {
  apys: Record<string, number>;
  yieldMaxTopPools: YieldPool[];
}

let defiLlamaApyCache: { data: DefiLlamaResult; timestamp: number } | null = null;
const DEFILLAMA_CACHE_TTL_MS = 30_000;

// Known lending/yield protocols (exclude LP/AMM/perps)
const EXCLUDED_PROJECTS = new Set([
  "uniswap-v3", "uniswap-v4", "curve-dex", "balancer-v2",
  "pancakeswap-amm-v3", "gmx-v2-perps", "steer-protocol",
  "gamma", "beefy", "hermes-v2", "acryptos",
]);

async function fetchDefiLlamaApys(): Promise<DefiLlamaResult> {
  const empty: DefiLlamaResult = { apys: {}, yieldMaxTopPools: [] };

  if (defiLlamaApyCache && Date.now() - defiLlamaApyCache.timestamp < DEFILLAMA_CACHE_TTL_MS) {
    return defiLlamaApyCache.data;
  }

  try {
    const res = await fetch(DEFILLAMA_POOLS_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store", // disable Next.js native cache because response > 2MB
    });
    if (!res.ok) return empty;

    const { data: pools } = await res.json();

    const round2 = (n: number) => Math.round((n ?? 0) * 100) / 100;

    // Filter: pure USDC pools on Arbitrum (not pairs, not perps, sane APY)
    const usdcPools: Array<{ project: string; symbol: string; apy: number; apyBase: number | null }> =
      pools.filter((p: { chain: string; symbol: string; project: string; apy: number }) =>
        p.chain === "Arbitrum" &&
        p.symbol.toUpperCase() === "USDC" &&      // exact match, not WETH-USDC pairs
        !EXCLUDED_PROJECTS.has(p.project) &&
        (p.apy ?? 0) > 0 &&
        (p.apy ?? 0) < 50                          // filter outliers
      );

    // Per-protocol APY — only set if pool found → missing = fallback to on-chain
    const apys: Record<string, number> = {};
    for (const [adapterName, slugs] of Object.entries(ADAPTER_DEFILLAMA_PROJECTS)) {
      // Try Arbitrum first
      let pool = usdcPools.find((p) => slugs.includes(p.project));

      // If not found on Arbitrum and adapter has a chain override, search that chain
      if (!pool && ADAPTER_CHAIN_OVERRIDE[adapterName]) {
        const overrideChain = ADAPTER_CHAIN_OVERRIDE[adapterName];
        // Use .includes("USDC") — morpho-blue pools may have symbols like "USDC (WETH)"
        const crossChainPool = pools.find(
          (p: { chain: string; symbol: string; project: string; apy: number }) =>
            p.chain === overrideChain &&
            p.symbol.toUpperCase().includes("USDC") &&
            slugs.includes(p.project) &&
            (p.apy ?? 0) > 0 &&
            (p.apy ?? 0) < 50
        );
        if (crossChainPool) {
          console.log(`[portfolio/live] ${adapterName} cross-chain (${overrideChain}): ${crossChainPool.project} ${crossChainPool.symbol} APY=${crossChainPool.apy}`);
          pool = crossChainPool;
        } else {
          console.warn(`[portfolio/live] ${adapterName} not found on ${overrideChain}, falling back to on-chain APY`);
        }
      }

      if (pool) {
        apys[adapterName] = round2(pool.apy || pool.apyBase || 0);
      }
    }

    // YieldMax = top 5 Arbitrum USDC pools sorted by APY desc
    const sorted = [...usdcPools].sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));
    const yieldMaxTopPools: YieldPool[] = sorted.slice(0, 5).map((p) => ({
      protocol: p.project,
      apy: round2(p.apy),
    }));

    // YieldMax APY = highest pool APY
    if (yieldMaxTopPools.length > 0) {
      apys["YieldMaxAdapter"] = yieldMaxTopPools[0].apy;
    }

    const result: DefiLlamaResult = { apys, yieldMaxTopPools };
    defiLlamaApyCache = { data: result, timestamp: Date.now() };
    return result;
  } catch (err) {
    console.error("[portfolio/live] DeFiLlama fetch failed:", err);
    return empty;
  }
}

// ============================================================================
// Contract Addresses (Arbitrum Sepolia)
// ============================================================================

const SHIELD_VAULT = "0x603172402CE953f2a92ded983ae5b822865F0386" as const;
const RISK_REGISTRY = "0xA94a0B4cB857Fc39E3054A9D4b42CA5897aa7E35" as const;

// Known adapter addresses on Arbitrum Sepolia → proper display names.
// Contracts return "_0xXXXX" (hex prefix) instead of their protocol name,
// so we resolve here before falling back to the contract's name() return value.
const KNOWN_ADAPTER_NAMES: Record<string, string> = {
  "0x0f2ed4a651d935aed42899034165101565670085": "AaveAdapter",
  "0xbf71472d08b7bec6021d63961f6102b848977865": "CompoundAdapter",
  "0x3ce790afe8868f825da2a085e27db9f0a06055c5": "MorphoAdapter",
  "0xe68cf3ddde8cd12e8f2b7bf28b80fff2a41bb817": "YieldMaxAdapter",
};

// We no longer hardcode ADAPTERS here, we fetch them dynamically from ShieldVault!
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
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
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

  // ── SIMULATION MODE: If CLI demo script is running, serve its state ──
  const SIM_FILE = "/tmp/shieldyield-simulation.json";
  try {
    if (fs.existsSync(SIM_FILE)) {
      const raw = fs.readFileSync(SIM_FILE, "utf-8");
      const simState = JSON.parse(raw);
      if (simState.active) {
        console.log(`[portfolio/live] 🎬 SIMULATION MODE — step ${simState.step}: ${simState.stepLabel}`);
        return NextResponse.json({
          totalValueUsd: simState.totalValueUsd,
          totalChangePercent: simState.totalChangePercent ?? 0,
          totalChangeDirection: simState.totalChangeDirection ?? "neutral",
          adapters: simState.adapters,
          riskScores: simState.riskScores,
          totalAssets: simState.totalAssets ?? simState.totalValueUsd,
          lastUpdated: simState.lastUpdated,
          simulation: true,
          simulationStep: simState.step,
          simulationLabel: simState.stepLabel,
        }, {
          headers: { "X-Cache": "SIM", "X-Simulation": "true" },
        });
      }
    }
  } catch { /* simulation file not present or invalid — continue with real data */ }

  // Check cache
  if (cache && cache.wallet === walletLower && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cache.data, { headers: { "X-Cache": "HIT" } });
  }

  try {
    // Phase 1: Fetch active pool allocations and general vault data
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

    const vaultResults = await client.multicall({ contracts: vaultCalls });

    // Parse vault results
    const userBalance = vaultResults[0].status === "success" ? (vaultResults[0].result as bigint) : 0n;
    const userPosition = vaultResults[1].status === "success"
      ? (vaultResults[1].result as { totalDeposited: bigint; totalShares: bigint; lastDepositTime: bigint })
      : null;
    const poolAllocations = vaultResults[2].status === "success"
      ? (vaultResults[2].result as ReadonlyArray<{ adapter: Address; tier: number; targetWeight: bigint; currentAmount: bigint; isActive: boolean }>)
      : [];
    const totalAssets = vaultResults[3].status === "success" ? (vaultResults[3].result as bigint) : 0n;

    // Filter only active pools and build the adapter list dynamically
    const activeAdapters = poolAllocations.filter((p) => p.isActive).map(p => p.adapter);

    // Total balance in USDC (6 decimals)
    const totalValueUsd = Number(formatUnits(userBalance, 6));

    // Phase 2: Fetch adapter specific details (balance, APY, health, name, risk) & DeFiLlama  
    const adapterCalls = activeAdapters.flatMap((addr) => [
      { address: addr, abi: ADAPTER_ABI, functionName: "name" as const },
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

    const [adapterResults, defiLlama] = await Promise.all([
      client.multicall({ contracts: adapterCalls }),
      fetchDefiLlamaApys(),
    ]);

    const defiLlamaApys = defiLlama.apys;
    const yieldMaxTopPools = defiLlama.yieldMaxTopPools;

    // Parse per-adapter results
    const adapters: Record<string, unknown> = {};
    const riskScores: Record<string, unknown> = {};

    // Build allocation map from poolAllocations (vault's own accounting — correct source of truth).
    // adapter.getBalance() returns the TOTAL balance for ALL users on the protocol,
    // not the vault's share. pool.currentAmount tracks what the vault actually deposited.
    const poolAllocationMap = new Map<string, { currentAmount: bigint; targetWeight: bigint }>();
    let totalCurrentAmount = 0n;
    let totalTargetWeight = 0n;
    for (const pool of poolAllocations) {
      if (pool.isActive) {
        poolAllocationMap.set(pool.adapter.toLowerCase(), {
          currentAmount: pool.currentAmount,
          targetWeight: pool.targetWeight,
        });
        totalCurrentAmount += pool.currentAmount;
        totalTargetWeight += pool.targetWeight;
      }
    }

    for (let i = 0; i < activeAdapters.length; i++) {
      const addr = activeAdapters[i];
      const baseIdx = i * 5;

      const nameObj = adapterResults[baseIdx];
      const contractRealName = nameObj.status === "success" && typeof nameObj.result === "string"
        ? nameObj.result
        : `Adapter_${addr.slice(0, 6)}`;

      // Fix: contracts on testnet return "_0xXXXX" instead of proper protocol names.
      // Resolve via known address mapping first, then fall back to contract name.
      const resolvedName =
        KNOWN_ADAPTER_NAMES[addr.toLowerCase()] ??
        (contractRealName.endsWith("Adapter") ? contractRealName : `${contractRealName}Adapter`);
      const name = resolvedName;

      const balance =
        adapterResults[baseIdx + 1].status === "success"
          ? (adapterResults[baseIdx + 1].result as bigint)
          : 0n;
      const apyBps =
        adapterResults[baseIdx + 2].status === "success"
          ? (adapterResults[baseIdx + 2].result as bigint)
          : 0n;
      const healthy =
        adapterResults[baseIdx + 3].status === "success"
          ? (adapterResults[baseIdx + 3].result as boolean)
          : true;
      const riskData =
        adapterResults[baseIdx + 4].status === "success"
          ? (adapterResults[baseIdx + 4].result as {
            riskScore: number;
            threatLevel: number;
            lastUpdated: bigint;
            isActive: boolean;
          })
          : null;

      // Use vault's own accounting (pool.currentAmount) for allocation %.
      // adapter.getBalance() is the total for ALL users; currentAmount is what the vault deposited.
      const poolData = poolAllocationMap.get(addr.toLowerCase());
      const currentAmount = poolData?.currentAmount ?? 0n;
      const targetWeight = poolData?.targetWeight ?? 0n;

      // Target allocation from contract's configured weights (e.g. 25%, 25%, 30%, 20%)
      const targetAllocation = totalTargetWeight > 0n
        ? Number((targetWeight * 10000n) / totalTargetWeight) / 100
        : 0;

      // Allocation based on actual funds the vault has in this adapter.
      // Fall back to targetAllocation if currentAmount not yet populated (no funds distributed yet).
      const allocation = totalCurrentAmount > 0n
        ? Number((currentAmount * 10000n) / totalCurrentAmount) / 100
        : targetAllocation;

      // User's actual share in this adapter
      const userAdapterBalance = totalValueUsd * allocation / 100;

      // Principal proportional to this adapter's allocation
      const principalUsd = userPosition
        ? Number(formatUnits(userPosition.totalDeposited, 6)) * allocation / 100
        : 0;

      const accruedYield = Math.max(0, userAdapterBalance - principalUsd);

      const prevBalance = previousBalances.get(name) ?? 0;
      const adapterChange = calcChange(userAdapterBalance, prevBalance);

      // Use DeFiLlama APY if available, fallback to on-chain value
      const onChainApy = Number(apyBps) / 100;
      const apy = defiLlamaApys[name] ?? onChainApy;

      adapters[name] = {
        address: addr,
        balance: userAdapterBalance,
        apy,
        isHealthy: healthy,
        principal: principalUsd,
        accruedYield,
        allocation,        // actual current % (based on pool.currentAmount)
        targetAllocation,  // configured target % (based on pool.targetWeight)
        changePercent: adapterChange.changePercent,
        changeDirection: adapterChange.changeDirection,
        ...(name === "YieldMaxAdapter" && yieldMaxTopPools.length > 0
          ? { topPools: yieldMaxTopPools }
          : {}),
      };

      // Update global previous balance for next comparison
      previousBalances.set(name, userAdapterBalance);

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