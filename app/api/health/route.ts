import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        status: "ok",
        service: "shieldyield-proxy",
        timestamp: Math.floor(Date.now() / 1000),
        dataStreamsConfigured: !!(process.env.DS_API_KEY && process.env.DS_API_SECRET),
    });
}
