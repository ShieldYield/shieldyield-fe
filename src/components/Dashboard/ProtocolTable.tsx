'use client';

import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import RiskBadge from './RiskBadge';
import { ProtocolIcon } from './ProtocolIcon';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, ExternalLink, Github, Info, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';

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

interface ProtocolTableProps {
    adapters: Record<string, AdapterData>;
    riskScores: Record<string, { score: number; level: string }>;
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

export default function ProtocolTable({ adapters, riskScores }: ProtocolTableProps) {
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [aiData, setAiData] = useState<Record<string, AiSentinelData | null>>({});
    const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});

    const toggleRow = async (name: string) => {
        const isExpanded = !expandedRows[name];
        setExpandedRows(prev => ({ ...prev, [name]: isExpanded }));

        if (isExpanded && !aiData[name]) {
            setAiLoading(prev => ({ ...prev, [name]: true }));
            try {
                const res = await fetch(`/api/ai-sentinel?protocol=${name}`);
                if (res.ok) {
                    const data = await res.json();
                    setAiData(prev => ({ ...prev, [name]: data }));
                }
            } catch (err) {
                console.error(`Failed to fetch AI data for ${name}:`, err);
            } finally {
                setAiLoading(prev => ({ ...prev, [name]: false }));
            }
        }
    };

    const protocolEntries = Object.entries(adapters);

    if (protocolEntries.length === 0) {
        return (
            <div className="text-center py-16 bg-zinc-900/40 border border-zinc-800 rounded-2xl">
                <p className="text-base font-light text-zinc-500">No adapter data yet. Deposit into ShieldVault to see your portfolio.</p>
            </div>
        );
    }

    return (
        <div className="w-full bg-zinc-900/40 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto scrollbar-hide">
                <Table className="w-full border-collapse">
                    <TableHeader className="bg-zinc-900/60 sticky top-0 z-20">
                        <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                            <TableHead className="w-[200px] sticky left-0 bg-zinc-900/90 backdrop-blur-md z-30 px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                Protocol
                            </TableHead>
                            <TableHead className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                Status
                            </TableHead>
                            <TableHead className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                Risk Level
                            </TableHead>
                            <TableHead className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                APY
                            </TableHead>
                            <TableHead className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                Allocation
                            </TableHead>
                            <TableHead className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">
                                Balance
                            </TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {protocolEntries.map(([name, data]) => {
                            const risk = riskScores[name];
                            const isExpanded = expandedRows[name];
                            const displayName = name.replace('Adapter', '');
                            const icon = protocolIcons[name] || '⚪';

                            return (
                                <React.Fragment key={name}>
                                    <TableRow 
                                        className={cn(
                                            "group cursor-pointer border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/30",
                                            isExpanded && "bg-zinc-800/20"
                                        )}
                                        onClick={() => toggleRow(name)}
                                    >
                                        {/* Sticky First Column */}
                                        <TableCell className="sticky left-0 bg-zinc-950/80 backdrop-blur-md z-10 px-6 py-4 border-r border-zinc-800/30">
                                            <div className="flex items-center gap-3">
                                                <ProtocolIcon name={name} className="group-hover:border-zinc-500 transition-colors" />
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-zinc-100">{displayName}</span>
                                                    {data.address && (
                                                        <span className="text-[9px] font-mono text-zinc-500">
                                                            {data.address.slice(0, 6)}...{data.address.slice(-4)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>

                                        {/* Status */}
                                        <TableCell className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    "w-2 h-2 rounded-full animate-pulse",
                                                    data.isHealthy ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]" : "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.4)]"
                                                )} />
                                                <span className={cn(
                                                    "text-xs font-medium uppercase tracking-tighter",
                                                    data.isHealthy ? "text-emerald-400" : "text-red-400"
                                                )}>
                                                    {data.isHealthy ? 'Healthy' : 'Unhealthy'}
                                                </span>
                                            </div>
                                        </TableCell>

                                        {/* Risk Level */}
                                        <TableCell className="px-6 py-4">
                                            {risk ? (
                                                <RiskBadge level={risk.level} score={risk.score} size="sm" />
                                            ) : (
                                                <span className="text-xs text-zinc-600">—</span>
                                            )}
                                        </TableCell>

                                        {/* APY */}
                                        <TableCell className="px-6 py-4">
                                            <span className="text-sm font-mono font-medium text-emerald-400">
                                                {data.apy.toFixed(2)}%
                                            </span>
                                        </TableCell>

                                        {/* Allocation */}
                                        <TableCell className="px-6 py-4">
                                            <div className="flex flex-col gap-1.5 min-w-[100px]">
                                                <div className="flex justify-between items-center text-[10px]">
                                                    <span className="text-zinc-300">{data.allocation.toFixed(1)}%</span>
                                                    {data.targetAllocation !== undefined && (
                                                        <span className="text-zinc-600">Target {data.targetAllocation.toFixed(0)}%</span>
                                                    )}
                                                </div>
                                                <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700"
                                                        style={{ width: `${Math.min(data.allocation, 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </TableCell>

                                        {/* Balance */}
                                        <TableCell className="px-6 py-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-sm font-mono font-bold text-zinc-100">
                                                    ${data.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                {data.changeDirection && data.changeDirection !== 'neutral' && (
                                                    <span className={cn(
                                                        "text-[10px] font-medium flex items-center gap-0.5",
                                                        data.changeDirection === 'up' ? "text-emerald-400" : "text-red-400"
                                                    )}>
                                                        {data.changeDirection === 'up' ? '▲' : '▼'} {Math.abs(data.changePercent || 0).toFixed(2)}%
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>

                                        {/* Chevron */}
                                        <TableCell className="px-6 py-4 text-right">
                                            <div className="flex justify-end">
                                                {isExpanded ? (
                                                    <ChevronUp className="w-4 h-4 text-zinc-500 transition-transform group-hover:text-zinc-300" />
                                                ) : (
                                                    <ChevronDown className="w-4 h-4 text-zinc-500 transition-transform group-hover:text-zinc-300" />
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>

                                    {/* Detail Row (Accordion-like) */}
                                    {isExpanded && (
                                        <TableRow className="bg-zinc-900/20 border-b border-zinc-800/30 hover:bg-zinc-900/30">
                                            <TableCell colSpan={7} className="p-0">
                                                <div className="p-8 animate-in fade-in slide-in-from-top-2 duration-300">
                                                    {aiLoading[name] ? (
                                                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                                                            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                                                            <span className="text-xs text-zinc-500 tracking-widest uppercase">AI Sentinel Analyzing {displayName}...</span>
                                                        </div>
                                                    ) : aiData[name] ? (
                                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                                            {/* AI Insights Column */}
                                                            <div className="lg:col-span-2 space-y-6">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <div className="p-1.5 bg-cyan-500/10 rounded-lg">
                                                                        <Activity className="w-4 h-4 text-cyan-400" />
                                                                    </div>
                                                                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">AI Sentinel Intelligence</h4>
                                                                </div>
                                                                
                                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                    <div className="p-4 bg-zinc-800/30 border border-zinc-700/30 rounded-2xl">
                                                                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">Threat Score</span>
                                                                        <div className="flex items-baseline gap-1">
                                                                            <span className={cn(
                                                                                "text-2xl font-light",
                                                                                aiData[name]!.ai_threat_score < 30 ? "text-emerald-400" :
                                                                                aiData[name]!.ai_threat_score < 60 ? "text-amber-400" : "text-red-400"
                                                                            )}>{aiData[name]!.ai_threat_score}</span>
                                                                            <span className="text-xs text-zinc-600">/100</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="p-4 bg-zinc-800/30 border border-zinc-700/30 rounded-2xl">
                                                                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">Confidence</span>
                                                                        <div className="flex items-baseline gap-1">
                                                                            <span className="text-2xl font-light text-zinc-100">{Math.round(aiData[name]!.confidence * 100)}%</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="p-4 bg-zinc-800/30 border border-zinc-700/30 rounded-2xl">
                                                                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 block">Recommendation</span>
                                                                        <Badge className={cn("mt-1", recommendationColors[aiData[name]!.recommendation])}>
                                                                            {aiData[name]!.recommendation}
                                                                        </Badge>
                                                                    </div>
                                                                </div>

                                                                <div className="p-5 bg-zinc-800/20 border border-zinc-700/20 rounded-2xl">
                                                                    <div className="flex items-center gap-2 mb-3">
                                                                        <Info className="w-3.5 h-3.5 text-zinc-500" />
                                                                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Sentinel Reasoning</span>
                                                                    </div>
                                                                    <p className="text-sm font-light text-zinc-300 leading-relaxed italic">
                                                                        "{aiData[name]!.reasoning}"
                                                                    </p>
                                                                </div>

                                                                {/* News Headlines */}
                                                                {aiData[name]!.newsHeadlines && aiData[name]!.newsHeadlines!.length > 0 && (
                                                                    <div className="space-y-3">
                                                                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">Market Intelligence (Off-Chain)</span>
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                            {aiData[name]!.newsHeadlines!.slice(0, 4).map((h, i) => (
                                                                                <div key={i} className="p-3 bg-zinc-800/40 border border-zinc-700/20 rounded-xl text-[11px] text-zinc-400 line-clamp-2 hover:text-zinc-200 transition-colors">
                                                                                    • {h}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Right Column: Parameters */}
                                                            <div className="space-y-6 border-l border-zinc-800 pl-8">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <div className="p-1.5 bg-zinc-800 rounded-lg">
                                                                        <ShieldCheck className="w-4 h-4 text-zinc-400" />
                                                                    </div>
                                                                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Security Health</h4>
                                                                </div>

                                                                {/* GitHub Stats */}
                                                                <div className="space-y-4">
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <Github className="w-3.5 h-3.5 text-zinc-500" />
                                                                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">GitHub Repository</span>
                                                                        </div>
                                                                        {aiData[name]!.sources?.githubUrl && (
                                                                            <a href={aiData[name]!.sources?.githubUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:text-cyan-400 transition-colors">
                                                                                <ExternalLink className="w-3 h-3" />
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <div className="bg-zinc-800/30 p-2.5 rounded-xl border border-zinc-700/20">
                                                                            <span className="text-[9px] text-zinc-600 block mb-1">Commits</span>
                                                                            <span className="text-xs font-mono text-zinc-300">{aiData[name]!.github.recentCommits}</span>
                                                                        </div>
                                                                        <div className="bg-zinc-800/30 p-2.5 rounded-xl border border-zinc-700/20">
                                                                            <span className="text-[9px] text-zinc-600 block mb-1">Last Push</span>
                                                                            <span className="text-xs font-mono text-zinc-300">{aiData[name]!.github.lastPushDaysAgo}d ago</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Key Signals */}
                                                                <div className="space-y-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <AlertTriangle className="w-3.5 h-3.5 text-zinc-500" />
                                                                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Key Risk Signals</span>
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        {aiData[name]!.signals.map((s, i) => (
                                                                            <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-zinc-800/20 border border-zinc-700/10">
                                                                                <div className={cn("mt-1.5 w-1.5 h-1.5 rounded-full shrink-0", sentimentDot(s.sentiment))} />
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-[9px] text-zinc-600 uppercase font-bold">{s.source}</span>
                                                                                    <span className="text-[11px] text-zinc-400 font-light leading-snug">{s.signal}</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-center py-6">
                                                            <p className="text-sm text-zinc-600">Analysis temporarily unavailable.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
            
            {/* Horizontal Scroll Hint for Mobile */}
            <div className="md:hidden flex items-center justify-center gap-2 py-3 bg-zinc-900/80 border-t border-zinc-800">
                <Info className="w-3 h-3 text-zinc-600" />
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Scroll right to view more data</span>
            </div>
        </div>
    );
}
