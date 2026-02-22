'use client';

interface AnomalyEvent {
    severity: string;
    message: string;
    adapter?: string;
    created_at: string;
}

interface AnomalyTickerProps {
    anomalies: AnomalyEvent[];
}

const severityIcon: Record<string, string> = {
    CRITICAL: '🚨',
    WARNING: '⚠️',
    WATCH: '👁️',
};

export default function AnomalyTicker({ anomalies }: AnomalyTickerProps) {
    if (!anomalies.length) {
        return (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-xs text-emerald-400 font-medium">All systems nominal — no anomalies detected</p>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-2.5 overflow-hidden">
            <div className="flex gap-8 animate-scroll">
                {anomalies.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 whitespace-nowrap shrink-0">
                        <span>{severityIcon[a.severity] || '📋'}</span>
                        <span className="text-xs text-zinc-400">
                            {a.adapter && <span className="text-zinc-300 font-medium">{a.adapter}: </span>}
                            {a.message}
                        </span>
                        <span className="text-[10px] text-zinc-600">
                            {new Date(a.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
