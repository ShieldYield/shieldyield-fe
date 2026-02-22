'use client';

interface RiskBadgeProps {
    level: string;
    score?: number;
    size?: 'sm' | 'md' | 'lg';
}

const levelConfig: Record<string, { bg: string; text: string; glow: string }> = {
    SAFE: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', glow: 'shadow-emerald-500/20' },
    WATCH: { bg: 'bg-amber-500/15', text: 'text-amber-400', glow: 'shadow-amber-500/20' },
    WARNING: { bg: 'bg-orange-500/15', text: 'text-orange-400', glow: 'shadow-orange-500/20' },
    CRITICAL: { bg: 'bg-red-500/15', text: 'text-red-400', glow: 'shadow-red-500/20' },
};

const sizeClasses: Record<string, string> = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
};

export default function RiskBadge({ level, score, size = 'md' }: RiskBadgeProps) {
    const config = levelConfig[level] || levelConfig.SAFE;

    return (
        <span
            className={`
                inline-flex items-center gap-1.5 rounded-full font-semibold
                ${config.bg} ${config.text} ${config.glow} shadow-sm
                ${sizeClasses[size]}
            `}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${config.text.replace('text-', 'bg-')} animate-pulse`} />
            {level}
            {score !== undefined && <span className="opacity-70">({score})</span>}
        </span>
    );
}
