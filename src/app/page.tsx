'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { AdapterCard, RiskBadge, SentinelBanner, VaultActions, LiveYieldTicker, FundFlowDiagram } from '../components/Dashboard';
import type { SentinelData } from '../components/Dashboard';
import { Header } from '../components/Header';
import { Navbar } from '../components/Navbar';
import { useSimMode } from '../context/SimModeContext';

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

  const { address: connectedWallet, isConnected } = useAccount();
  const wallet = isConnected ? connectedWallet : null;
  const { isSimMode } = useSimMode();

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

  // Portfolio: poll every 30s (blockchain reads are free)
  useEffect(() => {
    setLoading(true);
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 10_000);
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

  // ── Sim-inject polling: poll inject-state setiap 2s.
  // Jika skenario berubah (inject/clear), refetch semua data otomatis tanpa refresh.
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

  // ── Bridge Status Polling: Poll more frequently when a bridge is pending ──
  const isAnyBridgePending = (portfolio?.pendingBridgeMessages?.length ?? 0) > 0;
  useEffect(() => {
    if (!isAnyBridgePending) return;

    // When a bridge is pending, poll portfolio every 5s instead of 10s to see status changes faster
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

  // Compute weighted APY for interpolation
  const adapterEntries = Object.values(adapters) as any[];
  const totalBal = adapterEntries.reduce((s: number, a: any) => s + (a.balance || 0), 0);
  const weightedApy = totalBal > 0
    ? adapterEntries.reduce((s: number, a: any) => s + (a.balance || 0) * (a.apy || 0), 0) / totalBal
    : 0;
  const yieldPerSecond = (totalBal * (weightedApy / 100)) / 31_536_000;

  // Sync on new poll data
  useEffect(() => {
    baseTotalRef.current = totalValue;
    lastPollRef.current = Date.now();
    setLiveTotal(totalValue);
  }, [totalValue]);

  // Tick every 100ms
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

  // AUTO-CLAIM UI SIMULATION:
  // If there are funds arrived on Base but not yet claimed, we show them 
  // as part of the Base balance so the user sees their total value immediately.
  const baseBalance = rawBaseBalance + unclaimedBase;
  const isClaimingAvailable = unclaimedBase > 0.001;

  // History combined: Show both pending and completed
  const bridgeHistory = [
    ...(portfolio?.pendingBridgeMessages || []),
    ...(portfolio?.completedBridgeMessages || [])
  ].sort((a, b) => b.sourceBlockNumber - a.sourceBlockNumber);

  const globalTotalCalc = arbBalance + baseBalance + ccipPending;
  const arbPercent = globalTotalCalc > 0 ? (arbBalance / globalTotalCalc) * 100 : 100;
  const basePercent = globalTotalCalc > 0 ? (baseBalance / globalTotalCalc) * 100 : 0;
  const ccipPercent = globalTotalCalc > 0 ? (ccipPending / globalTotalCalc) * 100 : 0;
  const unclaimedPercent = globalTotalCalc > 0 ? (unclaimedBase / globalTotalCalc) * 100 : 0;

  const hasBridged = baseBalance > 0.001 || ccipPending > 0 || unclaimedBase > 0;
  const isCcipPending = ccipPending > 0.001;
  const pendingMessages = portfolio?.pendingBridgeMessages ?? [];

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
            {/* Hero: Global Portfolio + Chain Breakdown + Risk */}
            <div className="flex flex-col p-6 md:p-10 bg-zinc-900/40 border border-zinc-800/80 rounded-[2rem] relative overflow-hidden shadow-2xl">
              {/* Background gradient effect */}
              <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl -z-10 pointer-events-none translate-x-1/3 -translate-y-1/3" />

              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 relative z-10 w-full">
                <div className="w-full md:w-auto">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
                    <div className="flex items-center gap-2.5">
                      <p className="text-sm text-zinc-400 uppercase tracking-widest font-medium">Global Portfolio Value</p>
                      <div className="flex items-center justify-center px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">
                        <span className="relative flex h-1.5 w-1.5 mr-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                        </span>
                        <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest">Live</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-6">
                    <p className="text-6xl sm:text-7xl md:text-[5rem] font-light text-zinc-50 tracking-tight font-mono tabular-nums leading-none">
                      ${liveTotal.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })}
                    </p>

                    {/* Chain Distribution Badges inline with Hero */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-xl">
                        <div className="flex items-center justify-center w-6 h-6 rounded bg-blue-500/20 text-xs">⚡</div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-zinc-500 uppercase font-medium leading-none">Arbitrum</span>
                          <span className="text-sm font-mono font-medium text-blue-400 leading-tight">
                            ${arbBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          </span>
                        </div>
                      </div>

                      {ccipPending > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 border border-emerald-500/30 rounded-xl relative overflow-hidden bg-emerald-500/10 transition-colors">
                          <div className="flex items-center justify-center w-6 h-6 rounded bg-emerald-500/20 text-xs">🛡️</div>
                          <div className="flex flex-col relative z-10">
                            <span className="text-[10px] text-emerald-400 uppercase font-medium leading-none inline-flex items-center gap-1.5">
                              Success: Shielding
                              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                            </span>
                            <span className="text-sm font-mono font-medium text-emerald-400 leading-tight">
                              ${ccipPending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors ${baseBalance > 0 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-zinc-800/40 border-zinc-700/40"}`}>
                        <div className={`flex items-center justify-center w-6 h-6 rounded text-xs ${baseBalance > 0 ? "bg-emerald-500/20 shadow-sm shadow-emerald-500/20" : "bg-zinc-700/50"}`}>🛡️</div>
                        <div className="flex flex-col">
                          <span className={`text-[10px] uppercase font-medium leading-none ${baseBalance > 0 ? "text-emerald-500/80" : "text-zinc-500"}`}>Base <span className="hidden sm:inline">Safe Haven</span></span>
                          <span className={`text-sm font-mono font-medium leading-tight ${baseBalance > 0 ? "text-emerald-400" : "text-zinc-400"}`}>
                            ${baseBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          </span>
                        </div>
                      </div>

                      {unclaimedBase > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl relative overflow-hidden transition-all duration-500 shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:border-cyan-500/50">
                          <div className="flex items-center justify-center w-6 h-6 rounded bg-cyan-500/20 text-xs">🎁</div>
                          <div className="flex flex-col z-10">
                            <span className="text-[10px] text-cyan-400/80 uppercase font-medium leading-none">Claimable</span>
                            <span className="text-sm font-mono font-medium text-cyan-300 leading-tight">
                              ${unclaimedBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end gap-3 z-10 border-t md:border-t-0 md:border-l border-zinc-800/60 pt-6 md:pt-0 md:pl-10 mt-6 md:mt-0 w-full md:w-auto h-full justify-between">
                  <div className="text-left md:text-right flex flex-col items-start md:items-end w-full">
                    <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block mb-3">Portfolio Health</span>
                    <RiskBadge level={overallLevel} size="lg" />

                    {totalChangeDirection !== 'neutral' && (
                      <span className={`mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${totalChangeDirection === 'up' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                        <span>{totalChangeDirection === 'up' ? '▲' : '▼'}</span>
                        {totalChangePercent.toFixed(2)}%
                      </span>
                    )}

                    <button
                      onClick={() => setShowBridgeDetails(!showBridgeDetails)}
                      className="mt-8 flex items-center justify-center gap-2 px-5 py-2.5 bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 hover:border-zinc-600 rounded-xl text-xs font-medium text-zinc-300 transition-all active:scale-[0.98] w-full md:w-auto"
                    >
                      {showBridgeDetails ? 'Hide Bridge Details' : 'View Bridge Details'}
                      <svg
                        className={`w-4 h-4 transition-transform duration-300 ${showBridgeDetails ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* CCIP Dropdown Details */}
              <div className={`transition-all duration-500 ease-in-out overflow-hidden ${showBridgeDetails ? 'max-h-[800px] mt-8 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="pt-8 border-t border-zinc-800/60 pb-2">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    {/* Visual Flow Column */}
                    <div>
                      <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-6">Cross-Chain Distribution</h4>

                      {/* Chain Proportion Bar */}
                      <div className="space-y-3 mb-10">
                        <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium">
                          <span className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                            Arbitrum {arbPercent.toFixed(0)}%
                          </span>
                          {isCcipPending && (
                            <span className="flex items-center gap-2 text-emerald-400 animate-pulse">
                              Shielding in Progress {ccipPercent.toFixed(0)}%
                            </span>
                          )}
                          <span className="flex items-center gap-2">
                            Base {basePercent.toFixed(0)}%
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          </span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-zinc-800/80 overflow-hidden flex shadow-inner">
                          <div
                            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-700 rounded-l-full"
                            style={{ width: `${arbPercent}%` }}
                          />
                          {ccipPercent > 0 && (
                            <div
                              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700 animate-pulse"
                              style={{ width: `${ccipPercent}%` }}
                            />
                          )}
                          {basePercent > 0 && (
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700 rounded-r-full"
                              style={{ width: `${basePercent}%` }}
                            />
                          )}
                        </div>
                      </div>

                      {/* CCIP Flow Diagram */}
                      <div className="flex items-center justify-between gap-2 px-2 pb-2">
                        {/* Arbitrum Node */}
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-20 h-20 rounded-2xl bg-zinc-800/80 border border-blue-500/30 flex flex-col items-center justify-center gap-1.5 shadow-lg shadow-blue-900/10">
                            <span className="text-2xl">⚡</span>
                            <span className="text-[11px] text-blue-400 font-medium uppercase tracking-wider">ARB</span>
                          </div>
                          <span className="text-xs text-zinc-400 font-mono font-medium">
                            ${arbBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        {/* Bridge Arrow */}
                        <div className="flex flex-col items-center gap-2 flex-1 max-w-[200px]">
                          <div className="relative w-full flex items-center justify-center">
                            <div className={`w-full h-px ${hasBridged ? 'bg-gradient-to-r from-blue-500/60 via-cyan-400/80 to-emerald-500/60' : 'bg-zinc-700'}`} />
                            {(hasBridged || isCcipPending) && (
                              <div
                                className={`absolute w-3 h-3 rounded-full shadow-lg ${isCcipPending ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]' : 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.5)]'}`}
                                style={{
                                  animation: 'slideRight 2s ease-in-out infinite',
                                  left: 0,
                                }}
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[11px] font-bold ${isCcipPending ? 'text-emerald-400 animate-pulse' : 'text-cyan-500'} uppercase tracking-widest`}>
                              {isCcipPending ? 'EVACUATING' : 'CCIP'}
                            </span>
                            {hasBridged && !isCcipPending && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
                          </div>
                          {isCcipPending && (
                            <span className="text-xs font-mono text-emerald-400 font-medium bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                              ${ccipPending.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>

                        {/* Base Node */}
                        <div className="flex flex-col items-center gap-3">
                          <div className={`w-20 h-20 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all duration-500 shadow-lg ${hasBridged
                            ? 'bg-emerald-500/10 border-emerald-500/40 shadow-emerald-900/10'
                            : 'bg-zinc-800/80 border-zinc-700 shadow-none'
                            }`}>
                            <span className="text-2xl">🛡️</span>
                            <span className={`text-[11px] font-medium uppercase tracking-wider ${hasBridged ? 'text-emerald-400' : 'text-zinc-500'}`}>
                              BASE
                            </span>
                          </div>
                          <span className={`text-xs font-mono font-medium ${hasBridged ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            ${baseBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pending Transfers Column */}
                    <div className="flex flex-col h-full">
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Active Bridge Transfers</h4>
                        <a
                          href="https://ccip.chain.link"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-cyan-500 hover:text-cyan-400 flex items-center gap-1.5 font-medium transition-colors bg-cyan-500/10 px-3 py-1.5 rounded-lg border border-cyan-500/20"
                        >
                          CCIP Explorer <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor"><path d="M5.5 1H9v3.5M9 1L4 6M2 2H1v7h7V8" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </a>
                      </div>

                      {pendingMessages.length > 0 ? (
                        <div className="space-y-3 flex-1">
                          {pendingMessages.map((msg: any) => (
                            <a
                              key={msg.messageId}
                              href={msg.ccipExplorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block px-5 py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all group"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                                  <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
                                    SUCCESS: SHIELDING
                                  </span>
                                </div>
                                <span className="text-base font-mono font-medium text-emerald-400">
                                  ${msg.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[11px] text-emerald-500/80 bg-emerald-500/10 px-2.5 py-1 rounded w-fit border border-emerald-500/20">
                                  ID: {msg.messageId.slice(0, 10)}...{msg.messageId.slice(-6)}
                                </span>
                                <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                  Track Transfer →
                                </span>
                              </div>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center flex-1 min-h-[160px] px-6 bg-zinc-800/30 border border-zinc-800/60 rounded-2xl text-center shadow-inner">
                          <span className="text-3xl mb-3 opacity-50 grayscale select-none">🌉</span>
                          <p className="text-sm font-medium text-zinc-400">No active transfers</p>
                          <p className="text-xs text-zinc-500 mt-2 max-w-[220px]">Funds are currently secure. No cross-chain evacuation is in progress.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <style>{`
                  @keyframes slideRight {
                      0% { transform: translateX(0) scale(1); opacity: 0; }
                      10% { opacity: 1; transform: translateX(10%) scale(1); }
                      90% { opacity: 1; transform: translateX(80%) scale(1); }
                      100% { transform: translateX(calc(100% + 140px)) scale(0.8); opacity: 0; }
                  }
              `}</style>
            </div>

            {/* Vault Actions: Deposit & Withdraw */}
            <div className="pt-4">
              <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-widest mb-4">Vault Actions</h2>
              <div className="max-w-md">
                <VaultActions onSuccess={fetchPortfolio} />
              </div>
            </div>

            {/* Live Yield Ticker */}
            {Object.keys(adapters).length > 0 && (() => {
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



            {/* Bridge History Section */}
            {bridgeHistory.length > 0 && (
              <div className="pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-widest">Bridge Activity Log</h2>
                  <span className="text-[10px] text-zinc-600 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    On-Chain Verified
                  </span>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800/50 bg-zinc-900/20">
                          <th className="px-5 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Date</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Destination</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Amount</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Status</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/30">
                        {bridgeHistory.map((msg: any) => (
                          <tr key={msg.messageId} className="hover:bg-zinc-800/20 transition-colors group">
                            <td className="px-5 py-4 whitespace-nowrap">
                              <span className="text-xs text-zinc-400 font-mono">
                                {new Date(msg.sourceBlockNumber * 260 + 1710000000000).toLocaleDateString()}
                              </span>
                            </td>
                            <td className="px-5 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-300">{msg.destinationChain}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4 whitespace-nowrap">
                              <span className="text-xs font-mono font-bold text-zinc-200">${msg.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                            </td>
                            <td className="px-5 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter ${
                                msg.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                                msg.status === 'FAILED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                                'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse'
                              }`}>
                                {msg.status === 'PENDING' || msg.status === 'IN_PROGRESS' ? 'SUCCESS: EVACUATING' : msg.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 whitespace-nowrap text-right">
                              <a 
                                href={msg.ccipExplorerUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[10px] text-cyan-500 hover:text-cyan-400 font-bold uppercase tracking-widest transition-colors opacity-60 group-hover:opacity-100"
                              >
                                View Explorer ↗
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
