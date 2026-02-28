'use client';

import { useState } from 'react';
import AiTransparencyPanel from './AiTransparencyPanel';

export interface SentinelSignal {
  source: string;
  signal: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface SentinelData {
  protocol: string;
  ai_threat_score: number;
  confidence: number;
  reasoning: string;
  signals: SentinelSignal[];
  recommendation: 'HOLD' | 'REDUCE' | 'EXIT';
  github: {
    recentCommits: number;
    openIssues: number;
    lastPushDaysAgo: number;
  };
  sources: {
    githubUrl: string;
    cryptoPanicUrl: string;
  };
  newsHeadlines: string[];
  timestamp: string;
}

interface SentinelBannerProps {
  data: SentinelData | null;
  loading?: boolean;
}

function getThreatColor(score: number) {
  if (score <= 25) return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', label: 'LOW' };
  if (score <= 50) return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', label: 'MODERATE' };
  if (score <= 75) return { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', label: 'HIGH' };
  return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', label: 'CRITICAL' };
}

function getSentimentColor(sentiment: string) {
  if (sentiment === 'positive') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (sentiment === 'negative') return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30';
}

function getRecBadge(rec: string) {
  if (rec === 'HOLD') return 'bg-emerald-500/20 text-emerald-400';
  if (rec === 'REDUCE') return 'bg-orange-500/20 text-orange-400';
  return 'bg-red-500/20 text-red-400';
}

export default function SentinelBanner({ data, loading }: SentinelBannerProps) {
  if (loading) {
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-zinc-700 rounded-lg" />
          <div className="h-6 w-48 bg-zinc-700 rounded-lg" />
        </div>
        <div className="h-4 w-3/4 bg-zinc-800 rounded mb-3" />
        <div className="h-4 w-1/2 bg-zinc-800 rounded" />
      </div>
    );
  }

  if (!data) return null;

  const threat = getThreatColor(data.ai_threat_score);

  return (
    <div className={`${threat.bg} border ${threat.border} rounded-2xl p-6 transition-all`}>
      {/* ─── Banner Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div className="flex items-center gap-4">
          <span className="text-2xl">🤖</span>
          <div>
            <h3 className="text-base font-medium text-zinc-100 mb-1">Sentinel AI Analyst</h3>
            <p className="text-xs font-light text-zinc-400">Continuous Off-chain Monitoring</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className={`text-xs font-medium px-4 py-1.5 rounded-full ${threat.bg} ${threat.text} border ${threat.border}`}>
            {threat.label} RISK
          </span>
          <span className={`text-xs font-medium px-4 py-1.5 rounded-full ${getRecBadge(data.recommendation)} border border-transparent`}>
            ACTION: {data.recommendation}
          </span>
        </div>
      </div>

      {/* ─── Integrated AI Details Panel ─── */}
      <AiTransparencyPanel data={data} />
    </div>
  );
}
