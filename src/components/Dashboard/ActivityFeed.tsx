'use client';

import RiskBadge from './RiskBadge';

interface LogEntry {
    id: string;
    event_type: string;
    severity: string | null;
    adapter: string | null;
    message: string;
    metadata?: any;
    created_at: string;
}

interface ActivityFeedProps {
    logs: LogEntry[];
}

const eventIcons: Record<string, string> = {
    ANOMALY: '🚨',
    RISK_UPDATE: '📊',
    REBALANCE: '🔄',
    DEPOSIT: '💰',
    WITHDRAW: '📤',
};

export default function ActivityFeed({ logs }: ActivityFeedProps) {
    if (!logs.length) {
        return (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Recent Activity</h3>
                <p className="text-xs text-zinc-600 text-center py-6">No activity yet</p>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Recent Activity</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {logs.map((log) => (
                    <div
                        key={log.id}
                        className="flex items-start gap-3 p-3 rounded-xl bg-zinc-800/40 hover:bg-zinc-800/60 transition-colors duration-200"
                    >
                        <span className="text-base mt-0.5">{eventIcons[log.event_type] || '📋'}</span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                                    {log.event_type.replace('_', ' ')}
                                </span>
                                {log.severity && <RiskBadge level={log.severity} size="sm" />}
                            </div>
                            <p className="text-xs text-zinc-300 truncate">{log.message}</p>
                            <p className="text-[10px] text-zinc-600 mt-1">
                                {new Date(log.created_at).toLocaleString('en-US', {
                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                                {log.adapter && ` · ${log.adapter}`}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
