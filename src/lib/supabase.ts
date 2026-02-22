import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side client with service role key (bypasses RLS)
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Types matching our database schema
export interface DbUser {
    id: string;
    wallet_address: string;
    created_at: string;
}

export interface DbPortfolioSnapshot {
    id: string;
    user_id: string;
    total_value_usd: number;
    adapters: Record<string, any>;
    risk_scores: Record<string, any>;
    created_at: string;
}

export interface DbMonitoringLog {
    id: string;
    user_id: string;
    event_type: string;
    severity: string | null;
    adapter: string | null;
    message: string;
    metadata: Record<string, any> | null;
    created_at: string;
}

export interface DbDefiMetricsCache {
    id: string;
    protocol: string;
    metrics: Record<string, any>;
    created_at: string;
}
