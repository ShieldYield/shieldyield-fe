import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/monitoring/logs?wallet=0x...&type=ANOMALY&adapter=AaveAdapter&limit=20
 * Returns recent monitoring events for Activity Feed.
 */
export async function GET(request: NextRequest) {
    try {
        const wallet = request.nextUrl.searchParams.get("wallet");
        const eventType = request.nextUrl.searchParams.get("type");
        const adapter = request.nextUrl.searchParams.get("adapter");
        const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "20", 10), 100);

        if (!wallet) {
            return NextResponse.json({ error: "wallet query param required" }, { status: 400 });
        }

        const { data: user } = await supabase
            .from("users")
            .select("id")
            .eq("wallet_address", wallet)
            .single();

        if (!user) {
            return NextResponse.json({ logs: [], total: 0 });
        }

        let query = supabase
            .from("monitoring_logs")
            .select("id, event_type, severity, adapter, message, metadata, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (eventType) query = query.eq("event_type", eventType);
        if (adapter) query = query.eq("adapter", adapter);

        const { data: logs } = await query;

        return NextResponse.json({ logs: logs || [], total: (logs || []).length });
    } catch (error: any) {
        console.error("GET /api/monitoring/logs error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
