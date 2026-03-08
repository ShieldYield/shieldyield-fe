import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, fallback, formatUnits, type Address } from "viem";
import { arbitrumSepolia } from "viem/chains";
import * as fs from "fs";
import { fetchBridgeStatus, type BridgeMessage } from "@/lib/bridge-status";

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
const DEFILLAMA_CACHE_TTL_MS = 60_000; // Increased to 60s for stability

// Known lending/yield protocols (exclude LP/AMM/perps)
const EXCLUDED_PROJECTS = new Set([
  "uniswap-v3", "uniswap-v4", "curve-dex", "balancer-v2",
  "pancakeswap-amm-v3", "gmx-v2-perps", "steer-protocol",
  "gamma", "beefy", "hermes-v2", "acryptos",
]);

async function fetchDefiLlamaApys(): Promise<DefiLlamaResult> {
  const empty: DefiLlamaResult = { apys: {}, yieldMaxTopPools: [] };

  // If cache is fresh, return it
  if (defiLlamaApyCache && Date.now() - defiLlamaApyCache.timestamp < DEFILLAMA_CACHE_TTL_MS) {
    return defiLlamaApyCache.data;
  }

  try {
    const res = await fetch(DEFILLAMA_POOLS_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store", 
      // Increase timeout to 15s for large 2MB+ payload
      signal: AbortSignal.timeout(15000),
    });
    
    if (!res.ok) {
      console.warn(`[portfolio/live] DeFiLlama API responded with ${res.status}`);
      // If fetch fails but we have an old cache, use it as fallback
      if (defiLlamaApyCache) return defiLlamaApyCache.data;
      return empty;
    }

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
    // On any fetch error (ENOTFOUND, timeout), return the last good cache if available
    if (defiLlamaApyCache) {
        console.log("[portfolio/live] Using stale DeFiLlama cache as fallback");
        return defiLlamaApyCache.data;
    }
    return empty;
  }
}

// ============================================================================
// Contract Addresses (Arbitrum Sepolia)
// ============================================================================

const SHIELD_VAULT = "0xE2b7f9E85ee0390B2c3bC874301CAeB941Fc88eB" as const;
const RISK_REGISTRY = "0xD5Ebe945197198cAE3846444f2c158981C7450F2" as const;

// Known adapter addresses on Arbitrum Sepolia → proper display names.
const KNOWN_ADAPTER_NAMES: Record<string, string> = {
  "0xc085b5604561dee55c15a002ffc8782450429635": "AaveAdapter",
  "0xd7069532cd6c4bca265aa12db46c68c56e596649": "CompoundAdapter",
  "0x35ccd4bf836ca9482ad7db9f66d68dca77f03857": "MorphoAdapter",
  "0xf481704d78a155b31083ecf580d678790fa3a1a4": "YieldMaxAdapter",
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
    name: "totalShares",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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
// Cache (45s) + Price Change Tracking (global, not per-wallet)
// ============================================================================

interface CachedResult {
  data: Record<string, unknown>;
  timestamp: number;
  wallet: string;
}

let cache: CachedResult | null = null;
const CACHE_TTL_MS = 45_000;

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
// viem Client with Fallback Transports
// ============================================================================

const client = createPublicClient({
  chain: arbitrumSepolia,
  transport: fallback([
    // Priority 1: User-defined RPC
    ...(process.env.ARBITRUM_SEPOLIA_RPC_URL ? [http(process.env.ARBITRUM_SEPOLIA_RPC_URL)] : []),
    // Priority 2: Official RPC
    http("https://sepolia-rollup.arbitrum.io/rpc"),
    // Priority 3: Public Fallbacks
    http("https://arbitrum-sepolia.blockpi.network/v1/rpc/public"),
    http("https://endpoints.omniatech.io/v1/arbitrum/sepolia/public"),
  ]),
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

  // Force bypass cache if frontend explicitly requests it (e.g. on scenario change)
  const isNoCache = request.headers.get("cache-control") === "no-cache";

  if (!isNoCache && cache && cache.wallet === walletLower && Date.now() - cache.timestamp < CACHE_TTL_MS) {
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
      {
        address: SHIELD_VAULT,
        abi: SHIELD_VAULT_ABI,
        functionName: "totalShares" as const,
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
    const totalVaultShares = vaultResults[4].status === "success" ? (vaultResults[4].result as bigint) : 0n;

    const userShares = userPosition?.totalShares ?? 0n;
    const userShareRatio = totalVaultShares > 0n ? Number(userShares) / Number(totalVaultShares) : 0;

    // Filter only active pools and build the adapter list dynamically
    const activeAdapters = poolAllocations.filter((p) => p.isActive).map(p => p.adapter);

    // Total balance in BnM (18 decimals)
    const totalValueUsd = Number(formatUnits(userBalance, 18));

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
        ? Number(formatUnits(userPosition.totalDeposited, 18)) * allocation / 100
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

    // Phase 3: Waterfall Accounting & Race Condition Mitigation
    let confirmedBaseBalance = 0;
    let pendingBridgeAmount = 0;
    let unclaimedBaseAmount = 0;
    let arrivedPooledAmount = 0; // Arrived on Base but not yet claimable
    let pendingBridgeMessages: BridgeMessage[] = [];
    let completedBridgeMessages: BridgeMessage[] = [];

    try {
      const currentBlock = await client.getBlockNumber();
      const lastDepositTime = userPosition ? Number(userPosition.lastDepositTime) : 0;
      
      // Mitigation: Estimate deposit block to prevent capturing older bridges
      const depositBlockThreshold = lastDepositTime > 0
        ? Number(currentBlock) - Math.floor((Date.now() / 1000 - lastDepositTime) * 4) - 500
        : Number(currentBlock);

      const [baseRes, bridgeData] = await Promise.all([
        fetch(`http://localhost:3000/api/base-safe-haven?wallet=${wallet}`, { signal: AbortSignal.timeout(5000) }).catch(() => null),
        fetchBridgeStatus({ wallet: wallet as string, noCache: isNoCache }).catch(() => null),
      ]);
      
      if (baseRes?.ok) {
        const baseData = await baseRes.json();
        confirmedBaseBalance = baseData.totalBalance ?? 0;
        unclaimedBaseAmount = baseData.unclaimedCrossChainFunds ?? 0;
      }
      
      if (bridgeData) {
        const isUserActive = userShares > 0n;

        const processMessage = (msg: BridgeMessage) => {
          const isSystem = msg.sender.includes("ShieldVault");
          
          if (isSystem) {
             // Race Condition Mitigation:
             // Ignore system bridges that occurred BEFORE user's last deposit.
             // These funds belong to previous shares holders.
             if (!isUserActive || msg.sourceBlockNumber < depositBlockThreshold) return null;
          }
          
          // Calculate user's proportional share of the bridge
          const userAmount = isSystem ? (msg.amount * userShareRatio) : msg.amount;
          if (userAmount < 0.000001) return null;

          return { ...msg, amount: userAmount };
        };

        const filteredPending = bridgeData.pendingMessages
          .map(processMessage)
          .filter((m): m is BridgeMessage => m !== null);

        const filteredCompleted = bridgeData.completedMessages
          .map(processMessage)
          .filter((m): m is BridgeMessage => m !== null);

        pendingBridgeAmount = filteredPending.reduce((sum, m) => sum + m.amount, 0);
        pendingBridgeMessages = filteredPending;
        completedBridgeMessages = filteredCompleted;

        // Waterfall State: Arrived Pooled
        // Messages marked SUCCESS in CCIP but not yet reflected in user's claimable balance
        // (Either Oracle delayed or user already claimed part of it)
        const arrivedOnBase = filteredCompleted
            .filter(m => m.status === 'SUCCESS')
            .reduce((sum, m) => sum + m.amount, 0);
        
        // If arrived amount is significantly higher than what contract says is claimable,
        // it means the Oracle (Sentinel) hasn't processed the latest batch yet.
        arrivedPooledAmount = Math.max(0, arrivedOnBase - unclaimedBaseAmount);
      }
    } catch (err) { 
      console.error("[portfolio/live] Waterfall sync failed:", err);
    }

    const globalTotalValueUsd = totalValueUsd + confirmedBaseBalance + pendingBridgeAmount + arrivedPooledAmount + unclaimedBaseAmount;

    const responseData = {
      totalValueUsd,
      globalTotalValueUsd,
      chainBreakdown: {
        arbitrum: totalValueUsd,
        base: confirmedBaseBalance,
        pendingBridge: pendingBridgeAmount,
        arrivedPooled: arrivedPooledAmount,
        unclaimedBase: unclaimedBaseAmount,
      },
      lastDepositTime: userPosition ? Number(userPosition.lastDepositTime) : 0,
      pendingBridgeMessages,
      completedBridgeMessages,
      totalChangePercent: totalChange.changePercent,
      totalChangeDirection: totalChange.changeDirection,
      adapters,
      riskScores,
      totalAssets: Number(formatUnits(totalAssets, 18)),
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