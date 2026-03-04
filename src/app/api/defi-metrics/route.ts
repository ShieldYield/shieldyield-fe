import { NextRequest, NextResponse } from "next/server";

// ============================================================================
// DeFiLlama Yields API
// Docs: https://yields.llama.fi/docs
// ============================================================================

const DEFILLAMA_POOLS_URL = "https://yields.llama.fi/pools";

/** Cache TTL: 30 seconds */
const CACHE_TTL_MS = 30_000;

// ============================================================================
// Pool Identifiers (DeFiLlama project slugs)
// Chain: "Arbitrum" (mainnet) — DeFiLlama doesn't cover testnets
// ============================================================================

const TARGET_CHAIN = "Arbitrum";
const SAFE_HAVEN_CHAIN = "Base"; // CCIP bridge destination when CRITICAL risk
const AAVE_PROJECT = "aave-v3";
const COMPOUND_PROJECT = "compound-v3";

// ============================================================================
// In-Memory Cache
// ============================================================================

interface CachedData {
    data: Record<string, unknown>;
    timestamp: number;
}

let cache: CachedData | null = null;

function getCachedData(): Record<string, unknown> | null {
    if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
        return cache.data;
    }
    return null;
}

function setCachedData(data: Record<string, unknown>): void {
    cache = { data, timestamp: Date.now() };
}

// ============================================================================
// Types
// ============================================================================

interface DefiLlamaPool {
    pool: string;
    chain: string;
    project: string;
    symbol: string;
    tvlUsd: number;
    apy: number;
    apyBase: number | null;
    apyReward: number | null;
    apyBaseBorrow: number | null;
    apyRewardBorrow: number | null;
    utilization: number | null;
    volumeUsd1d: number | null;
}

interface AaveMetrics {
    totalSupplied: string;
    totalBorrowed: string;
    supplyApy: number;
    borrowApy: number;
    utilization: number;
}

interface CompoundMetrics {
    totalSupply: string;
    totalBorrow: string;
    utilization: number;
    supplyApr: number;
    borrowApr: number;
}

// ============================================================================
// Helpers
// ============================================================================

function round2(n: number | null | undefined): number {
    return Math.round((n ?? 0) * 100) / 100;
}

/** Format USD TVL as a readable string (e.g. "12345678.50") */
function formatUsd(value: number | null | undefined): string {
    return (value ?? 0).toFixed(2);
}

/** Estimate total borrowed from TVL and utilization.
 *  In lending: TVL ≈ totalSupplied - totalBorrowed
 *  utilization = totalBorrowed / totalSupplied
 *  => totalBorrowed = TVL * utilization / (1 - utilization)
 */
function estimateTotalBorrowed(tvlUsd: number, utilizationPct: number): string {
    if (!utilizationPct || utilizationPct >= 100) return "0.00";
    const u = utilizationPct / 100;
    const totalBorrowed = (tvlUsd * u) / (1 - u);
    return totalBorrowed.toFixed(2);
}

// ============================================================================
// Data Transformers
// ============================================================================

function toAaveMetrics(pool: DefiLlamaPool): AaveMetrics {
    const utilizationPct = round2(pool.utilization);
    const tvl = pool.tvlUsd ?? 0;
    return {
        totalSupplied: formatUsd(tvl / (1 - (utilizationPct / 100 || 0))),
        totalBorrowed: estimateTotalBorrowed(tvl, utilizationPct),
        supplyApy: round2(pool.apy || pool.apyBase),
        borrowApy: round2(pool.apyBaseBorrow),
        utilization: utilizationPct,
    };
}

function toCompoundMetrics(pool: DefiLlamaPool): CompoundMetrics {
    const utilizationPct = round2(pool.utilization);
    const tvl = pool.tvlUsd ?? 0;
    return {
        totalSupply: formatUsd(tvl / (1 - (utilizationPct / 100 || 0))),
        totalBorrow: estimateTotalBorrowed(tvl, utilizationPct),
        utilization: utilizationPct,
        supplyApr: round2(pool.apy || pool.apyBase),
        borrowApr: round2(pool.apyBaseBorrow),
    };
}

// ============================================================================
// Pool Finder
// ============================================================================

function findPool(
    pools: DefiLlamaPool[],
    project: string,
    chain: string,
    symbolIncludes: string
): DefiLlamaPool | undefined {
    const sym = symbolIncludes.toUpperCase();
    const matches = pools.filter(
        (p) =>
            p.project === project &&
            p.chain === chain &&
            p.symbol.toUpperCase().includes(sym)
    );
    // Prefer exact symbol match (e.g. "USDC" over "SYRUPUSDC"), then pick highest APY
    return (
        matches.find((p) => p.symbol.toUpperCase() === sym) ??
        matches.sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))[0]
    );
}

// ============================================================================
// Simulation mock data (realistis tapi statis — tidak memanggil DeFiLlama)
// ============================================================================

const SIM_DEFI_METRICS = {
    timestamp: 0, // diisi saat request
    chain:     "arbitrum",
    source:    "simulation",
    aave: {
        totalSupplied: "15234567.00",
        totalBorrowed: "10668197.00",
        supplyApy:     4.52,
        borrowApy:     6.21,
        utilization:   70.0,
    },
    compound: {
        totalSupply: "8456789.00",
        totalBorrow: "5498913.00",
        utilization: 65.0,
        supplyApr:   3.87,
        borrowApr:   5.43,
    },
    safeHaven: {
        chain: "base",
        aave: {
            totalSupplied: "9123456.00",
            totalBorrowed: "5746978.00",
            supplyApy:     4.11,
            borrowApy:     5.89,
            utilization:   63.0,
        },
        compound: null,
    },
    _sim: true,
};

// ============================================================================
// API Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
    // ── Simulation mode bypass ────────────────────────────────────────────
    // Active when: ?sim=true param (sim-daemon) OR cookie sy-sim-mode=1 (FE toggle)
    const { searchParams } = new URL(request.url);
    const isSim =
        searchParams.get("sim") === "true" ||
        request.cookies.get("sy-sim-mode")?.value === "1";

    if (isSim) {
        // Cek apakah sim-inject sedang aktif → override utilization jika ada
        let injectedUtil: number | undefined;
        try {
            const injectResp = await fetch("http://localhost:3099/inject-state", {
                signal: AbortSignal.timeout(1_000),
            });
            if (injectResp.ok) {
                const state = await injectResp.json();
                injectedUtil = state.scenario?.utilization as number | undefined;
            }
        } catch { /* daemon/mock-server tidak jalan → gunakan static sim data */ }

        const simData = {
            ...SIM_DEFI_METRICS,
            timestamp: Math.floor(Date.now() / 1000),
            ...(injectedUtil !== undefined ? {
                aave:     { ...SIM_DEFI_METRICS.aave,     utilization: injectedUtil },
                compound: { ...SIM_DEFI_METRICS.compound, utilization: injectedUtil },
                _injected: true,
            } : {}),
        };

        return NextResponse.json(simData, { headers: { "X-Sim-Mode": "true", "X-Cache": "SIM" } });
    }
    // ─────────────────────────────────────────────────────────────────────

    // Return cached data if still fresh
    const cached = getCachedData();
    if (cached) {
        return NextResponse.json(cached, {
            headers: {
                "X-Cache": "HIT",
                "X-Source": "defillama",
                "Cache-Control": "public, max-age=30",
            },
        });
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Fetch all pools from DeFiLlama
    let pools: DefiLlamaPool[] = [];
    try {
        const res = await fetch(DEFILLAMA_POOLS_URL, {
            headers: { Accept: "application/json" },
            cache: "no-store", // disable Next.js native cache because response > 2MB
        });
        if (!res.ok) {
            throw new Error(`DeFiLlama responded with ${res.status}`);
        }
        const json = await res.json();
        pools = json.data ?? [];
    } catch (err: any) {
        console.error("[defi-metrics] DeFiLlama fetch failed:", err);
        return NextResponse.json(
            { error: "Failed to fetch DeFiLlama pool data", detail: err.message, timestamp },
            { status: 502 }
        );
    }

    // Find AAVE V3 USDC pool on Arbitrum
    const aaveRawPool = findPool(pools, AAVE_PROJECT, TARGET_CHAIN, "USDC");
    const aave: AaveMetrics | null = aaveRawPool ? toAaveMetrics(aaveRawPool) : null;

    // Find Compound V3 USDC pool on Arbitrum
    const compoundRawPool = findPool(pools, COMPOUND_PROJECT, TARGET_CHAIN, "USDC");
    const compound: CompoundMetrics | null = compoundRawPool ? toCompoundMetrics(compoundRawPool) : null;

    // CCIP Safe Haven: Aave & Compound on Base (destination when CRITICAL risk triggers bridge)
    const aaveBaseRawPool = findPool(pools, AAVE_PROJECT, SAFE_HAVEN_CHAIN, "USDC");
    const aaveBase: AaveMetrics | null = aaveBaseRawPool ? toAaveMetrics(aaveBaseRawPool) : null;

    const compoundBaseRawPool = findPool(pools, COMPOUND_PROJECT, SAFE_HAVEN_CHAIN, "USDC");
    const compoundBase: CompoundMetrics | null = compoundBaseRawPool ? toCompoundMetrics(compoundBaseRawPool) : null;

    if (!aave && !compound) {
        console.warn("[defi-metrics] No matching pools found on DeFiLlama for chain:", TARGET_CHAIN);
    }

    const responseData = {
        timestamp,
        chain: TARGET_CHAIN.toLowerCase(),
        source: "defillama",
        aave,
        compound,
        safeHaven: {
            chain: SAFE_HAVEN_CHAIN.toLowerCase(),
            aave: aaveBase,
            compound: compoundBase,
        },
        ...(aaveRawPool ? { _aavePool: aaveRawPool.pool } : {}),
        ...(compoundRawPool ? { _compoundPool: compoundRawPool.pool } : {}),
    };

    setCachedData(responseData as Record<string, unknown>);

    return NextResponse.json(responseData, {
        headers: {
            "X-Cache": "MISS",
            "X-Source": "defillama",
            "Cache-Control": "public, max-age=30",
        },
    });
}
