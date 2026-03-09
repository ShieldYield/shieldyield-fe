'use client';

import { useMemo } from 'react';
import RiskBadge from './RiskBadge';
import { ProtocolIcon } from './ProtocolIcon';

interface AdapterNode {
    name: string;
    balance: number;
    apy: number;
    allocation: number;
    riskScore?: number;
    riskLevel?: string;
    isHealthy: boolean;
    isSafeHaven?: boolean;
}

interface FundFlowDiagramProps {
    totalValue: number;
    adapters: AdapterNode[];
}

const riskColors: Record<string, string> = {
    SAFE: '#34d399',
    WATCH: '#fbbf24',
    WARNING: '#f97316',
    CRITICAL: '#ef4444',
};

export default function FundFlowDiagram({ totalValue, adapters }: FundFlowDiagramProps) {
    const activeAdapters = useMemo(() => adapters.filter(a => a.allocation > 0), [adapters]);

    if (activeAdapters.length === 0) return null;

    return (
        <div className="relative bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 rounded-2xl p-6 overflow-hidden">
            {/* Background grid */}
            <div className="absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                }}
            />

            <div className="relative z-10">
                <h3 className="text-sm font-medium text-zinc-400 uppercase  mb-6">
                    Fund Flow — Where Is Your Money?
                </h3>

                {/* Flow Layout */}
                <div className="flex flex-col lg:flex-row items-center gap-4 lg:gap-0">
                    {/* Central Vault Node */}
                    <div className="flex-shrink-0 relative">
                        <div className="w-36 h-36 rounded-full bg-zinc-800/80 border-2 border-cyan-500/40 flex flex-col items-center justify-center relative">
                            {/* Pulse ring */}
                            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 animate-ping" style={{ animationDuration: '3s' }} />
                            <span className="text-2xl mb-1">🛡️</span>
                            <span className="text-[10px] font-medium text-cyan-400 uppercase ">ShieldVault</span>
                            <span className="text-sm font-mono text-zinc-200 mt-0.5">
                                ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>

                    {/* Connection Lines + Adapter Nodes */}
                    <div className="flex-1 flex flex-col gap-3 w-full lg:pl-4">
                        {activeAdapters.map((adapter, i) => {
                            const displayName = adapter.name.replace('Adapter', '');
                            const lineColor = riskColors[adapter.riskLevel || 'SAFE'] || riskColors.SAFE;
                            const lineWidth = Math.max(2, Math.min(6, adapter.allocation / 15));
                            const animDelay = `${i * 0.3}s`;

                            return (
                                <div key={adapter.name} className="flex items-center gap-0 group">
                                    {/* Animated connection line */}
                                    <div className="hidden lg:flex items-center flex-shrink-0" style={{ width: '80px' }}>
                                        <svg width="80" height="20" viewBox="0 0 80 20" className="overflow-visible">
                                            <line
                                                x1="0" y1="10" x2="80" y2="10"
                                                stroke={lineColor}
                                                strokeWidth={lineWidth}
                                                strokeOpacity="0.3"
                                            />
                                            {/* Animated dot traveling along the line */}
                                            <circle r="3" fill={lineColor}>
                                                <animateMotion
                                                    dur="2s"
                                                    repeatCount="indefinite"
                                                    begin={animDelay}
                                                    path="M0,10 L80,10"
                                                />
                                            </circle>
                                        </svg>
                                    </div>

                                    {/* Mobile: vertical connector */}
                                    <div className="lg:hidden w-0.5 h-6 mx-auto" style={{ backgroundColor: lineColor, opacity: 0.3 }} />

                                    {/* Adapter Node */}
                                    <div
                                        className="flex-1 bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-3 hover:border-zinc-600 transition-all duration-300 group-hover:bg-zinc-800/80"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <ProtocolIcon name={adapter.name} size={24} />
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-zinc-200">{displayName}</span>
                                                        {adapter.isSafeHaven && (
                                                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-1.5 py-0.5 font-medium">
                                                                HAVEN
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-zinc-600 font-mono">
                                                        {adapter.allocation.toFixed(1)}% allocated
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {/* Balance */}
                                                <div className="text-right">
                                                    <p className="text-sm font-mono text-zinc-200">
                                                        ${adapter.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                                                    </p>
                                                    <p className="text-[10px] text-emerald-400 font-mono">
                                                        APY {adapter.apy.toFixed(2)}%
                                                    </p>
                                                </div>

                                                {/* Risk Badge */}
                                                {adapter.riskLevel && (
                                                    <RiskBadge level={adapter.riskLevel} score={adapter.riskScore} size="sm" />
                                                )}

                                                {/* Health dot */}
                                                <span className={`w-2 h-2 rounded-full ${adapter.isHealthy ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
                                            </div>
                                        </div>

                                        {/* Micro allocation bar */}
                                        <div className="mt-2 h-1 bg-zinc-900 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-1000"
                                                style={{
                                                    width: `${Math.min(adapter.allocation, 100)}%`,
                                                    backgroundColor: lineColor,
                                                    opacity: 0.6,
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
