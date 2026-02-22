'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useState } from 'react';

interface PortfolioChartProps {
    data: Array<{
        timestamp: string;
        totalValueUsd: number;
    }>;
    onPeriodChange?: (period: string) => void;
}

const periods = ['1D', '1W', '1M'];

export default function PortfolioChart({ data, onPeriodChange }: PortfolioChartProps) {
    const [activePeriod, setActivePeriod] = useState('1D');

    const handlePeriod = (p: string) => {
        setActivePeriod(p);
        onPeriodChange?.(p.toLowerCase());
    };

    const formatTime = (ts: string) => {
        const d = new Date(ts);
        if (activePeriod === '1D') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const formatValue = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Calculate change
    const firstVal = data[0]?.totalValueUsd || 0;
    const lastVal = data[data.length - 1]?.totalValueUsd || 0;
    const change = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;
    const isPositive = change >= 0;

    return (
        <div className="bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 rounded-2xl p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Portfolio Value</p>
                    <p className="text-3xl font-bold text-zinc-50 tracking-tight">
                        {formatValue(lastVal)}
                    </p>
                    <p className={`text-sm font-medium mt-0.5 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(2)}%
                    </p>
                </div>

                {/* Period selector */}
                <div className="flex gap-1 bg-zinc-800/60 rounded-lg p-0.5">
                    {periods.map((p) => (
                        <button
                            key={p}
                            onClick={() => handlePeriod(p)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${activePeriod === p
                                ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart */}
            <div className="h-[200px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                        <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={isPositive ? '#06b6d4' : '#ef4444'} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={isPositive ? '#06b6d4' : '#ef4444'} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey="timestamp"
                            tickFormatter={formatTime}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#71717a', fontSize: 10 }}
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            domain={['auto', 'auto']}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#71717a', fontSize: 10 }}
                            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                            width={50}
                        />
                        <Tooltip
                            contentStyle={{
                                background: '#18181b',
                                border: '1px solid #3f3f46',
                                borderRadius: '12px',
                                padding: '8px 12px',
                                fontSize: '12px',
                            }}
                            labelFormatter={(label) => formatTime(String(label))}
                            formatter={(value: any) => [formatValue(Number(value)), 'Value']}
                        />
                        <Area
                            type="monotone"
                            dataKey="totalValueUsd"
                            stroke={isPositive ? '#06b6d4' : '#ef4444'}
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorValue)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
