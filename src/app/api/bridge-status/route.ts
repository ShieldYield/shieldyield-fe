import { NextRequest, NextResponse } from "next/server";
import { fetchBridgeStatus } from "@/lib/bridge-status";

// ============================================================================
// GET /api/bridge-status
// ============================================================================

export async function GET(request: NextRequest) {
    const isNoCache = request.headers.get("cache-control") === "no-cache";
    const wallet = request.nextUrl.searchParams.get("wallet") || undefined;

    try {
        const data = await fetchBridgeStatus({ 
            noCache: isNoCache,
            wallet: wallet 
        });

        return NextResponse.json(data, {
            headers: {
                "Cache-Control": "public, max-age=10",
            },
        });
    } catch (err: unknown) {
        console.error("[bridge-status] Error:", err);
        return NextResponse.json(
            {
                error: "Failed to fetch bridge status",
                details: String(err),
            },
            { status: 500 }
        );
    }
}
