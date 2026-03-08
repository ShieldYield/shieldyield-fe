'use client';

import { useEffect, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

// ABI for the ShieldVault claim function
const SHIELD_VAULT_ABI = [
    {
        name: 'claimCrossChainFunds',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [],
    },
] as const;

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
    unclaimedCrossChainFunds?: number;
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
    PENDING: { label: 'Pending', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30', pulse: true },
    IN_PROGRESS: { label: 'In Progress', color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/30', pulse: true },
    SUCCESS: { label: 'Completed', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30', pulse: false },
    FAILED: { label: 'Failed', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30', pulse: false },
    UNKNOWN: { label: 'Checking...', color: 'text-zinc-400', bgColor: 'bg-zinc-500/10', borderColor: 'border-zinc-500/30', pulse: true },
};

function truncateHash(hash: string): string {
    if (!hash || hash.length < 12) return hash || '';
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export default function CrossChainSafeHaven() {
    const { address: connectedWallet } = useAccount();
    const [baseData, setBaseData] = useState<SafeHavenData | null>(null);
    const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
    const [bridgeStatus, setBridgeStatus] = useState<BridgeStatusData | null>(null);
    const [loading, setLoading] = useState(true);

    const { data: hash, isPending, writeContract } = useWriteContract();

    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash,
    });

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const walletQuery = connectedWallet ? `?wallet=${connectedWallet}` : '';
                const [baseRes, portRes, bridgeRes] = await Promise.all([
                    fetch(`/api/base-safe-haven${walletQuery}`).then(r => r.ok ? r.json() : null).catch(() => null),
                    fetch(`/api/portfolio/live${walletQuery}`)
                        .then(r => r.ok ? r.json() : null).catch(() => null),
                    fetch(`/api/bridge-status${walletQuery}`).then(r => r.ok ? r.json() : null).catch(() => null),
                ]);
                if (baseRes) setBaseData(baseRes);
                if (portRes) setPortfolioData(portRes);
                if (bridgeRes) setBridgeStatus(bridgeRes);
            } catch { /* ignore */ }
            setLoading(false);
        };

        fetchAll();
        const iv = setInterval(fetchAll, 10_000);
        return () => clearInterval(iv);
    }, [connectedWallet, isConfirmed]);

    const handleClaim = () => {
        if (!baseData?.shieldVault || !connectedWallet) return;
        
        writeContract({
            address: baseData.shieldVault as `0x${string}`,
            abi: SHIELD_VAULT_ABI,
            functionName: 'claimCrossChainFunds',
            chainId: 84532, // Base Sepolia
        });
    };

    const arbBalance = portfolioData?.chainBreakdown?.arbitrum ?? 0;
    const baseBalance = portfolioData?.chainBreakdown?.base ?? baseData?.totalBalance ?? 0;
    const ccipPending = bridgeStatus?.totalPendingAmount ?? baseData?.ccipPendingBalance ?? 0;
    const globalTotal = arbBalance + baseBalance + ccipPending;
    const arbPercent = globalTotal > 0 ? (arbBalance / globalTotal) * 100 : 100;
    const basePercent = globalTotal > 0 ? (baseBalance / globalTotal) * 100 : 0;
    const ccipPercent = globalTotal > 0 ? (ccipPending / globalTotal) * 100 : 0;
    const totalBridgeCount = bridgeStatus?.emergencyBridgeCount ?? baseData?.emergencyBridgeCount ?? 0;
    const unclaimedFunds = baseData?.unclaimedCrossChainFunds ?? 0;
    
    const hasBridged = totalBridgeCount > 0 || baseBalance > 0.001 || ccipPending > 0;
    const canClaim = unclaimedFunds > 0.001;
    // If we have unclaimed funds, we are no longer "pending" in the eyes of the user
    const isCcipPending = ccipPending > 0.001 && !canClaim;

    // Filter pending messages: if a message's amount matches (roughly) our unclaimed funds, 
    // it's likely already arrived, so we don't show it as pending anymore.
    const pendingMessages: PendingBridgeMessage[] = (bridgeStatus?.pendingMessages ?? baseData?.pendingBridgeMessages ?? [])
        .filter(msg => !canClaim || Math.abs(msg.amount - unclaimedFunds) > 0.1);

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
                    {canClaim ? (
                        <span className="text-[10px] bg-emerald-500 text-white border border-emerald-400 rounded-full px-2.5 py-1 font-bold animate-pulse">
                            READY TO CLAIM
                        </span>
                    ) : isCcipPending ? (
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-2.5 py-1 font-medium animate-pulse">
                            BRIDGING...
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
                        {/* Stateful Claim Alert */}
                        {canClaim && (
                            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-xl">
                                        💰
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Bridge Success!</p>
                                        <p className="text-[10px] text-zinc-400 mt-0.5">
                                            ${unclaimedFunds.toLocaleString('en-US', { minimumFractionDigits: 2 })} has arrived on Base.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleClaim}
                                    disabled={isPending || isConfirming}
                                    className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                                        isPending || isConfirming
                                            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                            : 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
                                    }`}
                                >
                                    {isPending ? 'Confirming...' : isConfirming ? 'Claiming...' : 'Claim Funds'}
                                </button>
                            </div>
                        )}

                        {/* Chain Proportion Bar */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-[9px] text-zinc-500">
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                                    Arbitrum {arbPercent.toFixed(0)}%
                                </span>
                                {isCcipPending && (
                                    <span className="flex items-center gap-1 text-amber-500/80 animate-pulse">
                                        Pending CCIP {ccipPercent.toFixed(0)}%
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
                                        className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-700"
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
                            <div className="flex flex-col items-center gap-1.5">
                                <div className="w-14 h-14 rounded-xl bg-zinc-800/80 border border-blue-500/30 flex flex-col items-center justify-center gap-0.5">
                                    <span className="text-base">⚡</span>
                                    <span className="text-[8px] text-blue-400 font-medium uppercase tracking-wider">ARB</span>
                                </div>
                                <span className="text-[9px] text-zinc-600 font-mono">
                                    ${arbBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>

                            <div className="flex flex-col items-center gap-1 flex-1 max-w-[120px]">
                                <div className="relative w-full flex items-center justify-center">
                                    <div className={`w-full h-px ${hasBridged ? 'bg-gradient-to-r from-blue-500/60 via-cyan-400/80 to-emerald-500/60' : 'bg-zinc-700'}`} />
                                    {(hasBridged || isCcipPending) && (
                                        <div
                                            className={`absolute w-2 h-2 rounded-full shadow-lg ${isCcipPending ? 'bg-amber-400 shadow-amber-400/50' : 'bg-cyan-400 shadow-cyan-400/50'}`}
                                            style={{
                                                animation: 'slideRight 2s ease-in-out infinite',
                                                left: 0,
                                            }}
                                        />
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className={`text-[8px] font-bold ${isCcipPending ? 'text-amber-400 animate-pulse' : 'text-cyan-500'} uppercase tracking-widest`}>
                                        {isCcipPending ? 'IN TRANSIT' : 'CCIP'}
                                    </span>
                                    {hasBridged && !isCcipPending && <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />}
                                </div>
                                {isCcipPending && (
                                    <span className="text-[9px] font-mono text-amber-400">
                                        ${ccipPending.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                )}
                            </div>

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

                        {/* Chain Details */}
                        {(baseData || arbBalance > 0) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
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
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-medium">
                                            Base Sepolia
                                        </p>
                                    </div>
                                    {baseData ? (
                                        <div className="space-y-1.5">
                                            {canClaim && (
                                                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs">💰</span>
                                                        <span className="text-[10px] text-emerald-400 font-bold">Unclaimed Bridge</span>
                                                    </div>
                                                    <span className="text-xs font-mono font-medium text-emerald-400">
                                                        ${unclaimedFunds.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            )}
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
                                        </div>
                                    ) : (
                                        <div className="px-3 py-2.5 rounded-xl bg-zinc-800/40 border border-zinc-700/40 text-center">
                                            <span className="text-[10px] text-zinc-600">No active funds on Base</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                            <p className="text-[9px] text-zinc-600 font-medium">
                                STATE-DRIVEN CCIP TRACKING · AUTOMATIC CLAIMS
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
