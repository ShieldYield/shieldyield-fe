'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { AdapterCard, RiskBadge, SentinelBanner, VaultActions } from '../components/Dashboard';
import type { SentinelData } from '../components/Dashboard';
import { Header } from '../components/Header';
import { Navbar } from '../components/Navbar';

interface PortfolioData {
  totalValueUsd: number;
  totalChangePercent: number;
  totalChangeDirection: 'up' | 'down' | 'neutral';
  adapters: Record<string, any>;
  riskScores: Record<string, any>;
}

export default function Home() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [defiMetrics, setDefiMetrics] = useState<{ aave: any; compound: any } | null>(null);
  const [sentinel, setSentinel] = useState<SentinelData | null>(null);
  const [sentinelLoading, setSentinelLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  const { address: connectedWallet, isConnected } = useAccount();
  const wallet = isConnected ? connectedWallet : null;

  // Fetch portfolio + DeFi metrics (blockchain reads — free, can poll frequently)
  const fetchPortfolio = useCallback(async () => {
    if (!wallet) {
      setPortfolio(null);
      setDefiMetrics(null);
      setLoading(false);
      return;
    }

    try {
      const [portRes, metricsRes] = await Promise.all([
        fetch(`/api/portfolio/live?wallet=${wallet}`),
        fetch('/api/defi-metrics'),
      ]);

      if (portRes.ok) {
        const data = await portRes.json();
        setPortfolio(data);
      }
      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setDefiMetrics({ aave: data.aave, compound: data.compound });
      }
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  // Fetch AI Sentinel data (external APIs — expensive, poll infrequently)
  const fetchSentinel = useCallback(async () => {
    if (!wallet) {
      setSentinel(null);
      setSentinelLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/ai-sentinel?protocol=AaveAdapter');
      if (res.ok) {
        const data = await res.json();
        setSentinel(data);
      }
    } catch (err) {
      console.error('Failed to fetch sentinel:', err);
    } finally {
      setSentinelLoading(false);
    }
  }, [wallet]);

  // Portfolio: poll every 30s (blockchain reads are free)
  useEffect(() => {
    setLoading(true);
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 30_000);
    return () => clearInterval(interval);
  }, [fetchPortfolio]);

  // Sentinel: poll every 5 minutes (saves CryptoPanic & Groq API credits)
  useEffect(() => {
    setSentinelLoading(true);
    fetchSentinel();
    const interval = setInterval(fetchSentinel, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchSentinel]);

  useEffect(() => {
    if (!isConnected) {
      setPortfolio(null);
      setDefiMetrics(null);
      setSentinel(null);
    }
  }, [isConnected]);

  const adapters: Record<string, any> = portfolio?.adapters || {};
  const riskScores: Record<string, any> = portfolio?.riskScores || {};
  const totalValue = portfolio?.totalValueUsd || 0;
  const totalChangePercent = portfolio?.totalChangePercent ?? 0;
  const totalChangeDirection = portfolio?.totalChangeDirection ?? 'neutral';

  const overallLevel = Object.values(riskScores).reduce(
    (worst: string, r: any) => {
      const order = ['SAFE', 'WATCH', 'WARNING', 'CRITICAL'];
      return order.indexOf(r.level) > order.indexOf(worst) ? r.level : worst;
    },
    'SAFE'
  );

  const showConnectPrompt = !isConnected && !portfolio;

  return (
    <div className="flex flex-col w-full min-h-screen bg-zinc-950 transition-all duration-300">
      <header className="w-full sticky top-0 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 z-50">
        <Header />
      </header>

      <main className="grow w-full py-6 px-4 md:px-8 lg:px-16 pb-28">
        {loading ? (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-zinc-500">Loading dashboard...</p>
            </div>
          </div>
        ) : showConnectPrompt ? (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-zinc-700 flex items-center justify-center">
                <span className="text-3xl">🛡️</span>
              </div>
              <h2 className="text-xl font-bold text-zinc-200">
                Welcome to Shield<span className="text-cyan-400">Yield</span>
              </h2>
              <p className="text-sm text-zinc-500 max-w-sm">
                Connect your wallet to monitor your DeFi portfolio, view risk scores, and receive real-time anomaly alerts.
              </p>
              <div className="mt-2 px-4 py-2 bg-zinc-800/60 rounded-lg border border-zinc-700">
                <p className="text-xs text-zinc-600">
                  Click <span className="text-cyan-400 font-medium">Connect Wallet</span> in the top right corner
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Hero: Total Value + Change Indicator + Risk */}
            <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
              <div>
                <p className="text-sm text-zinc-500 uppercase tracking-widest mb-1 font-medium">Total Portfolio Value</p>
                <div className="flex items-baseline gap-4">
                  <p className="text-4xl md:text-5xl font-light text-zinc-50 tracking-tight">
                    ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {totalChangeDirection !== 'neutral' && (
                    <span className={`flex items-center gap-1 text-base font-light ${totalChangeDirection === 'up' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                      <span>{totalChangeDirection === 'up' ? '▲' : '▼'}</span>
                      {totalChangePercent.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-zinc-500 uppercase tracking-widest">Overall Risk</span>
                <RiskBadge level={overallLevel} size="lg" />
              </div>
            </div>

            {/* Vault Actions: Deposit & Withdraw */}
            <div className="pt-4">
              <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-widest mb-4">Vault Actions</h2>
              <div className="max-w-md">
                <VaultActions onSuccess={fetchPortfolio} />
              </div>
            </div>

            {/* AI Sentinel Banner */}
            <div className="pt-4 pb-4">
              <SentinelBanner data={sentinel} loading={sentinelLoading} />
            </div>

            {/* Adapter Cards */}
            <div className="pt-2 space-y-4">
              <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-widest">Protocol Allocations</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.entries(adapters).map(([name, data]) => (
                  <AdapterCard
                    key={name}
                    name={name}
                    data={data as any}
                    riskScore={riskScores[name]}
                  />
                ))}
              </div>
              {Object.keys(adapters).length === 0 && (
                <div className="text-center py-16">
                  <p className="text-base font-light text-zinc-500">No adapter data yet. Deposit into ShieldVault to see your portfolio.</p>
                </div>
              )}
            </div>

            {/* DeFi Metrics Summary */}
            {(defiMetrics?.aave || defiMetrics?.compound) && (
              <div className="mt-6 bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6">
                <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-widest mb-5">Live DeFi Metrics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {defiMetrics.aave && (
                    <div className="p-5 bg-zinc-800/40 rounded-2xl">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-xl">🔵</span>
                        <span className="text-base font-medium text-zinc-200">AAVE V3</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Supply APY</span>
                          <span className="text-base font-light text-emerald-400">{defiMetrics.aave.supplyApy}%</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Borrow APY</span>
                          <span className="text-base font-light text-orange-400">{defiMetrics.aave.borrowApy}%</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Utilization</span>
                          <span className="text-base font-light text-zinc-300">{defiMetrics.aave.utilization}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {defiMetrics.compound && (
                    <div className="p-5 bg-zinc-800/40 rounded-2xl">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-xl">🟢</span>
                        <span className="text-base font-medium text-zinc-200">Compound V3</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Supply APR</span>
                          <span className="text-base font-light text-emerald-400">{defiMetrics.compound.supplyApr}%</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Borrow APR</span>
                          <span className="text-base font-light text-orange-400">{defiMetrics.compound.borrowApr}%</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Utilization</span>
                          <span className="text-base font-light text-zinc-300">{defiMetrics.compound.utilization}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
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
