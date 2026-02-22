'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdapterCard, PortfolioChart, AnomalyTicker, RiskBadge } from '../components/Dashboard';
import { Header } from '../components/Header';
import { Navbar } from '../components/Navbar';

// Default wallet for testing (from deployed contracts)
const DEFAULT_WALLET = '0xcFBd47c63D284A8F824e586596Df4d5c57326c8B';

interface SnapshotData {
  snapshot: any;
  defiMetrics: { aave: any; compound: any };
  recentAnomalies: any[];
}

interface HistoryData {
  history: Array<{ timestamp: string; totalValueUsd: number }>;
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [period, setPeriod] = useState('1d');
  const [loading, setLoading] = useState(true);

  const wallet = DEFAULT_WALLET;

  const fetchData = useCallback(async () => {
    try {
      const [snapRes, histRes] = await Promise.all([
        fetch(`/api/monitoring/snapshot?wallet=${wallet}`),
        fetch(`/api/portfolio/history?wallet=${wallet}&period=${period}`),
      ]);
      if (snapRes.ok) setSnapshot(await snapRes.json());
      if (histRes.ok) setHistory(await histRes.json());
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [wallet, period]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const adapters: Record<string, any> = snapshot?.snapshot?.adapters || {};
  const riskScores: Record<string, any> = snapshot?.snapshot?.risk_scores || {};
  const totalValue = snapshot?.snapshot?.total_value_usd || 0;
  const anomalies = snapshot?.recentAnomalies || [];

  // Determine overall risk
  const overallLevel = Object.values(riskScores).reduce(
    (worst: string, r: any) => {
      const order = ['SAFE', 'WATCH', 'WARNING', 'CRITICAL'];
      return order.indexOf(r.level) > order.indexOf(worst) ? r.level : worst;
    },
    'SAFE'
  );

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
        ) : (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Anomaly Ticker */}
            <AnomalyTicker anomalies={anomalies} />

            {/* Hero: Total Value + Risk */}
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Portfolio Value</p>
                <p className="text-4xl md:text-5xl font-bold text-zinc-50 tracking-tight">
                  ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Overall Risk:</span>
                <RiskBadge level={overallLevel} size="lg" />
              </div>
            </div>

            {/* Portfolio Chart */}
            <PortfolioChart
              data={history?.history || []}
              onPeriodChange={setPeriod}
            />

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
                  <p className="text-sm text-zinc-600">No adapter data yet. CRE monitoring will populate this after its first run.</p>
                </div>
              )}
            </div>

            {/* DeFi Metrics Summary */}
            {(snapshot?.defiMetrics?.aave || snapshot?.defiMetrics?.compound) && (
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Live DeFi Metrics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {snapshot.defiMetrics.aave && (
                    <div className="p-4 bg-zinc-800/40 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span>🔵</span>
                        <span className="text-sm font-semibold text-zinc-200">AAVE V3</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase">Supply APY</p>
                          <p className="text-sm font-semibold text-emerald-400">{snapshot.defiMetrics.aave.supplyApy}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase">Borrow APY</p>
                          <p className="text-sm font-semibold text-orange-400">{snapshot.defiMetrics.aave.borrowApy}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase">Utilization</p>
                          <p className="text-sm font-semibold text-zinc-300">{snapshot.defiMetrics.aave.utilization}%</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {snapshot.defiMetrics.compound && (
                    <div className="p-4 bg-zinc-800/40 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span>🟢</span>
                        <span className="text-sm font-semibold text-zinc-200">Compound V3</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase">Supply APR</p>
                          <p className="text-sm font-semibold text-emerald-400">{snapshot.defiMetrics.compound.supplyApr}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase">Borrow APR</p>
                          <p className="text-sm font-semibold text-orange-400">{snapshot.defiMetrics.compound.borrowApr}%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 uppercase">Utilization</p>
                          <p className="text-sm font-semibold text-zinc-300">{snapshot.defiMetrics.compound.utilization}%</p>
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
