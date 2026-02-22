import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * POST /api/monitoring/snapshot
 * Called by CRE sentinel-scan after each monitoring run.
 * Persists MonitoringResult as PortfolioSnapshot + MonitoringLogs.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { walletAddress, adapters, riskScores, anomalies, offchain } = body;

        if (!walletAddress) {
            return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
        }

        // Upsert user
        const { data: user, error: userErr } = await supabase
            .from("users")
            .upsert({ wallet_address: walletAddress }, { onConflict: "wallet_address" })
            .select("id")
            .single();

        if (userErr || !user) {
            return NextResponse.json({ error: userErr?.message || "Failed to upsert user" }, { status: 500 });
        }

        // Build adapter breakdown
        const adapterData: Record<string, any> = {};
        const totalBalance = (adapters || []).reduce(
            (sum: number, a: any) => sum + Number(a.balance || 0), 0);

        for (const adapter of adapters || []) {
            const balance = Number(adapter.balance || 0);
            adapterData[adapter.name] = {
                address: adapter.address,
                balance: balance / 1e6,
                apy: Number(adapter.apy || 0) / 100,
                isHealthy: adapter.isHealthy,
                principal: Number(adapter.principal || 0) / 1e6,
                accruedYield: Number(adapter.accruedYield || 0) / 1e6,
                allocation: totalBalance > 0 ? (balance / totalBalance) * 100 : 0,
            };
        }

        const totalValueUsd = (adapters || []).reduce(
            (sum: number, a: any) => sum + Number(a.balance || 0) / 1e6 * (offchain?.prices?.usdcUsd || 1), 0);

        // Save portfolio snapshot
        const { data: snapshot, error: snapErr } = await supabase
            .from("portfolio_snapshots")
            .insert({
                user_id: user.id,
                total_value_usd: totalValueUsd,
                adapters: adapterData,
                risk_scores: riskScores || {},
            })
            .select("id")
            .single();

        if (snapErr) {
            return NextResponse.json({ error: snapErr.message }, { status: 500 });
        }

        // Save anomaly logs
        const logInserts: any[] = [];
        if (anomalies?.length) {
            for (const anomaly of anomalies) {
                logInserts.push({
                    user_id: user.id,
                    event_type: "ANOMALY",
                    severity: anomaly.severity,
                    adapter: anomaly.adapter,
                    message: anomaly.message,
                    metadata: { type: anomaly.type },
                });
            }
        }

        // Always log RISK_UPDATE
        logInserts.push({
            user_id: user.id,
            event_type: "RISK_UPDATE",
            severity: getOverallSeverity(riskScores),
            message: `Risk scores updated: ${Object.entries(riskScores || {})
                .map(([k, v]: [string, any]) => `${k}=${v.score}(${v.level})`)
                .join(", ")}`,
            metadata: riskScores,
        });

        await supabase.from("monitoring_logs").insert(logInserts);

        // Cache DeFi metrics
        if (offchain?.defiMetrics) {
            const metricsInserts: any[] = [];
            if (offchain.defiMetrics.aave) {
                metricsInserts.push({ protocol: "aave", metrics: offchain.defiMetrics.aave });
            }
            if (offchain.defiMetrics.compound) {
                metricsInserts.push({ protocol: "compound", metrics: offchain.defiMetrics.compound });
            }
            if (metricsInserts.length) {
                await supabase.from("defi_metrics_cache").insert(metricsInserts);
            }
        }

        return NextResponse.json({
            ok: true,
            snapshotId: snapshot?.id,
            userId: user.id,
            totalValueUsd,
        });
    } catch (error: any) {
        console.error("POST /api/monitoring/snapshot error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * GET /api/monitoring/snapshot?wallet=0x...
 * Returns latest monitoring snapshot for a user.
 */
export async function GET(request: NextRequest) {
    try {
        const wallet = request.nextUrl.searchParams.get("wallet");
        if (!wallet) {
            return NextResponse.json({ error: "wallet query param required" }, { status: 400 });
        }

        const { data: user } = await supabase
            .from("users")
            .select("id")
            .eq("wallet_address", wallet)
            .single();

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Latest snapshot
        const { data: snapshot } = await supabase
            .from("portfolio_snapshots")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        // Latest DeFi metrics
        const { data: aaveMetrics } = await supabase
            .from("defi_metrics_cache")
            .select("metrics")
            .eq("protocol", "aave")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        const { data: compoundMetrics } = await supabase
            .from("defi_metrics_cache")
            .select("metrics")
            .eq("protocol", "compound")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        // Recent anomalies
        const { data: recentAnomalies } = await supabase
            .from("monitoring_logs")
            .select("*")
            .eq("user_id", user.id)
            .eq("event_type", "ANOMALY")
            .order("created_at", { ascending: false })
            .limit(10);

        return NextResponse.json({
            snapshot,
            defiMetrics: {
                aave: aaveMetrics?.metrics || null,
                compound: compoundMetrics?.metrics || null,
            },
            recentAnomalies: recentAnomalies || [],
        });
    } catch (error: any) {
        console.error("GET /api/monitoring/snapshot error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function getOverallSeverity(
    riskScores: Record<string, { score: number; level: string }> | undefined
): string {
    if (!riskScores) return "SAFE";
    const levels = Object.values(riskScores).map((r) => r.level);
    if (levels.includes("CRITICAL")) return "CRITICAL";
    if (levels.includes("WARNING")) return "WARNING";
    if (levels.includes("WATCH")) return "WATCH";
    return "SAFE";
}
