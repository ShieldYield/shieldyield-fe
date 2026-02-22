import { NextResponse } from "next/server";
import {
    createPublicClient,
    http,
    formatUnits,
    encodeFunctionData,
    type Hex,
} from "viem";
import { arbitrumSepolia } from "viem/chains";

// ============================================================================
// Contract Addresses (Arbitrum Sepolia Testnet)
// ============================================================================

const AAVE_V3_POOL = "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff" as const;
const COMPOUND_V3_COMET =
    "0xd00749497dC219662057F755f11b2E4a8B3F0FDE2" as const;
const USDC_ASSET = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" as const;

// ============================================================================
// Constants
// ============================================================================

/** AAVE rates are in RAY (1e27) — divide by 1e25 to get percentage */
const RAY = 10n ** 27n;
/** Compound rates are per-second scaled by 1e18 */
const WAD = 10n ** 18n;
/** Seconds in a year for annualizing Compound per-second rates */
const SECONDS_PER_YEAR = 31_536_000n;
/** USDC has 6 decimals */
const USDC_DECIMALS = 6;
/** Cache TTL: 30 seconds — ensures DON nodes get identical data */
const CACHE_TTL_MS = 30_000;

// ============================================================================
// Minimal ABIs (only the functions we call)
// ============================================================================

/**
 * AAVE Pool ABI — used ONLY for encodeFunctionData / decodeFunctionResult.
 * We use raw `eth_call` instead of `readContract` because viem's readContract
 * tries to convert the `uint256 configuration` field to a JS Number, which
 * overflows for large values (e.g. 126192817812674733974402556n).
 */
const AAVE_POOL_ABI = [
    {
        name: "getReserveData",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "asset", type: "address" }],
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    { name: "configuration", type: "uint256" },
                    { name: "liquidityIndex", type: "uint128" },
                    { name: "currentLiquidityRate", type: "uint128" },
                    { name: "variableBorrowIndex", type: "uint128" },
                    { name: "currentVariableBorrowRate", type: "uint128" },
                    { name: "lastUpdateTimestamp", type: "uint40" },
                    { name: "id", type: "uint16" },
                    { name: "aTokenAddress", type: "address" },
                    { name: "variableDebtTokenAddress", type: "address" },
                    { name: "interestRateStrategyAddress", type: "address" },
                    { name: "accruedToTreasury", type: "uint128" },
                    { name: "unbacked", type: "uint128" },
                    { name: "isolationModeTotalDebt", type: "uint128" },
                ],
            },
        ],
    },
] as const;

const ERC20_ABI = [
    {
        name: "totalSupply",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
] as const;

const COMPOUND_COMET_ABI = [
    {
        name: "getUtilization",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "totalSupply",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "totalBorrow",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "getSupplyRate",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "utilization", type: "uint256" }],
        outputs: [{ name: "", type: "uint64" }],
    },
    {
        name: "getBorrowRate",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "utilization", type: "uint256" }],
        outputs: [{ name: "", type: "uint64" }],
    },
] as const;

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
// AAVE V3 Data Fetcher
// ============================================================================

interface AaveMetrics {
    totalSupplied: string;
    totalBorrowed: string;
    supplyApy: number;
    borrowApy: number;
    utilization: number;
}

async function fetchAaveMetrics(): Promise<AaveMetrics> {
    // Use raw eth_call + manual hex parsing to avoid viem's BigInt-to-Number
    // validation that overflows on the uint256 `configuration` field.
    // All viem decode functions (readContract, decodeFunctionResult,
    // decodeAbiParameters) trigger this validation in v2.46.2.
    const callData = encodeFunctionData({
        abi: AAVE_POOL_ABI,
        functionName: "getReserveData",
        args: [USDC_ASSET],
    });

    const rawResult = await client.call({
        to: AAVE_V3_POOL,
        data: callData,
    });

    if (!rawResult.data) {
        throw new Error("AAVE getReserveData returned empty data");
    }

    // Manual ABI decoding: each field occupies 32 bytes (64 hex chars).
    // ReserveData struct layout (13 fields × 32 bytes each):
    //   [0]  configuration           (uint256) — SKIP (causes overflow)
    //   [1]  liquidityIndex           (uint128)
    //   [2]  currentLiquidityRate     (uint128) — USED
    //   [3]  variableBorrowIndex      (uint128)
    //   [4]  currentVariableBorrowRate(uint128) — USED
    //   [5]  lastUpdateTimestamp      (uint40)
    //   [6]  id                       (uint16)
    //   [7]  aTokenAddress            (address) — USED
    //   [8]  variableDebtTokenAddress (address) — USED
    //   [9]  interestRateStrategyAddr (address)
    //   [10] accruedToTreasury        (uint128)
    //   [11] unbacked                 (uint128)
    //   [12] isolationModeTotalDebt   (uint128)
    const hex = rawResult.data.slice(2); // remove "0x" prefix
    const getWord = (index: number): string => hex.slice(index * 64, (index + 1) * 64);
    const toBigInt = (index: number): bigint => BigInt("0x" + getWord(index));
    const toAddress = (index: number): Hex => ("0x" + getWord(index).slice(24)) as Hex;

    const currentLiquidityRate = toBigInt(2);
    const currentVariableBorrowRate = toBigInt(4);
    const aTokenAddress = toAddress(7);
    const variableDebtTokenAddress = toAddress(8);

    // Step 2: Get total supplied and total borrowed via token totalSupply
    const [aTokenSupply, debtTokenSupply] = await client.multicall({
        contracts: [
            {
                address: aTokenAddress,
                abi: ERC20_ABI,
                functionName: "totalSupply",
            },
            {
                address: variableDebtTokenAddress,
                abi: ERC20_ABI,
                functionName: "totalSupply",
            },
        ],
    });

    const totalSupplied =
        aTokenSupply.status === "success"
            ? (aTokenSupply.result as bigint)
            : 0n;
    const totalBorrowed =
        debtTokenSupply.status === "success"
            ? (debtTokenSupply.result as bigint)
            : 0n;

    // Convert RAY rates to percentage: rate / 1e27 * 100
    const supplyApy =
        Number((currentLiquidityRate * 100n) / RAY) +
        Number((currentLiquidityRate * 100n) % RAY) / Number(RAY);
    const borrowApy =
        Number((currentVariableBorrowRate * 100n) / RAY) +
        Number((currentVariableBorrowRate * 100n) % RAY) / Number(RAY);

    // Calculate utilization: totalBorrowed / totalSupplied * 100
    const utilization =
        totalSupplied > 0n
            ? Number((totalBorrowed * 10000n) / totalSupplied) / 100
            : 0;

    return {
        totalSupplied: formatUnits(totalSupplied, USDC_DECIMALS),
        totalBorrowed: formatUnits(totalBorrowed, USDC_DECIMALS),
        supplyApy: Math.round(supplyApy * 100) / 100,
        borrowApy: Math.round(borrowApy * 100) / 100,
        utilization: Math.round(utilization * 100) / 100,
    };
}

// ============================================================================
// Compound V3 Data Fetcher
// ============================================================================

interface CompoundMetrics {
    totalSupply: string;
    totalBorrow: string;
    utilization: number;
    supplyApr: number;
    borrowApr: number;
}

async function fetchCompoundMetrics(): Promise<CompoundMetrics> {
    // Step 1: Batch read utilization, totalSupply, totalBorrow
    const [utilizationResult, totalSupplyResult, totalBorrowResult] =
        await client.multicall({
            contracts: [
                {
                    address: COMPOUND_V3_COMET,
                    abi: COMPOUND_COMET_ABI,
                    functionName: "getUtilization",
                },
                {
                    address: COMPOUND_V3_COMET,
                    abi: COMPOUND_COMET_ABI,
                    functionName: "totalSupply",
                },
                {
                    address: COMPOUND_V3_COMET,
                    abi: COMPOUND_COMET_ABI,
                    functionName: "totalBorrow",
                },
            ],
        });

    const utilization =
        utilizationResult.status === "success"
            ? (utilizationResult.result as bigint)
            : 0n;
    const totalSupply =
        totalSupplyResult.status === "success"
            ? (totalSupplyResult.result as bigint)
            : 0n;
    const totalBorrow =
        totalBorrowResult.status === "success"
            ? (totalBorrowResult.result as bigint)
            : 0n;

    // Step 2: Get supply and borrow rates using the utilization value
    const [supplyRateResult, borrowRateResult] = await client.multicall({
        contracts: [
            {
                address: COMPOUND_V3_COMET,
                abi: COMPOUND_COMET_ABI,
                functionName: "getSupplyRate",
                args: [utilization],
            },
            {
                address: COMPOUND_V3_COMET,
                abi: COMPOUND_COMET_ABI,
                functionName: "getBorrowRate",
                args: [utilization],
            },
        ],
    });

    const supplyRatePerSecond =
        supplyRateResult.status === "success"
            ? (supplyRateResult.result as bigint)
            : 0n;
    const borrowRatePerSecond =
        borrowRateResult.status === "success"
            ? (borrowRateResult.result as bigint)
            : 0n;

    // Convert per-second rate to annual percentage:
    // APR% = ratePerSecond * SECONDS_PER_YEAR / 1e18 * 100
    const supplyApr =
        Number((supplyRatePerSecond * SECONDS_PER_YEAR * 100n) / WAD) +
        Number((supplyRatePerSecond * SECONDS_PER_YEAR * 100n) % WAD) / Number(WAD);
    const borrowApr =
        Number((borrowRatePerSecond * SECONDS_PER_YEAR * 100n) / WAD) +
        Number((borrowRatePerSecond * SECONDS_PER_YEAR * 100n) % WAD) / Number(WAD);

    // Utilization: raw value is scaled by 1e18, convert to percentage
    const utilizationPercent = Number((utilization * 100n) / WAD);

    return {
        totalSupply: formatUnits(totalSupply, USDC_DECIMALS),
        totalBorrow: formatUnits(totalBorrow, USDC_DECIMALS),
        utilization: Math.round(utilizationPercent * 100) / 100,
        supplyApr: Math.round(supplyApr * 100) / 100,
        borrowApr: Math.round(borrowApr * 100) / 100,
    };
}

// ============================================================================
// API Route Handler
// ============================================================================

export async function GET() {
    // Check cache first
    const cached = getCachedData();
    if (cached) {
        return NextResponse.json(cached, {
            headers: {
                "X-Cache": "HIT",
                "Cache-Control": "public, max-age=30",
            },
        });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    let aave: AaveMetrics | null = null;
    let compound: CompoundMetrics | null = null;
    const errors: string[] = [];

    // Fetch both protocols concurrently — partial failure is OK
    const [aaveResult, compoundResult] = await Promise.allSettled([
        fetchAaveMetrics(),
        fetchCompoundMetrics(),
    ]);

    if (aaveResult.status === "fulfilled") {
        aave = aaveResult.value;
    } else {
        errors.push(`AAVE: ${aaveResult.reason?.message || "Unknown error"}`);
        console.error("[defi-metrics] AAVE fetch failed:", aaveResult.reason);
    }

    if (compoundResult.status === "fulfilled") {
        compound = compoundResult.value;
    } else {
        errors.push(
            `Compound: ${compoundResult.reason?.message || "Unknown error"}`
        );
        console.error(
            "[defi-metrics] Compound fetch failed:",
            compoundResult.reason
        );
    }

    // If both failed, return 503
    if (!aave && !compound) {
        return NextResponse.json(
            {
                error: "All protocol data fetches failed",
                details: errors,
                timestamp,
            },
            { status: 503 }
        );
    }

    const responseData = {
        timestamp,
        chain: "arbitrum-sepolia",
        aave,
        compound,
        ...(errors.length > 0 ? { warnings: errors } : {}),
    };

    // Cache the successful response
    setCachedData(responseData);

    return NextResponse.json(responseData, {
        headers: {
            "X-Cache": "MISS",
            "Cache-Control": "public, max-age=30",
        },
    });
}
