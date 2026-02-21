import { NextRequest, NextResponse } from "next/server";

/**
 * TVL History Endpoint — stores TVL snapshots and returns historical change%.
 *
 * CRE calls this endpoint each monitoring cycle to:
 * 1. Record the current TVL snapshot
 * 2. Get the TVL change% compared to a recent historical snapshot
 *
 * GET /api/tvl-history?tvl=<number>&ts=<timestamp>
 *   - Stores the snapshot and returns change% from previous snapshot
 *   - Uses GET so CRE DON consensus works (idempotent per timestamp window)
 *
 * GET /api/tvl-history (no params)
 *   - Returns full snapshot history
 */

interface TvlSnapshot {
    tvl: number;
    timestamp: number;
}

// In-memory storage — persists across requests while server is running
// Max 2880 entries = 24h at 30s intervals
const MAX_SNAPSHOTS = 2880;
const snapshots: TvlSnapshot[] = [];

// Dedup window: ignore duplicate reports within 15 seconds
const DEDUP_WINDOW_MS = 15_000;

// Comparison window: compare against snapshot from ~5 minutes ago (optimized for fast hackathon demo)
const COMPARE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function findComparisonSnapshot(
    currentTs: number
): TvlSnapshot | null {
    // Target: snapshot from ~1 hour ago
    const targetTs = currentTs - COMPARE_WINDOW_MS;

    // Find the snapshot closest to the target timestamp
    let best: TvlSnapshot | null = null;
    let bestDiff = Infinity;

    for (const snap of snapshots) {
        const diff = Math.abs(snap.timestamp - targetTs);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = snap;
        }
    }

    // If we don't have data old enough, use the oldest available snapshot
    if (!best && snapshots.length > 0) {
        best = snapshots[0]; // oldest
    }

    return best;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const tvlParam = searchParams.get("tvl");
    const tsParam = searchParams.get("ts");

    // If no params, return full history
    if (!tvlParam) {
        return NextResponse.json({
            snapshots: snapshots.slice(-100), // Last 100 entries
            count: snapshots.length,
            oldestTimestamp: snapshots.length > 0 ? snapshots[0].timestamp : null,
            newestTimestamp: snapshots.length > 0 ? snapshots[snapshots.length - 1].timestamp : null,
        });
    }

    const currentTvl = parseFloat(tvlParam);
    const currentTs = tsParam ? parseInt(tsParam, 10) : Math.floor(Date.now() / 1000);

    if (isNaN(currentTvl)) {
        return NextResponse.json(
            { error: "Invalid tvl parameter" },
            { status: 400 }
        );
    }

    // --- Dedup: don't store if a snapshot exists within the dedup window ---
    const lastSnapshot = snapshots.length > 0
        ? snapshots[snapshots.length - 1]
        : null;
    const isDuplicate = lastSnapshot &&
        Math.abs(currentTs * 1000 - lastSnapshot.timestamp * 1000) < DEDUP_WINDOW_MS;

    if (!isDuplicate) {
        // Store new snapshot
        snapshots.push({ tvl: currentTvl, timestamp: currentTs });

        // Trim to max size
        while (snapshots.length > MAX_SNAPSHOTS) {
            snapshots.shift();
        }
    }

    // --- Find comparison snapshot and compute change ---
    const comparisonSnapshot = findComparisonSnapshot(currentTs);

    let tvlChangePercent = 0;
    let comparisonTvl = currentTvl;
    let comparisonTimestamp = currentTs;
    let comparisonAgeMinutes = 0;

    if (comparisonSnapshot && comparisonSnapshot.timestamp !== currentTs) {
        comparisonTvl = comparisonSnapshot.tvl;
        comparisonTimestamp = comparisonSnapshot.timestamp;
        comparisonAgeMinutes = Math.round((currentTs - comparisonTimestamp) / 60);

        if (comparisonTvl > 0) {
            tvlChangePercent =
                ((currentTvl - comparisonTvl) / comparisonTvl) * 100;
        }
    }

    return NextResponse.json(
        {
            currentTvl,
            currentTimestamp: currentTs,
            previousTvl: comparisonTvl,
            previousTimestamp: comparisonTimestamp,
            tvlChangePercent: Math.round(tvlChangePercent * 100) / 100, // 2 decimal places
            comparisonAgeMinutes,
            snapshotCount: snapshots.length,
        },
        {
            headers: {
                "Cache-Control": "no-store", // Don't cache — each call records data
            },
        }
    );
}
