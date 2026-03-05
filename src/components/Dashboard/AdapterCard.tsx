'use client';

import { useState } from 'react';
import RiskBadge from './RiskBadge';

interface AiSentinelData {
    ai_threat_score: number;
    confidence: number;
    reasoning: string;
    recommendation: 'HOLD' | 'REDUCE' | 'EXIT';
    signals: Array<{ source: string; signal: string; sentiment: string }>;
    github: { recentCommits: number; openIssues: number; lastPushDaysAgo: number };
    newsHeadlines?: string[];
    sources?: { githubUrl: string; cryptoPanicUrl: string };
}

interface AdapterData {
    address?: string;
    balance: number;
    apy: number;
    isHealthy: boolean;
    principal: number;
    accruedYield: number;
    allocation: number;
    targetAllocation?: number;
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

const recommendationColors = {
    HOLD: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    REDUCE: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    EXIT: 'text-red-400 bg-red-400/10 border-red-400/30',
};

const sentimentDot = (s: string) =>
    s === 'positive' ? 'bg-emerald-400' : s === 'negative' ? 'bg-red-400' : 'bg-zinc-500';

export default function AdapterCard({ name, data, riskScore }: AdapterCardProps) {
    const [aiOpen, setAiOpen] = useState(false);
    const [aiData, setAiData] = useState<AiSentinelData | null>(null);
    const [aiLoading, setAiLoading] = useState(false);

    const icon = protocolIcons[name] || '⚪';
    const displayName = name.replace('Adapter', '');

    const yieldPerSecond = data.balance > 0 && data.apy > 0
        ? (data.balance * (data.apy / 100)) / 31_536_000
        : 0;

    const handleAiToggle = async () => {
        const next = !aiOpen;
        setAiOpen(next);
        if (next && !aiData) {
            setAiLoading(true);
            try {
                const res = await fetch(`/api/ai-sentinel?protocol=${name}`);
                if (res.ok) setAiData(await res.json());
            } catch { /* ignore */ } finally {
                setAiLoading(false);
            }
        }
    };

    return (
        <div className="relative group bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 rounded-2xl
                        hover:border-zinc-600 transition-all duration-300 overflow-hidden">
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-linear-to-br from-zinc-800/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl pointer-events-none" />

            <div className="relative z-10 p-5">
                {/* ── Header: Icon + Name + Risk Badge ── */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xl">{icon}</span>
                        <h3 className="text-base font-medium text-zinc-100">{displayName}</h3>
                    </div>
                    {riskScore && (
                        <RiskBadge level={riskScore.level} score={riskScore.score} size="sm" />
                    )}
                </div>

                {/* ── Balance + Change Indicator ── */}
                <div className="mb-5">
                    <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-light text-zinc-50 tracking-tight font-mono tabular-nums">
                            ${data.balance.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}
                        </p>
                        {data.changeDirection && data.changeDirection !== 'neutral' && (
                            <span className={`flex items-center gap-1 text-xs font-light ${data.changeDirection === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                                <span>{data.changeDirection === 'up' ? '▲' : '▼'}</span>
                                {(data.changePercent ?? 0).toFixed(4)}%
                            </span>
                        )}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                        <p className="text-xs font-light text-zinc-500">
                            Principal: ${data.principal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                        {yieldPerSecond > 0 && (
                            <span className="text-[10px] font-mono text-emerald-500/70">
                                +${yieldPerSecond.toFixed(8)}/s
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Stats Grid ── */}
                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-zinc-800">
                    <div className="flex flex-col gap-1">
                        <p className="text-[10px] uppercase tracking-widest font-medium text-zinc-500">APY</p>
                        <p className="text-sm font-light text-emerald-400">{data.apy.toFixed(2)}%</p>
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-[10px] uppercase tracking-widest font-medium text-zinc-500">Alloc</p>
                        <div className="flex items-center gap-1.5">
                            <p className="text-sm font-light text-zinc-300">{data.allocation.toFixed(1)}%</p>
                            {data.targetAllocation !== undefined && Math.abs(data.allocation - data.targetAllocation) > 1 && (
                                <span className="text-[9px] text-zinc-600 font-light">
                                    (tgt {data.targetAllocation.toFixed(0)}%)
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-[10px] uppercase tracking-widest font-medium text-zinc-500">Yield</p>
                        <p className="text-sm font-light text-cyan-400">
                            +${data.accruedYield.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                </div>

                {/* ── Allocation Bar ── */}
                <div className="mt-4 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-linear-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(data.allocation, 100)}%` }}
                    />
                </div>

                {/* ── Second Stats Row: Address + Health ── */}
                <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${data.isHealthy ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
                        <span className="text-[10px] font-light text-zinc-500">
                            {data.isHealthy ? 'Healthy' : 'Unhealthy'}
                        </span>
                    </div>
                    {data.address && (
                        <span className="text-[10px] font-mono text-zinc-600">
                            {data.address.slice(0, 6)}…{data.address.slice(-4)}
                        </span>
                    )}
                </div>

                {/* ── Risk Score Bar ── */}
                {riskScore && (
                    <div className="mt-4 pt-4 border-t border-zinc-800/60">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Risk Score</span>
                            <span className="text-[10px] font-mono text-zinc-400">{riskScore.score}/100</span>
                        </div>
                        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-700 ${riskScore.score <= 25 ? 'bg-emerald-500' :
                                        riskScore.score <= 50 ? 'bg-amber-400' :
                                            riskScore.score <= 75 ? 'bg-orange-500' : 'bg-red-500'
                                    }`}
                                style={{ width: `${riskScore.score}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* ── AI Sentinel Dropdown Toggle ── */}
                <button
                    onClick={handleAiToggle}
                    className="mt-4 w-full flex items-center justify-between px-3 py-2 rounded-xl
                               bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 hover:border-zinc-600
                               transition-all duration-200 group/btn"
                    id={`ai-sentinel-toggle-${name}`}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-xs">🤖</span>
                        <span className="text-[11px] font-medium text-zinc-400 group-hover/btn:text-zinc-300 transition-colors">
                            AI Sentinel Analysis
                        </span>
                        {aiData && (
                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-md border ${recommendationColors[aiData.recommendation]}`}>
                                {aiData.recommendation}
                            </span>
                        )}
                    </div>
                    <span className={`text-zinc-500 text-xs transition-transform duration-300 ${aiOpen ? 'rotate-180' : ''}`}>
                        ▾
                    </span>
                </button>
            </div>

            {/* ── AI Sentinel Dropdown Panel ── */}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${aiOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="px-5 pb-5 border-t border-zinc-800/60">
                    {aiLoading ? (
                        <div className="flex items-center justify-center py-8 gap-3">
                            <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs text-zinc-500">Analyzing {displayName}...</span>
                        </div>
                    ) : aiData ? (
                        <div className="pt-4 space-y-4">
                            {/* Score + Confidence + Recommendation */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="flex flex-col gap-1 p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/50">
                                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">Threat</span>
                                    <span className="text-xl font-light text-zinc-100">
                                        {aiData.ai_threat_score}
                                        <span className="text-xs text-zinc-600">/100</span>
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1 p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/50">
                                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">Confidence</span>
                                    <span className="text-xl font-light text-zinc-100">
                                        {Math.round(aiData.confidence * 100)}
                                        <span className="text-xs text-zinc-600">%</span>
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1 p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/50">
                                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">Action</span>
                                    <span className={`text-sm font-medium ${aiData.recommendation === 'HOLD' ? 'text-emerald-400' :
                                            aiData.recommendation === 'REDUCE' ? 'text-amber-400' : 'text-red-400'
                                        }`}>{aiData.recommendation}</span>
                                </div>
                            </div>

                            {/* AI Reasoning */}
                            <div className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/50">
                                <span className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">AI Reasoning</span>
                                <p className="text-xs font-light text-zinc-300 leading-relaxed">{aiData.reasoning}</p>
                            </div>

                            {/* GitHub + News */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/50">
                                    <span className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-2">GitHub</span>
                                    <div className="space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-[10px] text-zinc-500">Last push</span>
                                            <span className="text-[10px] font-mono text-zinc-300">{aiData.github.lastPushDaysAgo}d ago</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[10px] text-zinc-500">Issues</span>
                                            <span className="text-[10px] font-mono text-zinc-300">{aiData.github.openIssues}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[10px] text-zinc-500">Watchers</span>
                                            <span className="text-[10px] font-mono text-zinc-300">{aiData.github.recentCommits}</span>
                                        </div>
                                    </div>
                                    {aiData.sources?.githubUrl && (
                                        <a href={aiData.sources.githubUrl} target="_blank" rel="noopener noreferrer"
                                            className="mt-2 block text-[10px] text-cyan-500 hover:text-cyan-400">
                                            View repo →
                                        </a>
                                    )}
                                </div>

                                <div className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/50">
                                    <span className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-2">News</span>
                                    {aiData.newsHeadlines && aiData.newsHeadlines.length > 0 ? (
                                        <ul className="space-y-1.5">
                                            {aiData.newsHeadlines.slice(0, 3).map((h, i) => (
                                                <li key={i} className="text-[10px] font-light text-zinc-400 leading-snug line-clamp-2">
                                                    • {h}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <span className="text-[10px] text-zinc-600">No headlines</span>
                                    )}
                                    {aiData.sources?.cryptoPanicUrl && (
                                        <a href={aiData.sources.cryptoPanicUrl} target="_blank" rel="noopener noreferrer"
                                            className="mt-2 block text-[10px] text-cyan-500 hover:text-cyan-400">
                                            View source →
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Key Signals */}
                            {aiData.signals && aiData.signals.length > 0 && (
                                <div>
                                    <span className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-2">Key Signals</span>
                                    <div className="space-y-1.5">
                                        {aiData.signals.map((s, i) => (
                                            <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/40">
                                                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${sentimentDot(s.sentiment)}`} />
                                                <div>
                                                    <span className="text-[9px] uppercase tracking-wider text-zinc-600 mr-1">{s.source}</span>
                                                    <span className="text-[10px] font-light text-zinc-300 leading-snug">{s.signal}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="py-6 text-center">
                            <p className="text-xs text-zinc-600">Failed to load AI analysis</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
