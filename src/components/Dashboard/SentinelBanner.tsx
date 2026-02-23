'use client';

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
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 bg-zinc-700 rounded" />
          <div className="h-4 w-40 bg-zinc-700 rounded" />
        </div>
        <div className="h-3 w-3/4 bg-zinc-800 rounded mb-2" />
        <div className="h-3 w-1/2 bg-zinc-800 rounded" />
      </div>
    );
  }

  if (!data) return null;

  const threat = getThreatColor(data.ai_threat_score);
  const confidencePct = Math.round(data.confidence * 100);

  return (
    <div className={`${threat.bg} border ${threat.border} rounded-2xl p-5 transition-all`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="text-sm font-semibold text-zinc-200">AI Sentinel</span>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${threat.bg} ${threat.text} border ${threat.border}`}>
            {threat.label} ({data.ai_threat_score}/100)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getRecBadge(data.recommendation)}`}>
            {data.recommendation}
          </span>
          <span className="text-[10px] text-zinc-500">
            {confidencePct}% confidence
          </span>
        </div>
      </div>

      {/* Reasoning */}
      <p className="text-sm text-zinc-300 mb-3 leading-relaxed">
        {data.reasoning}
      </p>

      {/* Signal Pills */}
      {data.signals.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {data.signals.map((s, i) => (
            <span
              key={i}
              className={`text-[10px] px-2 py-1 rounded-full border ${getSentimentColor(s.sentiment)}`}
            >
              {s.source}: {s.signal.length > 60 ? s.signal.slice(0, 57) + '...' : s.signal}
            </span>
          ))}
        </div>
      )}

      {/* GitHub Quick Stats */}
      <div className="flex items-center gap-4 text-[10px] text-zinc-500">
        <span>GitHub: last push {data.github.lastPushDaysAgo}d ago</span>
        <span>{data.github.openIssues} open issues</span>
        <span className="ml-auto">
          {new Date(data.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
