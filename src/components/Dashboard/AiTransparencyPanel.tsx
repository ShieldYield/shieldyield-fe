'use client';

import type { SentinelData } from './SentinelBanner';

export default function AiTransparencyPanel({ data }: { data: SentinelData }) {
    const confidencePct = Math.round(data.confidence * 100);

    return (
        <div className="mt-6 space-y-8 border-t border-zinc-700/50 pt-6">
            {/* ─── Row 1: Key Metrics ─── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                {/* Score & Confidence */}
                <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-medium text-zinc-500 uppercase ">Score & Confidence</span>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-light text-zinc-100">{data.ai_threat_score}</span>
                        <span className="text-sm font-light text-zinc-500 mb-0.5">/ 100</span>
                    </div>
                    <span className="text-xs font-light text-zinc-400 mt-1">Confidence: {confidencePct}%</span>
                </div>

                {/* Analysis Summary */}
                <div className="md:col-span-2 flex flex-col gap-2">
                    <span className="text-[10px] font-medium text-zinc-500 uppercase ">Analysis</span>
                    <p className="text-sm font-light text-zinc-300 leading-relaxed">
                        {data.reasoning}
                    </p>
                </div>
            </div>

            {/* ─── Row 2: Data Sources ─── */}
            <div className="space-y-4">
                <span className="text-[10px] font-medium text-zinc-500 uppercase ">Data Sources</span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* GitHub Stats */}
                    <div className="p-4 bg-zinc-900/40 rounded-[20px] border border-zinc-800/50 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-zinc-200">GitHub Activity</span>
                            {data.sources?.githubUrl && (
                                <a href={data.sources.githubUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 font-light">
                                    View Repository →
                                </a>
                            )}
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <span className="block text-[10px] text-zinc-500 mb-1">Last Push</span>
                                <span className="text-base font-light text-zinc-200">{data.github.lastPushDaysAgo}d</span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-zinc-500 mb-1">Issues</span>
                                <span className="text-base font-light text-zinc-200">{data.github.openIssues}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-zinc-500 mb-1">Watchers</span>
                                <span className="text-base font-light text-zinc-200">{data.github.recentCommits}</span>
                            </div>
                        </div>
                    </div>

                    {/* News Headlines */}
                    <div className="p-4 bg-zinc-900/40 rounded-[20px] border border-zinc-800/50 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-zinc-200">News Sentiment</span>
                            {data.sources?.cryptoPanicUrl && (
                                <a href={data.sources.cryptoPanicUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 font-light">
                                    View Source →
                                </a>
                            )}
                        </div>
                        {data.newsHeadlines && data.newsHeadlines.length > 0 ? (
                            <ul className="space-y-1.5">
                                {data.newsHeadlines.slice(0, 3).map((headline, i) => (
                                    <li key={i} className="text-xs font-light text-zinc-400 truncate">
                                        • {headline}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <span className="text-xs font-light text-zinc-500">No notable headlines</span>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── Row 3: Signals ─── */}
            {data.signals && data.signals.length > 0 && (
                <div className="space-y-4">
                    <span className="text-[10px] font-medium text-zinc-500 uppercase ">Key Signals</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {data.signals.map((s, i) => (
                            <div key={i} className="flex items-start gap-2.5 p-3 rounded-2xl bg-zinc-900/40 border border-zinc-800/50">
                                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${s.sentiment === 'positive' ? 'bg-emerald-400' :
                                        s.sentiment === 'negative' ? 'bg-red-400' : 'bg-zinc-500'
                                    }`} />
                                <span className="text-xs font-light text-zinc-300 leading-snug">{s.signal}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
