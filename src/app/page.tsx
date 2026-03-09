'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { AdapterCard, ProtocolTable, RiskBadge, VaultActions, LiveYieldTicker, FundFlowDiagram } from '../components/Dashboard';
import type { SentinelData } from '../components/Dashboard';
import { useSimMode } from '../context/SimModeContext';
import { arbitrumSepolia, baseSepolia } from 'viem/chains';

interface PortfolioData {
  totalValueUsd: number;
  globalTotalValueUsd?: number;
  chainBreakdown?: { arbitrum: number; base: number; pendingBridge?: number; unclaimedBase?: number };
  totalChangePercent: number;
  totalChangeDirection: 'up' | 'down' | 'neutral';
  lastDepositTime: number;
  pendingBridgeMessages?: any[];
  completedBridgeMessages?: any[];
  adapters: Record<string, any>;
  riskScores: Record<string, any>;
}

export default function Home() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [defiMetrics, setDefiMetrics] = useState<{ aave: any; compound: any } | null>(null);
  const [sentinel, setSentinel] = useState<SentinelData | null>(null);
  const [sentinelLoading, setSentinelLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  const { address: connectedWallet, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wallet = isConnected ? connectedWallet : null;
  const { isSimMode } = useSimMode();

  const isBase = chainId === baseSepolia.id;

  // Fetch portfolio + DeFi metrics (blockchain reads — free, can poll frequently)
  const fetchPortfolio = useCallback(async (forceRefresh = false) => {
    if (!wallet) {
      setPortfolio(null);
      setDefiMetrics(null);
      setLoading(false);
      return;
    }

    try {
      const headers: HeadersInit = forceRefresh ? { 'Cache-Control': 'no-cache' } : {};
      const [portRes, metricsRes] = await Promise.all([
        fetch(`/api/portfolio/live?wallet=${wallet}`, { headers }),
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
      // Use injected protocol when a scenario is active, otherwise default to Aave
      let protocol = 'AaveAdapter';
      try {
        const injectRes = await fetch('/api/inject-state');
        if (injectRes.ok) {
          const { scenario } = await injectRes.json();
          if (scenario === 'warning') protocol = 'MorphoAdapter';
          else if (scenario === 'critical') protocol = 'YieldMaxAdapter';
        }
      } catch { /* keep default */ }

      const res = await fetch(`/api/ai-sentinel?protocol=${protocol}`);
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

  // Portfolio: poll every 10s
  useEffect(() => {
    setLoading(true);
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 10_000);
    return () => clearInterval(interval);
  }, [fetchPortfolio]);

  // Sentinel: poll every 5 minutes
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

  // ── Sim-inject polling
  const scenarioKeyRef = useRef<string>("__INIT__");
  useEffect(() => {
    const poll = async () => {
      try {
        const resp = await fetch(`/api/inject-state?t=${Date.now()}`);
        if (!resp.ok) return;
        const { scenario } = await resp.json();
        const key = scenario ?? "null";

        if (scenarioKeyRef.current === "__INIT__") {
          scenarioKeyRef.current = key;
          return;
        }

        if (key !== scenarioKeyRef.current) {
          scenarioKeyRef.current = key;
          fetchPortfolio(true);
          fetchSentinel();
        }
      } catch { /* ignored */ }
    };

    const interval = setInterval(poll, 2_000);
    return () => clearInterval(interval);
  }, [fetchPortfolio, fetchSentinel]);

  // ── Bridge Status Polling
  const isAnyBridgePending = (portfolio?.pendingBridgeMessages?.length ?? 0) > 0;
  useEffect(() => {
    if (!isAnyBridgePending) return;
    const interval = setInterval(() => fetchPortfolio(true), 5_000);
    return () => clearInterval(interval);
  }, [isAnyBridgePending, fetchPortfolio]);

  const adapters: Record<string, any> = portfolio?.adapters || {};
  const riskScores: Record<string, any> = portfolio?.riskScores || {};
  const totalValue = portfolio?.globalTotalValueUsd ?? portfolio?.totalValueUsd ?? 0;
  const totalChangePercent = portfolio?.totalChangePercent ?? 0;
  const totalChangeDirection = portfolio?.totalChangeDirection ?? 'neutral';

  // ── Live total value interpolation ──
  const [liveTotal, setLiveTotal] = useState(totalValue);
  const baseTotalRef = useRef(totalValue);
  const lastPollRef = useRef(Date.now());

  const adapterEntries = Object.values(adapters) as any[];
  const totalBal = adapterEntries.reduce((s: number, a: any) => s + (a.balance || 0), 0);
  const weightedApy = totalBal > 0
    ? adapterEntries.reduce((s: number, a: any) => s + (a.balance || 0) * (a.apy || 0), 0) / totalBal
    : 0;
  const yieldPerSecond = (totalBal * (weightedApy / 100)) / 31_536_000;

  useEffect(() => {
    baseTotalRef.current = totalValue;
    lastPollRef.current = Date.now();
    setLiveTotal(totalValue);
  }, [totalValue]);

  useEffect(() => {
    if (yieldPerSecond <= 0) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - lastPollRef.current) / 1000;
      setLiveTotal(baseTotalRef.current + elapsed * yieldPerSecond);
    }, 100);
    return () => clearInterval(interval);
  }, [yieldPerSecond]);

  const overallLevel = Object.values(riskScores).reduce(
    (worst: string, r: any) => {
      const order = ['SAFE', 'WATCH', 'WARNING', 'CRITICAL'];
      return order.indexOf(r.level) > order.indexOf(worst) ? r.level : worst;
    },
    'SAFE'
  );

  const showConnectPrompt = !isConnected && !portfolio;

  const [showBridgeDetails, setShowBridgeDetails] = useState(false);
  const arbBalance = portfolio?.chainBreakdown?.arbitrum ?? 0;
  const rawBaseBalance = portfolio?.chainBreakdown?.base ?? 0;
  const ccipPending = portfolio?.chainBreakdown?.pendingBridge ?? 0;
  const unclaimedBase = portfolio?.chainBreakdown?.unclaimedBase ?? 0;

  const baseBalance = rawBaseBalance + unclaimedBase;

  const bridgeHistory = [
    ...(portfolio?.pendingBridgeMessages || []),
    ...(portfolio?.completedBridgeMessages || [])
  ].sort((a, b) => b.sourceBlockNumber - a.sourceBlockNumber);

  const globalTotalCalc = arbBalance + baseBalance + ccipPending;
  const arbPercent = globalTotalCalc > 0 ? (arbBalance / globalTotalCalc) * 100 : 100;
  const basePercent = globalTotalCalc > 0 ? (baseBalance / globalTotalCalc) * 100 : 0;
  const ccipPercent = globalTotalCalc > 0 ? (ccipPending / globalTotalCalc) * 100 : 0;

  const hasBridged = baseBalance > 0.001 || ccipPending > 0 || unclaimedBase > 0;
  const isCcipPending = ccipPending > 0.001;
  const pendingMessages = portfolio?.pendingBridgeMessages ?? [];

  return (
    <div className="w-full transition-all duration-300">
      {loading ? (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-zinc-500 font-bold uppercase  text-[10px]">Initializing Guardian...</p>
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
          {/* ─── VAULT SWITCHER ─── */}
            <div className="flex justify-center mb-2">
              <div className="bg-zinc-900/80 border border-zinc-800 p-1.5 rounded-2xl flex items-center gap-1 shadow-2xl backdrop-blur-xl">
                <button 
                  onClick={() => switchChain?.({ chainId: arbitrumSepolia.id })}
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all flex items-center gap-2.5 ${!isBase ? 'bg-[#006aff] text-white shadow-lg shadow-blue-900/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
                >
                  <span className="text-sm">⚡</span>
                  Arbitrum Main
                </button>
                <div className="w-px h-4 bg-zinc-800 mx-1" />
                <button 
                  onClick={() => switchChain?.({ chainId: baseSepolia.id })}
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all flex items-center gap-2.5 ${isBase ? 'bg-[#006aff] text-white shadow-lg shadow-emerald-900/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
                >
                  <span className="text-sm">🛡️</span>
                  Base Safe Haven
                </button>
              </div>
            </div>

            {/* Hero: Global Portfolio + Chain Breakdown + Risk */}
            <div className={`flex flex-col p-6 md:p-10 border rounded-[2.5rem] relative overflow-hidden shadow-2xl transition-all duration-700 ${isBase ? 'bg-emerald-950/10 border-emerald-500/20 shadow-emerald-900/5' : 'bg-zinc-900 border-zinc-800 shadow-zinc-900/20'}`}>
              <div className={`absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-3xl -z-10 pointer-events-none translate-x-1/3 -translate-y-1/3 transition-colors duration-1000 ${isBase ? 'bg-emerald-500/5' : 'bg-cyan-500/5'}`} />

              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 relative z-10 w-full">
                <div className="w-full md:w-auto">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
                    <div className="flex items-center gap-2.5">
                      <p className="text-[14px] text-white uppercase tracking-[0.3em] font-black">{isBase ? 'Protected Portfolio Value' : 'Global Portfolio Value'}</p>
                      <div className={`flex items-center justify-center px-2 py-0.5 border rounded uppercase font-black  text-[8px] ${isBase ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                        <span className="relative flex h-1.5 w-1.5 mr-1.5">
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isBase ? 'bg-emerald-400' : 'bg-emerald-400'}`} />
                          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isBase ? 'bg-emerald-400' : 'bg-emerald-400'}`} />
                        </span>
                        Live
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-6">
                    <p className="text-6xl sm:text-7xl md:text-[5.5rem] font-light text-zinc-50  font-mono tabular-nums leading-none">
                      <span className="text-zinc-500 text-4xl mr-2">$</span>
                      {liveTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </p>

                    <div className="flex flex-wrap items-center gap-3">
                      <button 
                        onClick={() => switchChain?.({ chainId: arbitrumSepolia.id })}
                        className={`flex items-center gap-2.5 px-4 py-2 rounded-2xl border transition-all active:scale-95 ${!isBase ? 'bg-blue-500/10 border-blue-500/40 shadow-lg shadow-blue-900/10' : 'bg-zinc-800/40 border-zinc-700/40 hover:border-zinc-600'}`}
                      >
                        <div className={`flex items-center justify-center w-6 h-6 rounded-lg text-xs ${!isBase ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-700 text-zinc-500'}`}>⚡</div>
                        <div className="flex flex-col items-start text-left">
                          <span className={`text-[9px] uppercase font-black leading-none  ${!isBase ? 'text-blue-400' : 'text-zinc-500'}`}>Arbitrum</span>
                          <span className={`text-xs font-mono font-bold leading-tight ${!isBase ? 'text-blue-300' : 'text-zinc-400'}`}>
                            ${arbBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </button>

                      <button 
                        onClick={() => switchChain?.({ chainId: baseSepolia.id })}
                        className={`flex items-center gap-2.5 px-4 py-2 rounded-2xl border transition-all active:scale-95 ${isBase ? 'bg-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-900/10' : 'bg-zinc-800/40 border-zinc-700/40 hover:border-zinc-600'}`}
                      >
                        <div className={`flex items-center justify-center w-6 h-6 rounded-lg text-xs ${isBase ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-500'}`}>🛡️</div>
                        <div className="flex flex-col items-start text-left">
                          <span className={`text-[9px] uppercase font-black leading-none  ${isBase ? 'text-emerald-400' : 'text-zinc-500'}`}>Base Safe Haven</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-mono font-bold leading-tight ${isBase ? 'text-emerald-300' : 'text-zinc-400'}`}>
                              ${rawBaseBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                            {unclaimedBase > 0 && (
                              <span className="flex h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                            )}
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end gap-3 z-10 border-t md:border-t-0 md:border-l border-zinc-800/60 pt-6 md:pt-0 md:pl-10 mt-6 md:mt-0 w-full md:w-auto h-full justify-between">
                  <div className="text-left md:text-right flex flex-col items-start md:items-end w-full">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-4">Portfolio Integrity</span>
                    <RiskBadge level={isBase ? 'SAFE' : overallLevel} size="lg" />

                    {totalChangeDirection !== 'neutral' && !isBase && (
                      <span className={`mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${totalChangeDirection === 'up' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                        <span>{totalChangeDirection === 'up' ? '▲' : '▼'}</span>
                        {totalChangePercent.toFixed(2)}%
                      </span>
                    )}

                    <button
                      onClick={() => setShowBridgeDetails(!showBridgeDetails)}
                      className={`mt-8 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase  transition-all active:scale-[0.98] w-full md:w-auto ${isBase ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 'bg-[#000080]/50 hover:bg-[#000080]/70 border border-blue-700 text-[#598eff]'}`}
                    >
                      {showBridgeDetails ? 'Hide Distribution' : 'Bridge Analytics'}
                      <svg
                        className={`w-3 h-3 transition-transform duration-300 ${showBridgeDetails ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* CCIP Dropdown Details */}
              <div className={`transition-all duration-500 ease-in-out overflow-hidden ${showBridgeDetails ? 'max-h-[800px] mt-8 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="pt-8 border-t border-zinc-800/60 pb-2">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <div>
                      <h4 className="text-[10px] font-black text-zinc-500 uppercase  mb-6 px-1">Cross-Chain Distribution</h4>
                      <div className="space-y-3 mb-10">
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 font-bold uppercase ">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                            Arbitrum {arbPercent.toFixed(0)}%
                          </span>
                          {isCcipPending && (
                            <span className="flex items-center gap-2 text-cyan-400 animate-pulse">
                              Evacuating {ccipPercent.toFixed(0)}%
                            </span>
                          )}
                          <span className="flex items-center gap-2">
                            Base {basePercent.toFixed(0)}%
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          </span>
                        </div>
                        <div className="w-full h-2.5 rounded-full bg-zinc-800/80 overflow-hidden flex shadow-inner">
                          <div
                            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-700"
                            style={{ width: `${arbPercent}%` }}
                          />
                          {ccipPercent > 0 && (
                            <div
                              className="h-full bg-cyan-400 transition-all duration-700 animate-pulse"
                              style={{ width: `${ccipPercent}%` }}
                            />
                          )}
                          {basePercent > 0 && (
                            <div
                              className="h-full bg-emerald-500 transition-all duration-700"
                              style={{ width: `${basePercent}%` }}
                            />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 px-2 pb-2">
                        <div className="flex flex-col items-center gap-3">
                          <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-500 ${!isBase ? 'bg-blue-500/10 border border-blue-500/40 shadow-lg shadow-blue-900/20' : 'bg-zinc-800/80 border border-zinc-700 opacity-50'}`}>
                            <span className="text-xl">⚡</span>
                            <span className="text-[9px] font-black uppercase ">ARB</span>
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono font-bold">
                            ${arbBalance.toLocaleString()}
                          </span>
                        </div>

                        <div className="flex flex-col items-center gap-2 flex-1 max-w-[150px]">
                          <div className="relative w-full flex items-center justify-center">
                            <div className={`w-full h-px ${hasBridged ? 'bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-500' : 'bg-zinc-800'}`} />
                            {(hasBridged || isCcipPending) && (
                              <div
                                className={`absolute w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]`}
                                style={{ animation: 'slideRight 2s ease-in-out infinite', left: 0 }}
                              />
                            )}
                          </div>
                          <span className={`text-[9px] font-black uppercase  ${isCcipPending ? 'text-cyan-400 animate-pulse' : 'text-zinc-600'}`}>
                            {isCcipPending ? 'Evacuating' : 'CCIP Bridge'}
                          </span>
                        </div>

                        <div className="flex flex-col items-center gap-3">
                          <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-500 ${isBase ? 'bg-emerald-500/10 border border-emerald-500/40 shadow-lg shadow-emerald-900/20' : 'bg-zinc-800/80 border border-zinc-700 opacity-50'}`}>
                            <span className="text-xl">🛡️</span>
                            <span className="text-[9px] font-black uppercase ">BASE</span>
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono font-bold">
                            ${baseBalance.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col h-full">
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="text-[10px] font-black text-zinc-500 uppercase  px-1">Bridge Security Log</h4>
                        <a
                          href="https://ccip.chain.link"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] text-cyan-500 hover:text-cyan-400 flex items-center gap-1.5 font-black uppercase  transition-colors bg-cyan-500/10 px-2 py-1 rounded-md border border-cyan-500/20"
                        >
                          Explorer ↗
                        </a>
                      </div>

                      {pendingMessages.length > 0 ? (
                        <div className="space-y-2">
                          {pendingMessages.map((msg: any) => (
                            <a
                              key={msg.messageId}
                              href={msg.ccipExplorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 hover:border-cyan-500/40 transition-all group"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                                  <span className="text-[10px] font-black text-cyan-400 uppercase ">In Transit</span>
                                </div>
                                <span className="text-sm font-mono font-bold text-cyan-400">
                                  ${msg.amount.toLocaleString()}
                                </span>
                              </div>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center flex-1 min-h-[120px] bg-zinc-900/20 border border-zinc-800/50 rounded-2xl text-center">
                          <span className="text-2xl mb-2 opacity-30">🌉</span>
                          <p className="text-[10px] font-black text-zinc-600 uppercase ">No Active Transfers</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ─── Bridge Activity Log (Moved inside dropdown) ─── */}
                  {bridgeHistory.length > 0 && (
                    <div className="mt-10 border-t border-zinc-800/60 pt-8">
                      <div className="flex items-center justify-between mb-4 px-2">
                        <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Bridge Activity Log</h2>
                        <span className="text-[9px] text-zinc-600 font-bold uppercase  bg-zinc-900/50 px-2 py-1 rounded border border-zinc-800">
                          On-Chain Verified
                        </span>
                      </div>
                      <div className="bg-zinc-900/40 border border-zinc-800/40 rounded-[2rem] overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-800/50 bg-zinc-900/20">
                                <th className="px-6 py-4 text-[9px] font-black text-zinc-500 uppercase ">Date</th>
                                <th className="px-6 py-4 text-[9px] font-black text-zinc-500 uppercase ">Destination</th>
                                <th className="px-6 py-4 text-[9px] font-black text-zinc-500 uppercase ">Amount</th>
                                <th className="px-6 py-4 text-[9px] font-black text-zinc-500 uppercase ">Status</th>
                                <th className="px-6 py-4 text-[9px] font-black text-zinc-500 uppercase  text-right">Details</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/30">
                              {bridgeHistory.map((msg: any) => (
                                <tr key={msg.messageId} className="hover:bg-zinc-800/20 transition-colors group">
                                  <td className="px-6 py-5 whitespace-nowrap">
                                    <span className="text-[10px] text-zinc-400 font-mono font-bold">
                                      {new Date(msg.sourceBlockNumber * 260 + 1710000000000).toLocaleDateString()}
                                    </span>
                                  </td>
                                  <td className="px-6 py-5 whitespace-nowrap">
                                    <span className="text-[10px] text-zinc-300 font-black uppercase ">{msg.destinationChain}</span>
                                  </td>
                                  <td className="px-6 py-5 whitespace-nowrap">
                                    <span className="text-[10px] font-mono font-black text-zinc-200">${msg.amount.toLocaleString()}</span>
                                  </td>
                                  <td className="px-6 py-5 whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase  ${
                                      msg.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                                      msg.status === 'FAILED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                                      'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse'
                                    }`}>
                                      {msg.status}
                                    </span>
                                  </td>
                                  <td className="px-6 py-5 whitespace-nowrap text-right">
                                    <a 
                                      href={msg.ccipExplorerUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-[9px] text-cyan-500 hover:text-cyan-400 font-black uppercase tracking-[0.2em] transition-all opacity-60 group-hover:opacity-100"
                                    >
                                      CCIP ↗
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <style>{`
                  @keyframes slideRight {
                      0% { transform: translateX(0); opacity: 0; }
                      20% { opacity: 1; }
                      80% { opacity: 1; }
                      100% { transform: translateX(120px); opacity: 0; }
                  }
              `}</style>
            </div>


            {/* ─── VAULT ACTIONS & LIVE YIELD ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
              <div className="lg:col-span-1">
                <h2 className="text-[14px] font-black text-white uppercase tracking-[0.3em] mb-5 px-2">Vault Interface</h2>
                <VaultActions onSuccess={fetchPortfolio} />
              </div>

              <div className="lg:col-span-2 space-y-6">
                <h2 className="text-[14px] font-black text-white uppercase tracking-[0.3em] mb-5 px-2">Live Yield Accumulator</h2>
                {/* Live Yield Ticker (Only on Arbitrum or if Base has funds) */}
                {(Object.keys(adapters).length > 0 && (!isBase || rawBaseBalance > 0)) && (() => {
                  const totalYield = adapterEntries.reduce((sum: number, a: any) => sum + (a.accruedYield || 0), 0);
                  return (
                    <LiveYieldTicker
                      totalBalance={totalBal}
                      weightedApy={weightedApy}
                      totalAccruedYield={totalYield}
                      lastDepositTime={portfolio?.lastDepositTime ?? 0}
                      adapters={adapters}
                    />
                  );
                })()}
              </div>
            </div>

            {/* ─── ACTIVE ALLOCATIONS (Full Width) ─── */}
            <div className="space-y-6 pt-4">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-[14px] font-black text-white uppercase tracking-[0.3em]">
                  {isBase ? 'Safe Haven Strategy' : 'Active Allocations'}
                </h2>
                <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-full transition-colors ${isBase ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-zinc-900/50 border-zinc-800'}`}>
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isBase ? 'bg-emerald-400' : 'bg-cyan-400'}`} />
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${isBase ? 'bg-emerald-400' : 'bg-cyan-400'}`} />
                  </span>
                  <span className={`text-[9px] font-black uppercase  ${isBase ? 'text-emerald-400' : 'text-zinc-400'}`}>
                    {isBase ? 'Secured by CCIP' : 'AI Guard Active'}
                  </span>
                </div>
              </div>
              
              <ProtocolTable 
                adapters={adapters} 
                riskScores={riskScores} 
              />
            </div>

          </div>
        )}
    </div>
  );
}
