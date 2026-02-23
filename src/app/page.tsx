'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { AdapterCard, RiskBadge } from '../components/Dashboard';
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
  const [loading, setLoading] = useState(true);

  const { address: connectedWallet, isConnected } = useAccount();
  const wallet = isConnected ? connectedWallet : null;

  const fetchData = useCallback(async () => {
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
      console.error('Failed to fetch data:', err);
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

  useEffect(() => {
    if (!isConnected) {
      setPortfolio(null);
      setDefiMetrics(null);
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
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Portfolio Value</p>
                <div className="flex items-baseline gap-3">
                  <p className="text-4xl md:text-5xl font-bold text-zinc-50 tracking-tight">
                    ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {totalChangeDirection !== 'neutral' && (
                    <span className={`flex items-center gap-1 text-sm font-semibold ${
                      totalChangeDirection === 'up' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      <span>{totalChangeDirection === 'up' ? '▲' : '▼'}</span>
                      {totalChangePercent.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Overall Risk:</span>
                <RiskBadge level={overallLevel} size="lg" />
              </div>
            </div>

            {/* Adapter Cards */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Protocol Allocations</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <div className="text-center py-12">
                  <p className="text-sm text-zinc-600">No adapter data yet. Deposit into ShieldVault to see your portfolio.</p>
                </div>
              )}
            </div>

            {/* DeFi Metrics Summary */}
            {(defiMetrics?.aave || defiMetrics?.compound) && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Live DeFi Metrics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {defiMetrics.aave && (
                    <div className="p-4 bg-zinc-800/40 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span>🔵</span>
                        <span className="text-sm font-semibold text-zinc-200">AAVE V3</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase">Supply APY</p>
                          <p className="text-sm font-semibold text-emerald-400">{defiMetrics.aave.supplyApy}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase">Borrow APY</p>
                          <p className="text-sm font-semibold text-orange-400">{defiMetrics.aave.borrowApy}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase">Utilization</p>
                          <p className="text-sm font-semibold text-zinc-300">{defiMetrics.aave.utilization}%</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {defiMetrics.compound && (
                    <div className="p-4 bg-zinc-800/40 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span>🟢</span>
                        <span className="text-sm font-semibold text-zinc-200">Compound V3</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase">Supply APR</p>
                          <p className="text-sm font-semibold text-emerald-400">{defiMetrics.compound.supplyApr}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase">Borrow APR</p>
                          <p className="text-sm font-semibold text-orange-400">{defiMetrics.compound.borrowApr}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase">Utilization</p>
                          <p className="text-sm font-semibold text-zinc-300">{defiMetrics.compound.utilization}%</p>
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
