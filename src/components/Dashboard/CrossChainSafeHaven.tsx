'use client';

import { useEffect, useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { useClaimCrossChainFunds } from '../../lib/hooks/useShieldVault';
import { baseSepolia } from 'viem/chains';
import { ProtocolIcon } from './ProtocolIcon';

interface AdapterData {
// ... rest of interfaces ...
    name: string;
    address: string;
    balance: number;
    apy: number;
    isHealthy: boolean;
}

interface PendingBridgeMessage {
// ... rest of message ...
    messageId: string;
    status: string;
    amount: number;
    destinationChain: string;
    ccipExplorerUrl: string;
    sender?: string;
    sourceTxHash?: string;
}

interface SafeHavenData {
// ... rest of haven data ...
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
    unclaimedCrossChainFunds?: number;
}

interface BridgeStatusData {
    pendingMessages: PendingBridgeMessage[];
    completedMessages: PendingBridgeMessage[];
    totalPendingAmount: number;
    totalBridgedAmount: number;
    emergencyBridgeCount: number;
}

interface PortfolioData {
    globalTotalValueUsd?: number;
    chainBreakdown?: { arbitrum: number; base: number; pendingBridge?: number };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string; pulse: boolean }> = {
// ... rest of status ...
    PENDING: { label: 'In Transit (CCIP)', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30', pulse: true },
    IN_PROGRESS: { label: 'Finalizing...', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30', pulse: true },
    SUCCESS: { label: 'Arrived', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30', pulse: false },
    FAILED: { label: 'Failed', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30', pulse: false },
    UNKNOWN: { label: 'Checking...', color: 'text-zinc-400', bgColor: 'bg-zinc-500/10', borderColor: 'border-zinc-500/30', pulse: true },
};

function truncateHash(hash: string): string {
    if (!hash || hash.length < 12) return hash || '';
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export default function CrossChainSafeHaven() {
    const { address: wallet, chainId } = useAccount();
    const { switchChain } = useSwitchChain();
    const { claim: claimFunds, isPending: isClaimPending, step: claimStep } = useClaimCrossChainFunds();
    
    const [baseData, setBaseData] = useState<SafeHavenData | null>(null);
    const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
    const [bridgeStatus, setBridgeStatus] = useState<BridgeStatusData | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchAll = async () => {
        if (!wallet) return;
        try {
            const [baseRes, portRes, bridgeRes] = await Promise.all([
                fetch(`/api/base-safe-haven?wallet=${wallet}&t=${Date.now()}`).then(r => r.ok ? r.json() : null).catch(() => null),
                fetch(`/api/portfolio/live?wallet=${wallet}&t=${Date.now()}`).then(r => r.ok ? r.json() : null).catch(() => null),
                fetch(`/api/bridge-status?wallet=${wallet}&t=${Date.now()}`).then(r => r.ok ? r.json() : null).catch(() => null),
            ]);
            if (baseRes) setBaseData(baseRes);
            if (portRes) setPortfolioData(portRes);
            if (bridgeRes) setBridgeStatus(bridgeRes);
        } catch { /* ignore */ }
        setLoading(false);
    };

    useEffect(() => {
        setLoading(true);
        fetchAll();
        const iv = setInterval(fetchAll, 10_000);
        return () => clearInterval(iv);
    }, [wallet]);

    // Refetch on claim success
    useEffect(() => {
        if (claimStep === 'success') {
            fetchAll();
        }
    }, [claimStep]);

    const arbBalance = portfolioData?.chainBreakdown?.arbitrum ?? 0;
    const baseBalance = baseData?.totalBalance ?? 0;
    const ccipPending = bridgeStatus?.totalPendingAmount ?? 0;
    const unclaimedBase = baseData?.unclaimedCrossChainFunds ?? 0;
    
    const globalTotal = arbBalance + baseBalance + ccipPending + unclaimedBase;
    const arbPercent = globalTotal > 0 ? (arbBalance / globalTotal) * 100 : 100;
    const basePercent = globalTotal > 0 ? (baseBalance / globalTotal) * 100 : 0;
    const ccipPercent = globalTotal > 0 ? (ccipPending / globalTotal) * 100 : 0;
    const unclaimedPercent = globalTotal > 0 ? (unclaimedBase / globalTotal) * 100 : 0;
    
    const hasBridged = (baseData?.emergencyBridgeCount ?? 0) > 0 || baseBalance > 0.001 || ccipPending > 0 || unclaimedBase > 0;
    const isCcipPending = ccipPending > 0.001;
    const isBaseChain = chainId === baseSepolia.id;

    // Merge pending messages from bridge-status API (primary) or base-safe-haven (fallback)
    const pendingMessages: PendingBridgeMessage[] =
        bridgeStatus?.pendingMessages ?? baseData?.pendingBridgeMessages ?? [];

    // Show up to 3 most recent completed messages
    const recentCompleted = (bridgeStatus?.completedMessages ?? []).slice(0, 3);

    return (
        <div className="relative bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800/60">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <span className="text-lg">🌐</span>
                        {hasBridged && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping opacity-75" />
                        )}
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-zinc-100">Cross-Chain Safe Haven</h3>
                        <p className="text-[10px] text-zinc-500 uppercase  mt-0.5 font-medium">
                            Monitoring Base Sepolia
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {unclaimedBase > 0.001 ? (
                        <span className="text-[10px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 rounded-full px-3 py-1 font-bold animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                            FUNDS ARRIVED
                        </span>
                    ) : isCcipPending ? (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-3 py-1 font-bold animate-pulse">
                            RESCUING FUNDS
                        </span>
                    ) : (
                        <span className="text-[10px] bg-zinc-800 text-zinc-500 border border-zinc-700 rounded-full px-3 py-1 font-medium">
                            STABLE
                        </span>
                    )}
                </div>
            </div>

            <div className="px-6 py-5 space-y-6">
                {loading ? (
                    <div className="flex items-center justify-center h-24">
                        <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* UNCLAIMED FUNDS ALERT - MOVED TO TOP AND MADE BIGGER */}
                        {unclaimedBase > 0.001 && (
                            <div className="p-5 rounded-2xl bg-linear-to-br from-cyan-500/20 to-blue-600/10 border border-cyan-500/40 flex flex-col gap-4 shadow-[0_0_30px_rgba(6,182,212,0.15)] relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <span className="text-5xl">🎁</span>
                                </div>
                                <div className="flex flex-col gap-1 relative z-10">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">✨</span>
                                        <span className="text-xs font-black text-cyan-300 uppercase ">Shield Success</span>
                                    </div>
                                    <h4 className="text-lg font-bold text-white ">Funds Successfully Rescued!</h4>
                                    <p className="text-xs text-cyan-100/70 max-w-[240px]">
                                        Your assets have been moved to Base Sepolia to avoid loss. Claim them now to start earning yield.
                                    </p>
                                </div>
                                
                                <div className="flex items-center justify-between bg-black/40 px-4 py-3 rounded-xl border border-white/5 relative z-10">
                                    <span className="text-[10px] font-medium text-zinc-400 uppercase ">Amount to Claim</span>
                                    <span className="text-xl font-mono font-bold text-cyan-400">${unclaimedBase.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                </div>

                                {!isBaseChain ? (
                                    <button 
                                        onClick={() => switchChain?.({ chainId: baseSepolia.id })}
                                        className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-bold uppercase  rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
                                    >
                                        <span>Switch to Base to Claim</span>
                                        <span>→</span>
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => claimFunds?.()}
                                        disabled={isClaimPending}
                                        className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold uppercase  rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isClaimPending ? (
                                            <>
                                                <div className="w-3 h-3 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                                                <span>Claiming...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>Claim to Base Vault</span>
                                                <span>✓</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Chain Proportion Bar */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-bold ">
                                <span className="flex items-center gap-1.5 text-blue-400">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                    Arbitrum {arbPercent.toFixed(0)}%
                                </span>
                                <span className="flex items-center gap-1.5 text-emerald-400">
                                    Base {basePercent.toFixed(0)}%
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                </span>
                            </div>
                            <div className="w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden flex shadow-inner">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-1000"
                                    style={{ width: `${arbPercent}%` }}
                                />
                                {ccipPercent > 0 && (
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000 animate-pulse"
                                        style={{ width: `${ccipPercent}%` }}
                                    />
                                )}
                                {unclaimedPercent > 0 && (
                                    <div
                                        className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-1000"
                                        style={{ width: `${unclaimedPercent}%`, opacity: 0.6 }}
                                    />
                                )}
                                <div
                                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-1000"
                                    style={{ width: `${basePercent}%` }}
                                />
                            </div>
                        </div>

                        {/* CCIP Flow Diagram */}
                        <div className="flex items-center justify-between gap-4 px-2">
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-16 h-16 rounded-2xl bg-zinc-800/80 border border-blue-500/30 flex flex-col items-center justify-center gap-1 shadow-lg">
                                    <span className="text-xl">⚡</span>
                                    <span className="text-[9px] text-blue-400 font-bold uppercase ">ARB</span>
                                </div>
                                <span className="text-[10px] text-zinc-400 font-mono font-medium">
                                    ${arbBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                            </div>

                            <div className="flex-1 flex flex-col items-center gap-2">
                                <div className="relative w-full flex items-center justify-center">
                                    <div className={`w-full h-px ${hasBridged ? 'bg-gradient-to-r from-blue-500/60 via-cyan-400/80 to-emerald-500/60' : 'bg-zinc-700'}`} />
                                    {(hasBridged || isCcipPending) && (
                                        <div
                                            className={`absolute w-2.5 h-2.5 rounded-full shadow-lg ${isCcipPending ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]'}`}
                                            style={{ animation: 'slideRight 2.5s ease-in-out infinite', left: 0 }}
                                        />
                                    )}
                                </div>
                                <span className={`text-[9px] font-black  uppercase ${isCcipPending ? 'text-emerald-400 animate-pulse' : 'text-zinc-600'}`}>
                                    {isCcipPending ? 'RESCUING' : 'CCIP'}
                                </span>
                            </div>

                            <div className="flex flex-col items-center gap-2">
                                <div className={`w-16 h-16 rounded-2xl border flex flex-col items-center justify-center gap-1 shadow-lg transition-all duration-1000 ${baseBalance > 0.001 || unclaimedBase > 0.001
                                    ? 'bg-emerald-500/10 border-emerald-500/40 shadow-emerald-900/10'
                                    : 'bg-zinc-800/80 border-zinc-700'
                                    }`}>
                                    <span className="text-xl">🛡️</span>
                                    <span className={`text-[9px] font-bold uppercase  ${baseBalance > 0.001 || unclaimedBase > 0.001 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                        BASE
                                    </span>
                                </div>
                                <span className={`text-[10px] font-mono font-medium ${baseBalance > 0.001 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                    ${(baseBalance + unclaimedBase).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        {/* Recent History or Empty State */}
                        <div className="pt-2">
                            {pendingMessages.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="text-[10px] text-zinc-500 uppercase  font-bold mb-3">Rescue Status</p>
                                    {pendingMessages.map((msg) => {
                                        const cfg = STATUS_CONFIG[msg.status] ?? STATUS_CONFIG.UNKNOWN;
                                        return (
                                            <a
                                                key={msg.messageId}
                                                href={msg.ccipExplorerUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`block px-4 py-3 rounded-xl ${cfg.bgColor} border ${cfg.borderColor} hover:scale-[1.02] transition-all duration-200 group`}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.pulse ? 'animate-pulse bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.5)]' : 'bg-emerald-500'}`} />
                                                        <span className={`text-[11px] font-bold ${cfg.color}`}>{cfg.label}</span>
                                                    </div>
                                                    <span className="text-xs font-mono font-bold text-zinc-100">${msg.amount.toFixed(2)}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] text-zinc-500 font-mono ">{truncateHash(msg.messageId)}</span>
                                                    <span className="text-[9px] text-cyan-500 font-bold uppercase group-hover:underline">View CCIP →</span>
                                                </div>
                                            </a>
                                        );
                                    })}
                                </div>
                            ) : !hasBridged ? (
                                <div className="py-8 px-4 border border-dashed border-zinc-800 rounded-2xl text-center">
                                    <p className="text-xs text-zinc-600 font-medium italic">Your funds are currently consolidated on Arbitrum. No cross-chain escape active.</p>
                                </div>
                            ) : null}
                        </div>
                    </>
                )}
            </div>

            <style>{`
                @keyframes slideRight {
                    0% { transform: translateX(0); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { transform: translateX(calc(100% + 100px)); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
