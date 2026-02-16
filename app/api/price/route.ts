import { NextResponse } from "next/server";
import { createClient, decodeReport } from "@chainlink/data-streams-sdk";
import type { DecodedV3Report } from "@chainlink/data-streams-sdk";

// Chainlink Data Streams Feed IDs (Arbitrum Sepolia testnet)
const FEEDS = {
    ETH_USD: "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782",
    BTC_USD: "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439",
    USDC_USD: "0x00036fe43f87884450b4c7e093cd5ed99cac6640d8c2000e6afc02c8838d0265",
};

const FALLBACK_PRICES = {
    ethUsd: 0,
    btcUsd: 0,
    usdcUsd: 1.0,
    timestamp: 0,
    source: "fallback" as const,
};

function bigintToPrice(value: bigint, decimals = 18): number {
    return Number(value) / 10 ** decimals;
}

function extractPrice(decoded: ReturnType<typeof decodeReport>): bigint {
    // Price feeds use V2/V3/V4 format which all have a `price` field
    if ("price" in decoded) {
        return decoded.price;
    }
    return BigInt(0);
}

export async function GET() {
    const apiKey = process.env.DS_API_KEY;
    const apiSecret = process.env.DS_API_SECRET;

    if (!apiKey || !apiSecret) {
        return NextResponse.json(
            { ...FALLBACK_PRICES, error: "Data Streams credentials not configured" },
            {
                status: 200,
                headers: { "Cache-Control": "public, max-age=10" },
            }
        );
    }

    try {
        const client = createClient({
            apiKey,
            userSecret: apiSecret,
            endpoint: "https://api.testnet-dataengine.chain.link",
            wsEndpoint: "wss://ws.testnet-dataengine.chain.link",
        });

        // Fetch all 3 feeds in parallel
        const [ethReport, btcReport, usdcReport] = await Promise.all([
            client.getLatestReport(FEEDS.ETH_USD),
            client.getLatestReport(FEEDS.BTC_USD),
            client.getLatestReport(FEEDS.USDC_USD),
        ]);

        // Decode reports to extract prices
        const ethDecoded = decodeReport(ethReport.fullReport, ethReport.feedID);
        const btcDecoded = decodeReport(btcReport.fullReport, btcReport.feedID);
        const usdcDecoded = decodeReport(usdcReport.fullReport, usdcReport.feedID);

        const result = {
            ethUsd: bigintToPrice(extractPrice(ethDecoded)),
            btcUsd: bigintToPrice(extractPrice(btcDecoded)),
            usdcUsd: bigintToPrice(extractPrice(usdcDecoded)),
            timestamp: Math.floor(Date.now() / 1000),
            source: "data-streams" as const,
        };

        return NextResponse.json(result, {
            headers: { "Cache-Control": "public, max-age=10" },
        });
    } catch (error) {
        console.error("Data Streams fetch error:", error);
        return NextResponse.json(
            {
                ...FALLBACK_PRICES,
                error: error instanceof Error ? error.message : "Unknown error",
            },
            {
                status: 200,
                headers: { "Cache-Control": "public, max-age=10" },
            }
        );
    }
}
