'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { RiskBadge, ActivityFeed, SentinelBanner } from '../../components/Dashboard';
import type { SentinelData } from '../../components/Dashboard';
import { Header } from '../../components/Header';
import { Navbar } from '../../components/Navbar';
import { getProtocolLink } from '../../lib/protocol-links';

export default function ProtocolPage() {
    const [portfolio, setPortfolio] = useState<any>(null);
    const [logs, setLogs] = useState<any[]>([]);
    const [defiMetrics, setDefiMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedAdapter, setSelectedAdapter] = useState<string | null>(null);
    const [sentinelData, setSentinelData] = useState<SentinelData | null>(null);
    const [sentinelLoading, setSentinelLoading] = useState(false);

    const { address: connectedWallet, isConnected } = useAccount();
    const wallet = isConnected ? connectedWallet : null;

    const fetchData = useCallback(async () => {
        if (!wallet) {
            setPortfolio(null);
            setLogs([]);
            setLoading(false);
            return;
        }
        try {
            const [portRes, metricsRes] = await Promise.all([
                fetch(`/api/portfolio/live?wallet=${wallet}`),
                fetch('/api/defi-metrics'),
            ]);
            if (portRes.ok) setPortfolio(await portRes.json());
            if (metricsRes.ok) setDefiMetrics(await metricsRes.json());
        } catch (err) {
            console.error('Failed to fetch:', err);
        } finally {
            setLoading(false);
        }
    }, [wallet]);

    useEffect(() => {
        setLoading(true);
        fetchData();
        const interval = setInterval(fetchData, 15000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Clear state on disconnect
    useEffect(() => {
        if (!isConnected) {
            setPortfolio(null);
            setLogs([]);
        }
    }, [isConnected]);

    // Fetch AI Sentinel for selected adapter
    useEffect(() => {
        if (!selectedAdapter) {
            setSentinelData(null);
            return;
        }
        let cancelled = false;
        setSentinelLoading(true);
        fetch(`/api/ai-sentinel?protocol=${selectedAdapter}`)
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
                if (!cancelled) setSentinelData(data);
            })
            .catch(() => {
                if (!cancelled) setSentinelData(null);
            })
            .finally(() => {
                if (!cancelled) setSentinelLoading(false);
            });
        return () => { cancelled = true; };
    }, [selectedAdapter]);

    const adapters: Record<string, any> = portfolio?.adapters || {};
    const riskScores: Record<string, any> = portfolio?.riskScores || {};

    const protocolMeta: Record<string, { icon: string; color: string; metricsKey: string }> = {
        AaveAdapter: { icon: '🔵', color: 'from-blue-500/20', metricsKey: 'aave' },
        CompoundAdapter: { icon: '🟢', color: 'from-green-500/20', metricsKey: 'compound' },
        MorphoAdapter: { icon: '🟣', color: 'from-purple-500/20', metricsKey: '' },
        YieldMaxAdapter: { icon: '🟡', color: 'from-yellow-500/20', metricsKey: '' },
    };

    const filteredLogs = selectedAdapter
        ? logs.filter((l) => l.adapter === selectedAdapter)
        : logs;

    return (
        <div className="flex flex-col w-full min-h-screen bg-zinc-950">
            <header className="w-full sticky top-0 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 z-50">
                <Header />
            </header>

            <main className="grow w-full py-6 px-4 md:px-8 lg:px-16 pb-28">
                {loading ? (
                    <div className="flex items-center justify-center h-[60vh]">
                        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="max-w-7xl mx-auto space-y-6">
                        <h1 className="text-2xl font-bold text-zinc-100">Protocols</h1>

                        {/* Protocol Table */}
                        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-zinc-800">
                                        <th className="text-left text-[10px] uppercase tracking-wider text-zinc-500 px-5 py-3">Protocol</th>
                                        <th className="text-right text-[10px] uppercase tracking-wider text-zinc-500 px-5 py-3">Balance</th>
                                        <th className="text-right text-[10px] uppercase tracking-wider text-zinc-500 px-5 py-3">APY</th>
                                        <th className="text-right text-[10px] uppercase tracking-wider text-zinc-500 px-5 py-3">Allocation</th>
                                        <th className="text-center text-[10px] uppercase tracking-wider text-zinc-500 px-5 py-3">Risk</th>
                                        <th className="text-right text-[10px] uppercase tracking-wider text-zinc-500 px-5 py-3">Utilization</th>
                                        <th className="text-center text-[10px] uppercase tracking-wider text-zinc-500 px-5 py-3">Link</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(adapters).map(([name, data]: [string, any]) => {
                                        const meta = protocolMeta[name] || { icon: '⚪', color: 'from-zinc-500/20', metricsKey: '' };
                                        const risk = riskScores[name];
                                        const metrics = meta.metricsKey ? defiMetrics?.[meta.metricsKey] : null;
                                        const util = metrics?.utilization ?? '—';

                                        return (
                                            <tr
                                                key={name}
                                                onClick={() => setSelectedAdapter(selectedAdapter === name ? null : name)}
                                                className={`border-b border-zinc-800/50 cursor-pointer transition-colors duration-200
                                                    ${selectedAdapter === name ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/20'}`}
                                            >
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="text-lg">{meta.icon}</span>
                                                        <span className="text-sm font-semibold text-zinc-200">
                                                            {name.replace('Adapter', '')}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="text-right px-5 py-4 text-sm font-medium text-zinc-200">
                                                    ${data.balance?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                                                </td>
                                                <td className="text-right px-5 py-4 text-sm font-medium text-emerald-400">
                                                    {data.apy?.toFixed(2) || '0.00'}%
                                                </td>
                                                <td className="text-right px-5 py-4">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-linear-to-r from-cyan-500 to-blue-500 rounded-full"
                                                                style={{ width: `${Math.min(data.allocation || 0, 100)}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs text-zinc-400 w-10 text-right">
                                                            {(data.allocation || 0).toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="text-center px-5 py-4">
                                                    {risk && <RiskBadge level={risk.level} score={risk.score} size="sm" />}
                                                </td>
                                                <td className="text-right px-5 py-4 text-sm text-zinc-400">
                                                    {typeof util === 'number' ? `${util.toFixed(1)}%` : util}
                                                </td>
                                                <td className="text-center px-5 py-4">
                                                    {(() => {
                                                        const link = getProtocolLink(name);
                                                        return link ? (
                                                            <a
                                                                href={link.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                                                            >
                                                                View ↗
                                                            </a>
                                                        ) : null;
                                                    })()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {Object.keys(adapters).length === 0 && (
                                <div className="text-center py-12">
                                    <p className="text-sm text-zinc-600">No protocol data yet.</p>
                                </div>
                            )}
                        </div>

                        {/* YieldMax Top Opportunities */}
                        {adapters['YieldMaxAdapter']?.topPools?.length > 0 && (
                            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-base">🟡</span>
                                    <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                                        YieldMax — Top USDC Opportunities
                                    </h3>
                                    <span className="ml-auto text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">Arbitrum · DeFiLlama</span>
                                </div>
                                <p className="text-[11px] text-zinc-500 mb-4">
                                    YieldMax routes funds to the highest-yielding USDC lending protocol on Arbitrum, rebalancing automatically.
                                </p>
                                <div className="space-y-1.5">
                                    {adapters['YieldMaxAdapter'].topPools.map((pool: { protocol: string; apy: number }, i: number) => (
                                        <div key={pool.protocol} className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${i === 0 ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-zinc-800/40'}`}>
                                            <div className="flex items-center gap-2.5">
                                                <span className="text-[10px] text-zinc-600 w-4">#{i + 1}</span>
                                                <span className={`text-xs font-medium capitalize ${i === 0 ? 'text-zinc-100' : 'text-zinc-300'}`}>
                                                    {pool.protocol.replace(/-/g, ' ')}
                                                </span>
                                                {i === 0 && <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">active</span>}
                                            </div>
                                            <span className={`text-sm font-bold ${i === 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                                                {pool.apy.toFixed(2)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* CCIP Safe Haven */}
                        {defiMetrics?.safeHaven && (
                            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-base">🔗</span>
                                    <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                                        CCIP Safe Haven
                                    </h3>
                                </div>
                                <p className="text-[11px] text-zinc-500 mb-4">
                                    When risk is <span className="text-red-400 font-semibold">CRITICAL</span>, funds bridge via Chainlink CCIP to Base and re-deploy into safe lending protocols.
                                </p>

                                {/* Column headers */}
                                <div className="grid grid-cols-3 gap-2 mb-2 px-1">
                                    <div />
                                    <p className="text-[10px] text-zinc-500 text-center uppercase tracking-wider">Arbitrum</p>
                                    <p className="text-[10px] text-cyan-500/70 text-center uppercase tracking-wider">Base ← safe</p>
                                </div>

                                {/* Aave row */}
                                <div className="grid grid-cols-3 gap-2 items-center mb-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm">🔵</span>
                                        <span className="text-xs font-semibold text-zinc-300">Aave v3</span>
                                    </div>
                                    <div className="p-2.5 bg-zinc-800/40 rounded-xl text-center">
                                        <p className="text-sm font-semibold text-emerald-400">{defiMetrics.aave?.supplyApy ?? '—'}%</p>
                                        <p className="text-[10px] text-zinc-600 mt-0.5">util {defiMetrics.aave?.utilization ?? '—'}%</p>
                                    </div>
                                    <div className="p-2.5 bg-zinc-800/40 rounded-xl text-center border border-cyan-500/20">
                                        <p className="text-sm font-semibold text-emerald-400">{defiMetrics.safeHaven.aave?.supplyApy ?? '—'}%</p>
                                        <p className="text-[10px] text-zinc-600 mt-0.5">util {defiMetrics.safeHaven.aave?.utilization ?? '—'}%</p>
                                    </div>
                                </div>

                                {/* Compound row */}
                                <div className="grid grid-cols-3 gap-2 items-center">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm">🟢</span>
                                        <span className="text-xs font-semibold text-zinc-300">Compound v3</span>
                                    </div>
                                    <div className="p-2.5 bg-zinc-800/40 rounded-xl text-center">
                                        <p className="text-sm font-semibold text-emerald-400">{defiMetrics.compound?.supplyApr ?? '—'}%</p>
                                        <p className="text-[10px] text-zinc-600 mt-0.5">util {defiMetrics.compound?.utilization ?? '—'}%</p>
                                    </div>
                                    <div className="p-2.5 bg-zinc-800/40 rounded-xl text-center border border-cyan-500/20">
                                        <p className="text-sm font-semibold text-emerald-400">{defiMetrics.safeHaven.compound?.supplyApr ?? '—'}%</p>
                                        <p className="text-[10px] text-zinc-600 mt-0.5">util {defiMetrics.safeHaven.compound?.utilization ?? '—'}%</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Protocol Detail + Activity */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* DeFi Metrics Detail */}
                            {selectedAdapter && (
                                <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
                                    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                                        {selectedAdapter.replace('Adapter', '')} Details
                                    </h3>
                                    {(() => {
                                        const data = adapters[selectedAdapter];
                                        const meta = protocolMeta[selectedAdapter];
                                        const metrics = meta?.metricsKey ? defiMetrics?.[meta.metricsKey] : null;

                                        return (
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="p-3 bg-zinc-800/40 rounded-xl">
                                                        <p className="text-[10px] text-zinc-500 uppercase">Principal</p>
                                                        <p className="text-lg font-bold text-zinc-200">${data?.principal?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                                    </div>
                                                    <div className="p-3 bg-zinc-800/40 rounded-xl">
                                                        <p className="text-[10px] text-zinc-500 uppercase">Accrued Yield</p>
                                                        <p className="text-lg font-bold text-cyan-400">+${data?.accruedYield?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                                    </div>
                                                </div>
                                                {metrics && (
                                                    <div>
                                                        <p className="text-[10px] text-zinc-500 uppercase mb-2">Live Market Data</p>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <div className="p-2.5 bg-zinc-800/40 rounded-lg text-center">
                                                                <p className="text-[10px] text-zinc-500">Supply</p>
                                                                <p className="text-sm font-semibold text-emerald-400">
                                                                    {metrics.supplyApy || metrics.supplyApr}%
                                                                </p>
                                                            </div>
                                                            <div className="p-2.5 bg-zinc-800/40 rounded-lg text-center">
                                                                <p className="text-[10px] text-zinc-500">Borrow</p>
                                                                <p className="text-sm font-semibold text-orange-400">
                                                                    {metrics.borrowApy || metrics.borrowApr}%
                                                                </p>
                                                            </div>
                                                            <div className="p-2.5 bg-zinc-800/40 rounded-lg text-center">
                                                                <p className="text-[10px] text-zinc-500">Util</p>
                                                                <p className={`text-sm font-semibold ${metrics.utilization > 85 ? 'text-orange-400' :
                                                                    metrics.utilization > 95 ? 'text-red-400' : 'text-zinc-300'
                                                                    }`}>
                                                                    {metrics.utilization}%
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* AI Sentinel per-adapter */}
                            {selectedAdapter && (
                                <div className="lg:col-span-2">
                                    <SentinelBanner data={sentinelData} loading={sentinelLoading} />
                                </div>
                            )}

                            {/* Activity Feed */}
                            <div className={selectedAdapter ? '' : 'lg:col-span-2'}>
                                <ActivityFeed logs={filteredLogs} />
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center pointer-events-none">
                <div className="pointer-events-auto">
                    <Navbar />
                </div>
            </div>
        </div>
    );
}
