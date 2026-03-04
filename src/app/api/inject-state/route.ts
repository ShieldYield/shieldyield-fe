import { NextResponse } from "next/server";

/**
 * GET /api/inject-state
 * ─────────────────────────────────────────────────────────────
 * Proxy ke mock-variance-server (port 3099) untuk membaca
 * skenario simulasi yang sedang aktif.
 *
 * Dipakai oleh FE untuk polling perubahan skenario secara
 * real-time tanpa refresh halaman.
 *
 * Jika daemon tidak berjalan → kembalikan { scenario: null }
 * ─────────────────────────────────────────────────────────────
 */

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const resp = await fetch("http://localhost:3099/inject-state", {
            signal: AbortSignal.timeout(1_000),
        });
        if (!resp.ok) return NextResponse.json({ scenario: null });
        return NextResponse.json(await resp.json());
    } catch {
        return NextResponse.json({ scenario: null });
    }
}
