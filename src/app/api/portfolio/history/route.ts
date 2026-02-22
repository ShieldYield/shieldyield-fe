import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/portfolio/history?wallet=0x...&period=1d|1w|1m
 * Returns portfolio value time series for chart.
 */
export async function GET(request: NextRequest) {
    try {
        const wallet = request.nextUrl.searchParams.get("wallet");
        const period = request.nextUrl.searchParams.get("period") || "1d";

        if (!wallet) {
            return NextResponse.json({ error: "wallet query param required" }, { status: 400 });
        }

        const { data: user } = await supabase
            .from("users")
            .select("id")
            .eq("wallet_address", wallet)
            .single();

        if (!user) {
            return NextResponse.json({ history: [] });
        }

        // Calculate time range
        const periodMs: Record<string, number> = {
            "1d": 24 * 60 * 60 * 1000,
            "1w": 7 * 24 * 60 * 60 * 1000,
            "1m": 30 * 24 * 60 * 60 * 1000,
        };
        const since = new Date(Date.now() - (periodMs[period] || periodMs["1d"])).toISOString();

        const { data: snapshots } = await supabase
            .from("portfolio_snapshots")
            .select("total_value_usd, risk_scores, created_at")
            .eq("user_id", user.id)
            .gte("created_at", since)
            .order("created_at", { ascending: true });

        const history = (snapshots || []).map((s) => ({
            timestamp: s.created_at,
            totalValueUsd: s.total_value_usd,
            riskScores: s.risk_scores,
        }));

        return NextResponse.json({ history, period });
    } catch (error: any) {
        console.error("GET /api/portfolio/history error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
