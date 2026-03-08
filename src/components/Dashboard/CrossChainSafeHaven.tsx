'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

interface AdapterData {
    name: string;
    address: string;
    balance: number;
    apy: number;
    isHealthy: boolean;
}

interface PendingBridgeMessage {
    messageId: string;
    status: string;        // PENDING | IN_PROGRESS | SUCCESS | FAILED | UNKNOWN
    amount: number;
    destinationChain: string;
    ccipExplorerUrl: string;
    sender?: string;
    sourceTxHash?: string;
}

interface SafeHavenData {
    chain: string;
    chainId: number;
    shieldVault: string;
    shieldBridge: string;
    emergencyBridgeCount: number;
    escrowBalance: number;
    totalBalance: number;
    adapters: AdapterData[];
    safeHavenAdapters: AdapterData[];
    hasFunds: boolean;
    ccipExplorer: string;
    ccipPendingBalance?: number;
    pendingBridgeMessages?: PendingBridgeMessage[];
}

interface BridgeStatusData {
    pendingMessages: PendingBridgeMessage[];
    completedMessages: PendingBridgeMessage[];
    totalPendingAmount: number;
    totalBridgedAmount: number;
    emergencyBridgeCount: number;
}

interface ChainBreakdown {
    arbitrum: number;
    base: number;
    pendingBridge?: number;
}

interface PortfolioData {
    globalTotalValueUsd?: number;
    chainBreakdown?: ChainBreakdown;
    pendingBridgeMessages?: PendingBridgeMessage[];
}

const PROTOCOL_ICONS: Record<string, string> = {
    AaveAdapter: '🔵',
    CompoundAdapter: '🟢',
    MorphoAdapter: '🟣',
    YieldMaxAdapter: '🟡',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string; pulse: boolean }> = {
    PENDING: { label: 'Success (Bridging)', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30', pulse: true },
    IN_PROGRESS: { label: 'Success (Executing)', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30', pulse: true },
    SUCCESS: { label: 'Completed', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30', pulse: false },
    FAILED: { label: 'Failed', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30', pulse: false },
    UNKNOWN: { label: 'Checking...', color: 'text-zinc-400', bgColor: 'bg-zinc-500/10', borderColor: 'border-zinc-500/30', pulse: true },
};

function truncateHash(hash: string): string {
    if (!hash || hash.length < 12) return hash || '';
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export default function CrossChainSafeHaven() {
    const { address: wallet } = useAccount();
    const [baseData, setBaseData] = useState<SafeHavenData | null>(null);
    const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
    const [bridgeStatus, setBridgeStatus] = useState<BridgeStatusData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!wallet) {
            setLoading(false);
            return;
        }

        const fetchAll = async () => {
            try {
                const [baseRes, portRes, bridgeRes] = await Promise.all([
                    fetch(`/api/base-safe-haven?wallet=${wallet}`).then(r => r.ok ? r.json() : null).catch(() => null),
                    fetch(`/api/portfolio/live?wallet=${wallet}`).then(r => r.ok ? r.json() : null).catch(() => null),
                    fetch(`/api/bridge-status?wallet=${wallet}`).then(r => r.ok ? r.json() : null).catch(() => null),
                ]);
                if (baseRes) setBaseData(baseRes);
                if (portRes) setPortfolioData(portRes);
                if (bridgeRes) setBridgeStatus(bridgeRes);
            } catch { /* ignore */ }
            setLoading(false);
        };

        fetchAll();
        const iv = setInterval(fetchAll, 15_000);
        return () => clearInterval(iv);
    }, [wallet]);

    const arbBalance = portfolioData?.chainBreakdown?.arbitrum ?? 0;
    const baseBalance = portfolioData?.chainBreakdown?.base ?? baseData?.totalBalance ?? 0;
    const ccipPending = bridgeStatus?.totalPendingAmount ?? baseData?.ccipPendingBalance ?? 0;
    const globalTotal = arbBalance + baseBalance + ccipPending;
    const arbPercent = globalTotal > 0 ? (arbBalance / globalTotal) * 100 : 100;
    const basePercent = globalTotal > 0 ? (baseBalance / globalTotal) * 100 : 0;
    const ccipPercent = globalTotal > 0 ? (ccipPending / globalTotal) * 100 : 0;
    const totalBridgeCount = bridgeStatus?.emergencyBridgeCount ?? baseData?.emergencyBridgeCount ?? 0;
    const hasBridged = totalBridgeCount > 0 || baseBalance > 0.001 || ccipPending > 0;
    const isCcipPending = ccipPending > 0.001;

    // Merge pending messages from bridge-status API (primary) or base-safe-haven (fallback)
    const pendingMessages: PendingBridgeMessage[] =
        bridgeStatus?.pendingMessages ?? baseData?.pendingBridgeMessages ?? [];

    // Show up to 3 most recent completed messages
    const recentCompleted = (bridgeStatus?.completedMessages ?? []).slice(0, 3);

    return (
        <div className="relative bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800/60">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <span className="text-lg">🌐</span>
                        {hasBridged && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                    </div>
                    <div>
                        <h3 className="text-sm font-medium text-zinc-200">Bridge & Safe Haven</h3>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                            Active CCIP Transfers & Escrow
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isCcipPending ? (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2.5 py-1 font-medium animate-pulse">
                            SHIELD ACTIVE
                        </span>
                    ) : hasBridged ? (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2.5 py-1 font-medium">
                            CCIP ACTIVE
                        </span>
                    ) : (
                        <span className="text-[10px] bg-zinc-800 text-zinc-500 border border-zinc-700 rounded-full px-2.5 py-1 font-medium">
                            SINGLE CHAIN
                        </span>
                    )}
                </div>
            </div>

            <div className="px-6 py-5 space-y-5">
                {loading ? (
                    <div className="flex items-center justify-center h-20">
                        <div className="w-4 h-4 border border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Chain Proportion Bar */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-[9px] text-zinc-500">
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                                    Arbitrum {arbPercent.toFixed(0)}%
                                </span>
                                {isCcipPending && (
                                    <span className="flex items-center gap-1 text-emerald-400/80 animate-pulse">
                                        Shielding in Progress {ccipPercent.toFixed(0)}%
                                    </span>
                                )}
                                <span className="flex items-center gap-1">
                                    Base {basePercent.toFixed(0)}%
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden flex">
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
                        <div className="flex items-center justify-center gap-2">
                            {/* Arbitrum Node */}
                            <div className="flex flex-col items-center gap-1.5">
                                <div className="w-14 h-14 rounded-xl bg-zinc-800/80 border border-blue-500/30 flex flex-col items-center justify-center gap-0.5">
                                    <span className="text-base">⚡</span>
                                    <span className="text-[8px] text-blue-400 font-medium uppercase tracking-wider">ARB</span>
                                </div>
                                <span className="text-[9px] text-zinc-600 font-mono">
                                    ${arbBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>

                            {/* Bridge Arrow */}
                            <div className="flex flex-col items-center gap-1 flex-1 max-w-[120px]">
                                <div className="relative w-full flex items-center justify-center">
                                    <div className={`w-full h-px ${hasBridged ? 'bg-gradient-to-r from-blue-500/60 via-cyan-400/80 to-emerald-500/60' : 'bg-zinc-700'}`} />
                                    {(hasBridged || isCcipPending) && (
                                        <div
                                            className={`absolute w-2 h-2 rounded-full shadow-lg ${isCcipPending ? 'bg-emerald-400 shadow-emerald-400/50' : 'bg-cyan-400 shadow-cyan-400/50'}`}
                                            style={{
                                                animation: 'slideRight 2s ease-in-out infinite',
                                                left: 0,
                                            }}
                                        />
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className={`text-[8px] font-bold ${isCcipPending ? 'text-emerald-400 animate-pulse' : 'text-cyan-500'} uppercase tracking-widest`}>
                                        {isCcipPending ? 'EVACUATING' : 'CCIP'}
                                    </span>
                                    {hasBridged && !isCcipPending && <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />}
                                </div>
                                {isCcipPending ? (
                                    <span className="text-[9px] font-mono text-emerald-400">
                                        ${ccipPending.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                ) : (totalBridgeCount > 0 && (
                                    <span className="text-[8px] text-zinc-600">
                                        {totalBridgeCount}x bridged
                                    </span>
                                ))}
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
                                <span className={`text-[9px] font-mono ${hasBridged ? 'text-emerald-400' : 'text-zinc-600'}`}>
                                    ${baseBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        {/* === Pending Bridge Messages (Per-Message Tracking) === */}
                        {pendingMessages.length > 0 && (
                            <div className="space-y-2 pt-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-medium">
                                        Success: Shielding in Progress
                                    </p>
                                </div>
                                {pendingMessages.map((msg) => {
                                    const cfg = STATUS_CONFIG[msg.status] ?? STATUS_CONFIG.UNKNOWN;
                                    return (
                                        <a
                                            key={msg.messageId}
                                            href={msg.ccipExplorerUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`block px-3 py-2.5 rounded-xl ${cfg.bgColor} border ${cfg.borderColor} hover:brightness-110 transition-all`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] font-medium ${cfg.color} ${cfg.pulse ? 'animate-pulse' : ''}`}>
                                                        {cfg.label}
                                                    </span>
                                                    <span className="text-[9px] text-zinc-600 font-mono">
                                                        {truncateHash(msg.messageId)}
                                                    </span>
                                                </div>
                                                <span className={`text-xs font-mono font-medium ${cfg.color}`}>
                                                    ${msg.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[9px] text-zinc-600">
                                                    Arbitrum → {msg.destinationChain}
                                                </span>
                                                <span className="text-[9px] text-cyan-600 flex items-center gap-1">
                                                    Track on CCIP
                                                    <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" className="opacity-60">
                                                        <path d="M5.5 1H9v3.5M9 1L4 6M2 2H1v7h7V8" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </span>
                                            </div>
                                        </a>
                                    );
                                })}
                            </div>
                        )}

                        {/* Chain Details — Two Columns */}
                        {(baseData || arbBalance > 0) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                {/* Arbitrum Column */}
                                <div className="space-y-2">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                                        <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">
                                            Arbitrum Sepolia
                                        </p>
                                    </div>
                                    <div className="px-3 py-2.5 rounded-xl bg-zinc-800/40 border border-zinc-700/40">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-zinc-500">Primary Vault</span>
                                            <span className={`text-xs font-mono font-medium ${arbBalance > 0.001 ? 'text-blue-400' : 'text-zinc-600'}`}>
                                                ${arbBalance.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                                            </span>
                                        </div>
                                        <p className="text-[9px] text-zinc-600 mt-1">
                                            Aave · Compound · Morpho · YieldMax
                                        </p>
                                    </div>
                                </div>

                                {/* Base Column */}
                                <div className="space-y-2">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">
                                            Base Sepolia
                                        </p>
                                    </div>
                                    {baseData ? (
                                        <div className="space-y-1.5">
                                            {/* Escrow Balance */}
                                            {baseData.escrowBalance > 0.001 && (
                                                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs">🛡️</span>
                                                        <span className="text-[10px] text-emerald-400">Escrow Secured</span>
                                                    </div>
                                                    <span className="text-xs font-mono font-medium text-emerald-400">
                                                        ${baseData.escrowBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                                    </span>
                                                </div>
                                            )}
                                            {/* Base Adapters */}
                                            {baseData.adapters.filter(a => a.balance > 0.001).map(adapter => {
                                                const icon = PROTOCOL_ICONS[adapter.name] || '⚪';
                                                const displayName = adapter.name.replace('Adapter', '');
                                                return (
                                                    <div key={adapter.name} className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-xs">{icon}</span>
                                                            <span className="text-[10px] text-zinc-300">{displayName}</span>
                                                        </div>
                                                        <span className="text-xs font-mono font-medium text-emerald-400">
                                                            ${adapter.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                            {baseData.adapters.every(a => a.balance <= 0.001) && baseData.escrowBalance <= 0.001 && (
                                                <div className="px-3 py-2.5 rounded-xl bg-zinc-800/40 border border-zinc-700/40">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] text-zinc-500">Safe Haven Vault</span>
                                                        <span className="text-xs font-mono text-zinc-600">$0.00</span>
                                                    </div>
                                                    <p className="text-[9px] text-zinc-600 mt-1">
                                                        Awaiting CCIP evacuation
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="px-3 py-2.5 rounded-xl bg-zinc-800/40 border border-zinc-700/40">
                                            <span className="text-[10px] text-zinc-600">Unreachable</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* === Recent Completed Bridges === */}
                        {recentCompleted.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                                <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-medium">
                                    Recent Bridges
                                </p>
                                {recentCompleted.map((msg) => {
                                    const cfg = STATUS_CONFIG[msg.status] ?? STATUS_CONFIG.SUCCESS;
                                    return (
                                        <a
                                            key={msg.messageId}
                                            href={msg.ccipExplorerUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-800/30 border border-zinc-700/30 hover:border-zinc-600/50 transition-all"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={`w-1.5 h-1.5 rounded-full ${msg.status === 'SUCCESS' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                <span className="text-[9px] text-zinc-500 font-mono">{truncateHash(msg.messageId)}</span>
                                            </div>
                                            <span className={`text-[10px] font-mono ${cfg.color}`}>
                                                ${msg.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </span>
                                        </a>
                                    );
                                })}
                            </div>
                        )}

                        {/* Footer — CCIP Explorer Link */}
                        <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                            <p className="text-[9px] text-zinc-600">
                                Server-side CCIP tracking · On-chain events + Chainlink API
                            </p>
                            <a
                                href="https://ccip.chain.link"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[10px] text-cyan-500 hover:text-cyan-400 transition-colors"
                            >
                                <span>CCIP Explorer</span>
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                                    <path d="M5.5 1H9v3.5M9 1L4 6M2 2H1v7h7V8" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </a>
                        </div>
                    </>
                )}
            </div>

            <style>{`
                @keyframes slideRight {
                    0% { transform: translateX(0); opacity: 0; }
                    20% { opacity: 1; }
                    80% { opacity: 1; }
                    100% { transform: translateX(calc(100% + 80px)); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
