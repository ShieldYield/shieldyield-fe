'use client';

import RiskBadge from './RiskBadge';

interface AdapterData {
    address?: string;
    balance: number;
    apy: number;
    isHealthy: boolean;
    principal: number;
    accruedYield: number;
    allocation: number;
    changePercent?: number;
    changeDirection?: 'up' | 'down' | 'neutral';
}

interface AdapterCardProps {
    name: string;
    data: AdapterData;
    riskScore?: { score: number; level: string };
}

const protocolIcons: Record<string, string> = {
    AaveAdapter: '🔵',
    CompoundAdapter: '🟢',
    MorphoAdapter: '🟣',
    YieldMaxAdapter: '🟡',
};

export default function AdapterCard({ name, data, riskScore }: AdapterCardProps) {
    const icon = protocolIcons[name] || '⚪';
    const displayName = name.replace('Adapter', '');

    return (
        <div className="relative group bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 rounded-2xl p-5
                        hover:border-zinc-600 hover:bg-zinc-900/80 transition-all duration-300 overflow-hidden">
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-linear-to-br from-zinc-800/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />

            <div className="relative z-10">
                {/* Header: Icon + Name + Risk */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xl">{icon}</span>
                        <h3 className="text-base font-medium text-zinc-100">{displayName}</h3>
                    </div>
                    {riskScore && (
                        <RiskBadge level={riskScore.level} score={riskScore.score} size="sm" />
                    )}
                </div>

                {/* Balance + Change Indicator */}
                <div className="mb-5">
                    <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-light text-zinc-50 tracking-tight font-mono tabular-nums">
                            ${data.balance.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}
                        </p>
                        {data.changeDirection && data.changeDirection !== 'neutral' && (
                            <span className={`flex items-center gap-1 text-xs font-light ${data.changeDirection === 'up' ? 'text-emerald-400' : 'text-red-400'
                                }`}>
                                <span>{data.changeDirection === 'up' ? '▲' : '▼'}</span>
                                {(data.changePercent ?? 0).toFixed(4)}%
                            </span>
                        )}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                        <p className="text-xs font-light text-zinc-500">
                            Principal: ${data.principal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                        {data.apy > 0 && data.balance > 0 && (
                            <span className="text-[10px] font-mono text-emerald-500/70">
                                +${((data.balance * (data.apy / 100)) / 31_536_000).toFixed(8)}/s
                            </span>
                        )}
                    </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-zinc-800">
                    <div className="flex flex-col gap-1">
                        <p className="text-[10px] uppercase tracking-widest font-medium text-zinc-500">APY</p>
                        <p className="text-sm font-light text-emerald-400">{data.apy.toFixed(2)}%</p>
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-[10px] uppercase tracking-widest font-medium text-zinc-500">Alloc</p>
                        <p className="text-sm font-light text-zinc-300">{data.allocation.toFixed(1)}%</p>
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-[10px] uppercase tracking-widest font-medium text-zinc-500">Yield</p>
                        <p className="text-sm font-light text-cyan-400">
                            +${data.accruedYield.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                </div>

                {/* Allocation bar */}
                <div className="mt-4 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-linear-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(data.allocation, 100)}%` }}
                    />
                </div>

                {/* Health indicator */}
                <div className="mt-3 flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${data.isHealthy ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
                    <span className="text-[10px] font-light text-zinc-500">
                        {data.isHealthy ? 'Healthy' : 'Unhealthy'}
                    </span>
                </div>
            </div>
        </div>
    );
}
