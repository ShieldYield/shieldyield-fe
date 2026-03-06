'use client';

import { useEffect, useState } from 'react';

interface AdapterData {
    name: string;
    address: string;
    balance: number;
    apy: number;
    isHealthy: boolean;
}

interface SafeHavenData {
    chain: string;
    chainId: number;
    shieldVault: string;
    shieldBridge: string;
    emergencyBridgeCount: number;
    totalBalance: number;
    adapters: AdapterData[];
    safeHavenAdapters: AdapterData[];
    hasFunds: boolean;
    ccipExplorer: string;
}

const PROTOCOL_ICONS: Record<string, string> = {
    AaveAdapter: '🔵',
    CompoundAdapter: '🟢',
    MorphoAdapter: '🟣',
    YieldMaxAdapter: '🟡',
};

export default function CrossChainSafeHaven() {
    const [data, setData] = useState<SafeHavenData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch_ = () =>
            fetch('/api/base-safe-haven')
                .then(r => r.ok ? r.json() : null)
                .then(d => { if (d) setData(d); })
                .catch(() => {})
                .finally(() => setLoading(false));

        fetch_();
        const iv = setInterval(fetch_, 15_000);
        return () => clearInterval(iv);
    }, []);

    const hasBridged = (data?.emergencyBridgeCount ?? 0) > 0 || (data?.totalBalance ?? 0) > 0.001;

    return (
        <div className="relative bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800/60">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <span className="text-lg">🔗</span>
                        {hasBridged && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                    </div>
                    <div>
                        <h3 className="text-sm font-medium text-zinc-200">Cross-Chain Safe Haven</h3>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                            CCIP · Arbitrum → Base Sepolia
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {hasBridged ? (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2.5 py-1 font-medium">
                            FUNDS PROTECTED
                        </span>
                    ) : (
                        <span className="text-[10px] bg-zinc-800 text-zinc-500 border border-zinc-700 rounded-full px-2.5 py-1 font-medium">
                            STANDBY
                        </span>
                    )}
                </div>
            </div>

            <div className="px-6 py-5">
                {/* CCIP Bridge Flow Diagram */}
                <div className="flex items-center justify-center gap-2 mb-6">
                    {/* Arbitrum Node */}
                    <div className="flex flex-col items-center gap-1.5">
                        <div className="w-14 h-14 rounded-xl bg-zinc-800/80 border border-blue-500/30 flex flex-col items-center justify-center gap-0.5">
                            <span className="text-base">⚡</span>
                            <span className="text-[8px] text-blue-400 font-medium uppercase tracking-wider">ARB</span>
                        </div>
                        <span className="text-[9px] text-zinc-600 text-center leading-tight">Arbitrum<br/>Sepolia</span>
                    </div>

                    {/* Bridge Arrow */}
                    <div className="flex flex-col items-center gap-1 flex-1 max-w-[120px]">
                        <div className="relative w-full flex items-center justify-center">
                            {/* Line */}
                            <div className={`w-full h-px ${hasBridged ? 'bg-gradient-to-r from-blue-500/60 via-cyan-400/80 to-emerald-500/60' : 'bg-zinc-700'}`} />
                            {/* Animated packet */}
                            {hasBridged && (
                                <div
                                    className="absolute w-2 h-2 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50"
                                    style={{
                                        animation: 'slideRight 2s ease-in-out infinite',
                                        left: 0,
                                    }}
                                />
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-[8px] font-bold text-cyan-500 uppercase tracking-widest">CCIP</span>
                            {hasBridged && <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />}
                        </div>
                        {data && (
                            <span className="text-[8px] text-zinc-600">
                                {data.emergencyBridgeCount}x bridged
                            </span>
                        )}
                    </div>

                    {/* Base Node */}
                    <div className="flex flex-col items-center gap-1.5">
                        <div className={`w-14 h-14 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all duration-500 ${hasBridged
                            ? 'bg-emerald-500/10 border-emerald-500/40'
                            : 'bg-zinc-800/80 border-zinc-700'
                        }`}>
                            <span className="text-base">🛡️</span>
                            <span className={`text-[8px] font-medium uppercase tracking-wider ${hasBridged ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                BASE
                            </span>
                        </div>
                        <span className="text-[9px] text-zinc-600 text-center leading-tight">Base<br/>Sepolia</span>
                    </div>
                </div>

                {/* Base Sepolia Adapters */}
                {loading ? (
                    <div className="flex items-center justify-center h-20">
                        <div className="w-4 h-4 border border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : data ? (
                    <div className="space-y-2">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">
                            Safe Haven Protocols on Base Sepolia
                        </p>
                        {data.adapters.map(adapter => {
                            const isSafeHaven = adapter.name === 'AaveAdapter' || adapter.name === 'CompoundAdapter';
                            const icon = PROTOCOL_ICONS[adapter.name] || '⚪';
                            const displayName = adapter.name.replace('Adapter', '');
                            const hasMoney = adapter.balance > 0.001;

                            return (
                                <div
                                    key={adapter.name}
                                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all duration-300 ${hasMoney
                                        ? 'bg-emerald-500/5 border-emerald-500/20'
                                        : 'bg-zinc-800/40 border-zinc-700/40'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-sm">{icon}</span>
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-medium text-zinc-300">{displayName}</span>
                                                {isSafeHaven && (
                                                    <span className="text-[8px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full px-1.5 py-0.5">
                                                        HAVEN
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[9px] text-zinc-600 font-mono">
                                                APY {adapter.apy.toFixed(2)}%
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-xs font-mono font-medium ${hasMoney ? 'text-emerald-400' : 'text-zinc-600'}`}>
                                            ${adapter.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                        </p>
                                        <p className="text-[9px] text-zinc-600 uppercase">
                                            {hasMoney ? 'protected' : 'empty'}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Total + CCIP link */}
                        <div className="mt-3 pt-3 border-t border-zinc-800/60 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Total on Base Sepolia</p>
                                <p className={`text-sm font-mono font-medium mt-0.5 ${data.totalBalance > 0.001 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                    ${data.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })}
                                </p>
                            </div>
                            <a
                                href="https://ccip.chain.link"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[10px] text-cyan-500 hover:text-cyan-400 transition-colors"
                            >
                                <span>CCIP Explorer</span>
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                                    <path d="M5.5 1H9v3.5M9 1L4 6M2 2H1v7h7V8" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </a>
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-zinc-600 text-center py-4">Could not read Base Sepolia state</p>
                )}
            </div>

            <style>{`
                @keyframes slideRight {
                    0% { transform: translateX(0); opacity: 0; }
                    20% { opacity: 1; }
                    80% { opacity: 1; }
                    100% { transform: translateX(100px); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
