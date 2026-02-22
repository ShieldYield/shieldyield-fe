import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/portfolio/current?wallet=0x...
 * Returns the current allocation breakdown across all adapters.
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
            return NextResponse.json({ totalValueUsd: 0, adapters: {}, riskScores: {} });
        }

        const { data: latest } = await supabase
            .from("portfolio_snapshots")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (!latest) {
            return NextResponse.json({ totalValueUsd: 0, adapters: {}, riskScores: {} });
        }

        return NextResponse.json({
            totalValueUsd: latest.total_value_usd,
            adapters: latest.adapters,
            riskScores: latest.risk_scores,
            lastUpdated: latest.created_at,
        });
    } catch (error: any) {
        console.error("GET /api/portfolio/current error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
