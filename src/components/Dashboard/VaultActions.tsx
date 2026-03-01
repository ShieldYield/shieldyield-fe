'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { parseUnits } from 'viem';
import { motion, AnimatePresence } from 'framer-motion';
import { useVaultData, useDeposit, useWithdraw } from '../../lib/hooks/useShieldVault';
import { useFaucet } from '../../lib/hooks/useFaucet';
import { useVaultEstimator, useActivePoolCount } from '../../lib/hooks/useVaultEstimator';
import { USDC_DECIMALS, MIN_DEPOSIT_USDC } from '../../lib/contracts';

// ============================================================================
// VaultActions — Deposit / Withdraw Panel
// ============================================================================

type Tab = 'deposit' | 'withdraw';

export default function VaultActions({ onSuccess }: { onSuccess?: () => void }) {
    const { isConnected } = useAccount();
    const [activeTab, setActiveTab] = useState<Tab>('deposit');
    const [amount, setAmount] = useState('');

    const { usdcBalance, totalShares, totalSharesRaw, vaultBalance, refetch } = useVaultData();
    const { deposit, step: depositStep, error: depositError, reset: resetDeposit, isPending: isDepositPending, isConfirming: isDepositConfirming } = useDeposit();
    const { withdraw, step: withdrawStep, error: withdrawError, reset: resetWithdraw, isPending: isWithdrawPending, isConfirming: isWithdrawConfirming } = useWithdraw();
    const { claim: claimFaucet, step: faucetStep, error: faucetError, reset: resetFaucet, isPending: isFaucetPending, isConfirming: isFaucetConfirming } = useFaucet();

    // Estimator hooks
    const { estimatedShares, estimatedUsdc, isLoading: isEstimating } = useVaultEstimator(amount, activeTab);
    const { activePoolCount } = useActivePoolCount();

    // Reset state when switching tabs
    useEffect(() => {
        setAmount('');
        resetDeposit();
        resetWithdraw();
    }, [activeTab, resetDeposit, resetWithdraw]);

    // Refresh data on success
    useEffect(() => {
        if (depositStep === 'success' || withdrawStep === 'success' || faucetStep === 'success') {
            refetch();
            onSuccess?.();

            // Auto-reset faucet UI state after a few seconds
            if (faucetStep === 'success') {
                const timer = setTimeout(() => resetFaucet(), 3000);
                return () => clearTimeout(timer);
            }
        }
    }, [depositStep, withdrawStep, faucetStep, refetch, onSuccess, resetFaucet]);

    if (!isConnected) return null;

    const numericAmount = parseFloat(amount) || 0;

    // -- Deposit logic --
    const canDeposit = numericAmount >= MIN_DEPOSIT_USDC && numericAmount <= usdcBalance;
    const isDepositBusy = isDepositPending || isDepositConfirming || (depositStep !== 'idle' && depositStep !== 'success' && depositStep !== 'error');

    // -- Withdraw logic --
    const canWithdraw = numericAmount > 0 && numericAmount <= totalShares;
    const isWithdrawBusy = isWithdrawPending || isWithdrawConfirming || (withdrawStep !== 'idle' && withdrawStep !== 'success' && withdrawStep !== 'error');

    const handleDeposit = () => {
        if (!canDeposit) return;
        deposit(numericAmount);
    };

    const handleWithdraw = () => {
        if (!canWithdraw) return;
        // Convert shares amount to raw bigint (6 decimals for USDC-based shares)
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
            default: return 'Withdraw';
        }
    };

    return (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6">
            {/* Header with Active Pools Badge */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-widest">Vault Actions</h3>
                {activePoolCount !== null && (
                    <span className="text-[10px] font-medium uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {activePoolCount} Active Pool{activePoolCount !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-1 bg-zinc-800/60 rounded-xl p-1 mb-6">
                {(['deposit', 'withdraw'] as Tab[]).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`relative flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${activeTab === tab
                            ? 'text-zinc-50'
                            : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                    >
                        {activeTab === tab && (
                            <motion.div
                                layoutId="vault-tab-bg"
                                className="absolute inset-0 bg-zinc-700/70 rounded-lg"
                                transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
                            />
                        )}
                        <span className="relative z-10 capitalize">{tab}</span>
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                >
                    {/* Balance Info */}
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-zinc-500 uppercase tracking-widest">
                            {activeTab === 'deposit' ? 'Wallet USDC' : 'Vault Shares'}
                        </span>
                        <span className="text-sm font-light text-zinc-300">
                            {activeTab === 'deposit'
                                ? `${usdcBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
                                : `${totalShares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} shares`}
                        </span>
                    </div>

                    {/* Amount Input */}
                    <div className="relative mb-4">
                        <input
                            id="vault-amount-input"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={activeTab === 'deposit' ? 'Enter USDC amount' : 'Enter shares amount'}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            disabled={isDepositBusy || isWithdrawBusy}
                            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3.5 text-base font-light text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                            onClick={handleMax}
                            disabled={isDepositBusy || isWithdrawBusy}
                            className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-400 bg-cyan-500/10 rounded-md hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
                        >
                            Max
                        </button>
                    </div>

                    {/* Preview Info */}
                    {activeTab === 'deposit' && (
                        <div className="flex flex-col gap-2 mb-4 px-1">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-zinc-500">Min deposit</span>
                                    <span className="text-xs text-zinc-400">{MIN_DEPOSIT_USDC} USDC</span>
                                </div>

                                {/* Show Faucet button if balance is very low (e.g., < 10 USDC) */}
                                {usdcBalance < 10 && (
                                    <button
                                        onClick={() => claimFaucet()}
                                        disabled={isFaucetPending || isFaucetConfirming || faucetStep === 'success'}
                                        className={`text-xs px-2.5 py-1 rounded-md transition-all duration-200 flex items-center gap-1.5 ${faucetStep === 'success'
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : faucetError
                                                ? 'bg-red-500/10 text-red-400'
                                                : 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 active:scale-95'
                                            }`}
                                        title="Claim 10,000 test USDC for demo purposes"
                                    >
                                        {(isFaucetPending || isFaucetConfirming) && (
                                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        )}
                                        {faucetStep === 'success' ? 'Claimed ✓' : faucetError ? 'Failed' : 'Claim Test USDC'}
                                    </button>
                                )}
                            </div>

                            {/* Deposit Preview Estimation */}
                            {numericAmount > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-zinc-500">Est. shares received</span>
                                    <span className="text-xs text-cyan-400 font-light">
                                        {isEstimating
                                            ? <span className="inline-block w-12 h-3 bg-zinc-700 rounded animate-pulse" />
                                            : estimatedShares !== null
                                                ? `≈ ${estimatedShares.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} shares`
                                                : '—'
                                        }
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                    {activeTab === 'withdraw' && (
                        <div className="flex flex-col gap-2 mb-4 px-1">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-500">Vault balance</span>
                                <span className="text-xs text-zinc-400">
                                    ${vaultBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                                </span>
                            </div>

                            {/* Withdraw Preview Estimation */}
                            {numericAmount > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-zinc-500">Est. USDC received</span>
                                    <span className="text-xs text-orange-400 font-light">
                                        {isEstimating
                                            ? <span className="inline-block w-12 h-3 bg-zinc-700 rounded animate-pulse" />
                                            : estimatedUsdc !== null
                                                ? `≈ ${estimatedUsdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC`
                                                : '—'
                                        }
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action Button */}
                    {activeTab === 'deposit' ? (
                        <button
                            id="vault-deposit-btn"
                            onClick={handleDeposit}
                            disabled={!canDeposit || isDepositBusy || depositStep === 'success'}
                            className={`w-full py-3.5 rounded-xl text-sm font-medium transition-all duration-200 ${depositStep === 'success'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : depositStep === 'error'
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                    : canDeposit && !isDepositBusy
                                        ? 'bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-lg shadow-cyan-500/20'
                                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                {isDepositBusy && (
                                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                )}
                                {getDepositStepLabel()}
                            </span>
                        </button>
                    ) : (
                        <button
                            id="vault-withdraw-btn"
                            onClick={handleWithdraw}
                            disabled={!canWithdraw || isWithdrawBusy || withdrawStep === 'success'}
                            className={`w-full py-3.5 rounded-xl text-sm font-medium transition-all duration-200 ${withdrawStep === 'success'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : withdrawStep === 'error'
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                    : canWithdraw && !isWithdrawBusy
                                        ? 'bg-orange-500 hover:bg-orange-400 text-zinc-950 shadow-lg shadow-orange-500/20'
                                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                {isWithdrawBusy && (
                                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                )}
                                {getWithdrawStepLabel()}
                            </span>
                        </button>
                    )}

                    {/* Error Message */}
                    {(depositError || withdrawError) && (
                        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-xs text-red-400 break-all">
                                {depositError || withdrawError}
                            </p>
                            <button
                                onClick={activeTab === 'deposit' ? resetDeposit : resetWithdraw}
                                className="mt-2 text-[10px] uppercase tracking-widest text-red-400 hover:text-red-300"
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
                                <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Approve</span>
                            </div>
                            <div className="flex-1 h-px bg-zinc-700" />
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${depositStep === 'depositing' || depositStep === 'waitingDeposit' ? 'bg-cyan-400 animate-pulse' :
                                    depositStep === 'success' ? 'bg-emerald-400' : 'bg-zinc-600'
                                    }`} />
                                <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Deposit</span>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
