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
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xl">{icon}</span>
                        <h3 className="text-base font-semibold text-zinc-100">{displayName}</h3>
                    </div>
                    {riskScore && (
                        <RiskBadge level={riskScore.level} score={riskScore.score} size="sm" />
                    )}
                </div>

                {/* Balance */}
                <div className="mb-3">
                    <p className="text-2xl font-bold text-zinc-50 tracking-tight">
                        ${data.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        Principal: ${data.principal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-zinc-800">
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">APY</p>
                        <p className="text-sm font-semibold text-emerald-400">{data.apy.toFixed(2)}%</p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Alloc</p>
                        <p className="text-sm font-semibold text-zinc-300">{data.allocation.toFixed(1)}%</p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Yield</p>
                        <p className="text-sm font-semibold text-cyan-400">
                            +${data.accruedYield.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                </div>

                {/* Allocation bar */}
                <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-linear-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(data.allocation, 100)}%` }}
                    />
                </div>

                {/* Health indicator */}
                <div className="mt-2 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${data.isHealthy ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
                    <span className="text-[10px] text-zinc-500">
                        {data.isHealthy ? 'Healthy' : 'Unhealthy'}
                    </span>
                </div>
            </div>
        </div>
    );
}
