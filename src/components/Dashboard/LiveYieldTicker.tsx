'use client';

import { useEffect, useState, useRef } from 'react';

interface LiveYieldTickerProps {
    totalBalance: number;
    weightedApy: number; // weighted average APY across all adapters
    totalAccruedYield: number;
    adapters: Record<string, any>;
}

const protocolColors: Record<string, string> = {
    AaveAdapter: 'bg-blue-500',
    CompoundAdapter: 'bg-green-500',
    MorphoAdapter: 'bg-purple-500',
    YieldMaxAdapter: 'bg-yellow-500',
};

export default function LiveYieldTicker({
    totalBalance,
    weightedApy,
    totalAccruedYield,
    adapters,
}: LiveYieldTickerProps) {
    // Yield per second = (balance × APY%) / seconds_in_year
    const yieldPerSecond = (totalBalance * (weightedApy / 100)) / 31_536_000;

    const [displayYield, setDisplayYield] = useState(totalAccruedYield);
    const lastUpdateRef = useRef(Date.now());
    const baseYieldRef = useRef(totalAccruedYield);

    // Sync base when props change (new data from poll)
    useEffect(() => {
        baseYieldRef.current = totalAccruedYield;
        lastUpdateRef.current = Date.now();
        setDisplayYield(totalAccruedYield);
    }, [totalAccruedYield]);

    // Client-side interpolation: tick every 100ms
    useEffect(() => {
        if (yieldPerSecond <= 0) return;

        const interval = setInterval(() => {
            const elapsed = (Date.now() - lastUpdateRef.current) / 1000;
            const interpolated = baseYieldRef.current + elapsed * yieldPerSecond;
            setDisplayYield(interpolated);
        }, 100);

        return () => clearInterval(interval);
    }, [yieldPerSecond]);

    const yieldPerDay = yieldPerSecond * 86_400;

    // Format with 8 decimal places for micro-yield visibility
    const formatMicroValue = (val: number) => {
        if (val < 0.01) return val.toFixed(8);
        if (val < 1) return val.toFixed(6);
        return val.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
    };

    return (
        <div className="relative overflow-hidden bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 rounded-2xl p-5">
            {/* Animated gradient background */}
            <div className="absolute inset-0 bg-linear-to-r from-emerald-500/5 via-transparent to-cyan-500/5 animate-pulse" />

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <span className="w-2 h-2 bg-emerald-400 rounded-full inline-block animate-pulse" />
                            <span className="absolute inset-0 w-2 h-2 bg-emerald-400 rounded-full animate-ping opacity-75" />
                        </div>
                        <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">
                            Live Yield Accumulator
                        </span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-mono">
                        +${yieldPerSecond.toFixed(8)}/s
                    </span>
                </div>

                {/* Main yield display */}
                <div className="flex items-baseline gap-3">
                    <span className="text-3xl md:text-4xl font-light text-emerald-400 tracking-tight font-mono tabular-nums">
                        +${formatMicroValue(displayYield)}
                    </span>
                    <span className="text-sm text-zinc-500 font-light">earned</span>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-6 mt-4 pt-4 border-t border-zinc-800/50">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Per Day</span>
                        <span className="text-sm font-mono text-zinc-300">
                            +${yieldPerDay < 0.01 ? yieldPerDay.toFixed(6) : yieldPerDay.toFixed(4)}
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Avg APY</span>
                        <span className="text-sm font-mono text-cyan-400">{weightedApy.toFixed(2)}%</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Balance</span>
                        <span className="text-sm font-mono text-zinc-300">
                            ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                {/* Graph-based Allocation Overview */}
                {Object.keys(adapters).length > 0 && (
                    <div className="mt-6 pt-5 border-t border-zinc-800/50">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Allocation Overview</span>
                        </div>

                        {/* Stacked Bar Graph */}
                        <div className="h-2.5 w-full bg-zinc-800 rounded-full overflow-hidden flex mb-4">
                            {Object.entries(adapters).map(([name, data]) => {
                                if (data.allocation <= 0) return null;
                                return (
                                    <div
                                        key={name}
                                        className={`h-full ${protocolColors[name] || 'bg-zinc-500'} transition-all`}
                                        style={{ width: `${data.allocation}%` }}
                                        title={`${name.replace('Adapter', '')}: ${data.allocation.toFixed(1)}%`}
                                    />
                                );
                            })}
                        </div>

                        {/* Breakdown Legend */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {Object.entries(adapters).map(([name, data]) => {
                                if (data.allocation <= 0 && data.balance <= 0) return null;
                                return (
                                    <div key={name} className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`w-2 h-2 rounded-full ${protocolColors[name] || 'bg-zinc-500'}`} />
                                            <span className="text-xs font-medium text-zinc-300">{name.replace('Adapter', '')}</span>
                                        </div>
                                        <div className="pl-3.5 flex flex-col gap-0.5">
                                            <span className="text-[10px] font-light text-zinc-400">
                                                {data.allocation.toFixed(1)}% Alloc
                                            </span>
                                            <span className="text-[10px] font-mono text-zinc-500">
                                                ${data.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="text-[10px] font-mono text-emerald-500/80">
                                                {data.apy.toFixed(2)}% APY
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
