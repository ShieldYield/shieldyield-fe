'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { parseUnits } from 'viem';
import { motion, AnimatePresence } from 'framer-motion';
import { useVaultData, useDeposit, useWithdraw, useClaimCrossChainFunds } from '../../lib/hooks/useShieldVault';
import { useFaucet } from '../../lib/hooks/useFaucet';
import { useVaultEstimator, useActivePoolCount } from '../../lib/hooks/useVaultEstimator';
import { USDC_DECIMALS, MIN_DEPOSIT_USDC } from '../../lib/contracts';
import { useSwitchChain } from 'wagmi';
import { arbitrumSepolia, baseSepolia } from 'viem/chains';

// ============================================================================
// VaultActions — Deposit / Withdraw Panel
// ============================================================================

type Tab = 'deposit' | 'withdraw';

export default function VaultActions({ onSuccess }: { onSuccess?: () => void }) {
    const { isConnected, chainId } = useAccount();
    const { switchChain } = useSwitchChain();
    const [activeTab, setActiveTab] = useState<Tab>('deposit');
    const [amount, setAmount] = useState('');

    const { usdcBalance, totalShares, vaultBalance, unclaimedFunds, refetch } = useVaultData();
    const { deposit, step: depositStep, error: depositError, reset: resetDeposit, isPending: isDepositPending, isConfirming: isDepositConfirming } = useDeposit();
    const { withdraw, step: withdrawStep, error: withdrawError, reset: resetWithdraw, isPending: isWithdrawPending, isConfirming: isWithdrawConfirming } = useWithdraw();
    const { claim: claimFunds, step: claimStep, error: claimError, reset: resetClaim, isPending: isClaimPending, isConfirming: isClaimConfirming } = useClaimCrossChainFunds();
    const { claim: claimFaucet, step: faucetStep, error: faucetError, reset: resetFaucet, isPending: isFaucetPending, isConfirming: isFaucetConfirming } = useFaucet();

    const isBase = chainId === baseSepolia.id;

    // Estimator hooks
    const { estimatedShares, estimatedUsdc, isLoading: isEstimating } = useVaultEstimator(amount, activeTab);
    const { activePoolCount } = useActivePoolCount();

    // Reset state when switching tabs
    useEffect(() => {
        setAmount('');
        resetDeposit();
        resetWithdraw();
        resetClaim();
    }, [activeTab, resetDeposit, resetWithdraw, resetClaim]);

    // Refresh data on success
    useEffect(() => {
        if (depositStep === 'success' || withdrawStep === 'success' || claimStep === 'success' || (faucetStep as string) === 'success') {
            refetch();
            onSuccess?.();

            if ((faucetStep as string) === 'success') {
                const timer = setTimeout(() => resetFaucet(), 3000);
                return () => clearTimeout(timer);
            }
        }
    }, [depositStep, withdrawStep, claimStep, faucetStep, refetch, onSuccess, resetFaucet]);

    // Auto-switch tab if on Base and deposit was active
    useEffect(() => {
        if (isBase && activeTab === 'deposit') {
            setActiveTab('withdraw');
        }
    }, [isBase, activeTab]);

    if (!isConnected) return null;

    const numericAmount = parseFloat(amount) || 0;

    const isDepositBusy = isDepositPending || isDepositConfirming;
    const isWithdrawBusy = isWithdrawPending || isWithdrawConfirming;
    const isClaimBusy = isClaimPending || isClaimConfirming;

    const canDeposit =
        !isBase &&
        numericAmount >= MIN_DEPOSIT_USDC &&
        numericAmount <= usdcBalance &&
        !isDepositBusy;

    const canWithdraw =
        numericAmount > 0 &&
        numericAmount <= totalShares &&
        !isWithdrawBusy;

    // -- Action Handlers --
    const handleDeposit = () => {
        if (!canDeposit) return;
        deposit(numericAmount);
    };

    const handleWithdraw = () => {
        if (!canWithdraw) return;
        const sharesRaw = parseUnits(numericAmount.toString(), USDC_DECIMALS);
        withdraw(sharesRaw);
    };

    const handleMax = () => {
        if (activeTab === 'deposit') {
            setAmount(usdcBalance.toString());
        } else {
            setAmount(totalShares.toString());
        }
    };

    const getDepositStepLabel = () => {
        switch (depositStep) {
            case 'approving': return 'Approving USDC…';
            case 'waitingApproval': return 'Confirming Approval…';
            case 'depositing': return 'Depositing…';
            case 'waitingDeposit': return 'Confirming Deposit…';
            case 'success': return 'Deposit Successful ✓';
            case 'error': return 'Transaction Failed';
            default: return 'Approve & Deposit';
        }
    };

    const getWithdrawStepLabel = () => {
        switch (withdrawStep) {
            case 'withdrawing': return 'Withdrawing…';
            case 'waitingWithdraw': return 'Confirming…';
            case 'success': return 'Withdraw Successful ✓';
            case 'error': return 'Transaction Failed';
            default: return isBase ? 'Withdraw to Base Wallet' : 'Withdraw';
        }
    };

    return (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
            {/* Background Accent for Base */}
            {isBase && (
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none translate-x-1/2 -translate-y-1/2" />
            )}

            {/* Header with Active Pools Badge & Network Switcher */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col gap-1">
                    <h3 className="text-[12px] font-bold text-white uppercase tracking-[0.2em]">Vault Actions</h3>
                    <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${isBase ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'}`} />
                        <span className={`text-[10px] font-bold uppercase  ${isBase ? 'text-emerald-400/80' : 'text-zinc-500'}`}>
                            {isBase ? 'Base Safe Haven' : 'Arbitrum Main'}
                        </span>
                    </div>
                </div>
                {isBase ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(52,211,153,0.1)]">
                        <span className="text-xs">🛡️</span>
                        <span className="text-[9px] font-bold uppercase ">Protected Mode</span>
                    </div>
                ) : (
                    activePoolCount !== null && (
                        <span className="text-[10px] font-bold uppercase  px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {activePoolCount} Active Strategy
                        </span>
                    )
                )}
            </div>

            {/* ─── CLAIM UI (Prominent on Base) ─── */}
            <AnimatePresence>
                {unclaimedFunds > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        className="p-5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex flex-col gap-4 relative overflow-hidden group shadow-lg shadow-cyan-900/5"
                    >
                        {/* Shine effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/5 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />

                        <div className="flex items-center justify-between relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-xl shadow-inner">
                                    🎁
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs font-black text-cyan-400 uppercase ">Bridged Assets Ready</span>
                                    <span className="text-[10px] text-zinc-400 font-medium">Oracle has finalized your rescue.</span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-lg font-mono font-bold text-zinc-50">${unclaimedFunds.toLocaleString()}</span>
                                <span className="text-[9px] text-cyan-400/60 font-bold uppercase">USDC-BnM</span>
                            </div>
                        </div>

                        {!isBase ? (
                            <button
                                onClick={() => switchChain?.({ chainId: baseSepolia.id })}
                                className="w-full py-3 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-[0.15em] rounded-xl border border-cyan-500/30 transition-all active:scale-[0.98] shadow-sm"
                            >
                                Switch Network to Claim
                            </button>
                        ) : (
                            <button
                                onClick={() => claimFunds()}
                                disabled={isClaimBusy}
                                className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-[10px] font-black uppercase tracking-[0.15em] rounded-xl transition-all shadow-lg shadow-cyan-500/30 active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                {isClaimBusy && <span className="w-3 h-3 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />}
                                {isClaimBusy ? 'Processing Claim...' : 'Claim to Portfolio'}
                            </button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tab Switcher (Only on Arbitrum) */}
            {!isBase && (
                <div className="flex gap-1 bg-zinc-800/60 rounded-xl p-1 mb-6">
                    {(['deposit', 'withdraw'] as Tab[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`relative flex-1 py-2.5 text-xs font-bold uppercase  rounded-lg transition-colors duration-200 ${activeTab === tab
                                ? 'text-[#598eff]'
                                : 'text-white'
                                }`}
                        >
                            {activeTab === tab && (
                                <motion.div
                                    layoutId="vault-tab-bg"
                                    className="absolute inset-0 bg-[rgba(0,0,128,0.5)]/50 rounded-lg shadow-sm"
                                    transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
                                />
                            )}
                            <span className="relative z-10">{tab}</span>
                        </button>
                    ))}
                </div>
            )}

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab + (isBase ? '-base' : '-arb')}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                >
                    {/* Header for Base Mode Withdraw */}
                    {isBase && (
                        <div className="mb-4">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase  mb-1">Portfolio Withdrawal</h4>
                            <p className="text-[10px] text-zinc-600">Once claimed, you can withdraw your protected assets to your personal Base wallet.</p>
                        </div>
                    )}

                    {/* Balance Info */}
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] text-zinc-500 uppercase  font-bold">
                            {activeTab === 'deposit' ? 'Wallet Balance' : 'Portfolio Shares'}
                        </span>
                        <span className="text-xs font-mono font-medium text-zinc-300">
                            {activeTab === 'deposit'
                                ? `${usdcBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
                                : `${totalShares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} shares`}
                        </span>
                    </div>

                    {/* Amount Input */}
                    <div className="relative mb-4">
                        <input
                            id="vault-amount-input"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={activeTab === 'deposit' ? '0.00' : '0.00'}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            disabled={isDepositBusy || isWithdrawBusy}
                            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-2xl px-5 py-4 text-lg font-mono text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/20 transition-all disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                            onClick={handleMax}
                            disabled={isDepositBusy || isWithdrawBusy}
                            className="absolute right-4 top-1/2 -translate-y-1/2 px-3 py-1.5 text-[10px] font-black uppercase  text-[#598eff] bg-[rgba(0,0,128,0.5)]/50 rounded-lg hover:bg-[rgba(0,0,128,0.5)]/70 transition-all disabled:opacity-50 border-none"
                        >
                            Max
                        </button>
                    </div>

                    {/* Preview Info */}
                    {activeTab === 'deposit' && !isBase && (
                        <div className="flex flex-col gap-2 mb-6 px-1">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Min deposit</span>
                                    <span className="text-[10px] text-zinc-400 font-mono">{MIN_DEPOSIT_USDC} USDC</span>
                                </div>

                                {usdcBalance < 10 && (
                                    <button
                                        onClick={() => claimFaucet()}
                                        disabled={isFaucetPending || isFaucetConfirming || (faucetStep as string) === 'success'}
                                        className={`text-[9px] font-black uppercase  px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 ${(faucetStep as string) === 'success'
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            : faucetError
                                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 active:scale-95 border border-zinc-700'
                                            }`}
                                    >
                                        {(isFaucetPending || isFaucetConfirming) && (
                                            <span className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        )}
                                        {(faucetStep as string) === 'success' ? 'USDC MINTED ✓' : 'MINT 10 TEST USDC'}
                                    </button>
                                )}
                            </div>

                            {numericAmount > 0 && (
                                <div className="flex items-center justify-between pt-1">
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Shares to mint</span>
                                    <span className="text-xs text-blue-400 font-mono">
                                        {isEstimating
                                            ? <span className="inline-block w-12 h-3 bg-zinc-800 rounded animate-pulse" />
                                            : estimatedShares !== null
                                                ? `≈ ${estimatedShares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                                                : '—'
                                        }
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'withdraw' && (
                        <div className="flex flex-col gap-2 mb-6 px-1">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-zinc-500 uppercase font-bold">Current value</span>
                                <span className="text-xs text-zinc-400 font-mono">
                                    ${vaultBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                                </span>
                            </div>

                            {numericAmount > 0 && (
                                <div className="flex items-center justify-between pt-1">
                                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Assets to receive</span>
                                    <span className={`text-xs font-mono ${isBase ? 'text-emerald-400' : 'text-orange-400'}`}>
                                        {isEstimating
                                            ? <span className="inline-block w-12 h-3 bg-zinc-800 rounded animate-pulse" />
                                            : estimatedUsdc !== null
                                                ? `≈ $${estimatedUsdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                : '—'
                                        }
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action Button */}
                    {activeTab === 'deposit' && !isBase ? (
                        <button
                            onClick={handleDeposit}
                            disabled={!canDeposit || isDepositBusy || depositStep === 'success'}
                            className={`w-full py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all duration-200 ${depositStep === 'success' ? 'bg-emerald-500/10 text-emerald-400' : depositStep === 'error' ? 'bg-red-500/10 text-red-400' : canDeposit && !isDepositBusy ? 'bg-[rgba(0,0,128,0.5)]/50 hover:bg-[rgba(0,0,128,0.5)]/70 text-[#598eff] shadow-lg shadow-blue-900/20 active:scale-[0.98]' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'} border-none`}
                        >
                            <span className="flex items-center justify-center gap-2 text-[#598eff]">
                                {isDepositBusy && (
                                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                )}
                                {getDepositStepLabel()}
                            </span>
                        </button>
                    ) : (
                        activeTab === 'withdraw' && (
                            <button
                                onClick={handleWithdraw}
                                disabled={!canWithdraw || isWithdrawBusy || withdrawStep === 'success'}
                                className={`w-full py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all duration-200 ${withdrawStep === 'success' ? 'bg-emerald-500/10 text-emerald-400' : withdrawStep === 'error' ? 'bg-red-500/10 text-red-400' : canWithdraw && !isWithdrawBusy ? 'bg-[rgba(0,0,128,0.5)]/50 hover:bg-[rgba(0,0,128,0.5)]/70 text-[#598eff] shadow-lg shadow-blue-500/20 active:scale-[0.98]' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'} border-none`}
                            >
                                <span className="flex items-center justify-center gap-2 text-[#598eff]">
                                    {isWithdrawBusy && (
                                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    )}
                                    {getWithdrawStepLabel()}
                                </span>
                            </button>
                        )
                    )}

                    {/* Network Hint */}
                    {!isBase && totalShares === 0 && (
                        <p className="mt-6 text-[10px] text-center text-zinc-600 font-medium">
                            Switch to <span className="text-emerald-500/80 font-bold">Base Safe Haven</span> to view protected assets.
                        </p>
                    )}

                    {/* Error Messages */}
                    {(depositError || withdrawError || claimError) && (
                        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-xs text-red-400 break-all">
                                {depositError || withdrawError || claimError}
                            </p>
                            <button
                                onClick={activeTab === 'deposit' ? resetDeposit : resetWithdraw}
                                className="mt-2 text-[10px] uppercase  text-red-400 hover:text-red-300 border-none"
                            >
                                Try again
                            </button>
                        </div>
                    )}


                    {/* Deposit Step Indicator */}
                    {activeTab === 'deposit' && depositStep !== 'idle' && depositStep !== 'error' && (
                        <div className="mt-4 flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${depositStep === 'approving' || depositStep === 'waitingApproval' ? 'bg-cyan-400 animate-pulse' :
                                    depositStep === 'success' || depositStep === 'depositing' || depositStep === 'waitingDeposit' ? 'bg-emerald-400' : 'bg-zinc-600'
                                    }`} />
                                <span className="text-[10px] text-zinc-500 uppercase ">Approve</span>
                            </div>
                            <div className="flex-1 h-px bg-zinc-700" />
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${depositStep === 'depositing' || depositStep === 'waitingDeposit' ? 'bg-cyan-400 animate-pulse' :
                                    depositStep === 'success' ? 'bg-emerald-400' : 'bg-zinc-600'
                                    }`} />
                                <span className="text-[10px] text-zinc-500 uppercase ">Deposit</span>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
