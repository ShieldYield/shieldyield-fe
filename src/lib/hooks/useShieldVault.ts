'use client';

import { useState, useCallback, useEffect } from 'react';
import {
    useWriteContract,
    useWaitForTransactionReceipt,
    useReadContracts,
    useAccount,
} from 'wagmi';
import { parseUnits, formatUnits, type Address } from 'viem';
import {
    SHIELD_VAULT_ADDRESS,
    SHIELD_VAULT_ABI,
    MOCK_USDC_ADDRESS,
    ERC20_ABI,
    USDC_DECIMALS,
} from '../contracts';

// ============================================================================
// useVaultData — Read vault + wallet state
// ============================================================================

export function useVaultData() {
    const { address } = useAccount();

    const { data, refetch, isLoading } = useReadContracts({
        contracts: address
            ? [
                // 0: USDC balance of user
                {
                    address: MOCK_USDC_ADDRESS,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [address],
                },
                // 1: USDC allowance for ShieldVault
                {
                    address: MOCK_USDC_ADDRESS,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [address, SHIELD_VAULT_ADDRESS],
                },
                // 2: Vault balance (USDC terms)
                {
                    address: SHIELD_VAULT_ADDRESS,
                    abi: SHIELD_VAULT_ABI,
                    functionName: 'getUserBalance',
                    args: [address],
                },
                // 3: User position (deposited, shares, lastDepositTime)
                {
                    address: SHIELD_VAULT_ADDRESS,
                    abi: SHIELD_VAULT_ABI,
                    functionName: 'getUserPosition',
                    args: [address],
                },
            ]
            : [],
        query: {
            enabled: !!address,
            refetchInterval: 10_000,
        },
    });

    const usdcBalance = data?.[0]?.result
        ? Number(formatUnits(data[0].result as bigint, USDC_DECIMALS))
        : 0;

    const usdcAllowance = data?.[1]?.result
        ? Number(formatUnits(data[1].result as bigint, USDC_DECIMALS))
        : 0;

    const vaultBalance = data?.[2]?.result
        ? Number(formatUnits(data[2].result as bigint, USDC_DECIMALS))
        : 0;

    const position = data?.[3]?.result as
        | { totalDeposited: bigint; totalShares: bigint; lastDepositTime: bigint }
        | undefined;

    const totalDeposited = position
        ? Number(formatUnits(position.totalDeposited, USDC_DECIMALS))
        : 0;

    const totalShares = position
        ? Number(formatUnits(position.totalShares, USDC_DECIMALS))
        : 0;

    return {
        usdcBalance,
        usdcAllowance,
        vaultBalance,
        totalDeposited,
        totalShares,
        totalSharesRaw: position?.totalShares ?? 0n,
        refetch,
        isLoading,
    };
}

// ============================================================================
// useDeposit — 2-step: Approve USDC → Deposit into ShieldVault
// ============================================================================

type DepositStep = 'idle' | 'approving' | 'waitingApproval' | 'depositing' | 'waitingDeposit' | 'success' | 'error';

export function useDeposit() {
    const [step, setStep] = useState<DepositStep>('idle');
    const [error, setError] = useState<string | null>(null);

    // Approve tx
    const {
        writeContract: writeApprove,
        data: approveHash,
        isPending: isApprovePending,
        error: approveError,
        reset: resetApprove,
    } = useWriteContract();

    const {
        isLoading: isApproveConfirming,
        isSuccess: isApproveConfirmed,
    } = useWaitForTransactionReceipt({ hash: approveHash });

    // Deposit tx
    const {
        writeContract: writeDeposit,
        data: depositHash,
        isPending: isDepositPending,
        error: depositError,
        reset: resetDeposit,
    } = useWriteContract();

    const {
        isLoading: isDepositConfirming,
        isSuccess: isDepositConfirmed,
    } = useWaitForTransactionReceipt({ hash: depositHash });

    // Step 2: After approval confirmed, execute deposit
    const [pendingAmount, setPendingAmount] = useState<bigint>(0n);

    useEffect(() => {
        if (isApproveConfirmed && step === 'waitingApproval' && pendingAmount > 0n) {
            setStep('depositing');
            writeDeposit({
                address: SHIELD_VAULT_ADDRESS,
                abi: SHIELD_VAULT_ABI,
                functionName: 'deposit',
                args: [pendingAmount],
            });
        }
    }, [isApproveConfirmed, step, pendingAmount, writeDeposit]);

    // Track deposit pending → confirming
    useEffect(() => {
        if (depositHash && step === 'depositing') {
            setStep('waitingDeposit');
        }
    }, [depositHash, step]);

    // Track deposit confirmed
    useEffect(() => {
        if (isDepositConfirmed && step === 'waitingDeposit') {
            setStep('success');
        }
    }, [isDepositConfirmed, step]);

    // Track errors
    useEffect(() => {
        if (approveError) {
            setError(approveError.message?.split('\n')[0] || 'Approve failed');
            setStep('error');
        }
        if (depositError) {
            setError(depositError.message?.split('\n')[0] || 'Deposit failed');
            setStep('error');
        }
    }, [approveError, depositError]);

    const deposit = useCallback(
        (amountUsdc: number) => {
            setError(null);
            setStep('approving');

            const amountRaw = parseUnits(amountUsdc.toString(), USDC_DECIMALS);
            setPendingAmount(amountRaw);

            writeApprove({
                address: MOCK_USDC_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [SHIELD_VAULT_ADDRESS, amountRaw],
                gas: 500_000n,
            });
        },
        [writeApprove]
    );

    // Track approve pending → confirming
    useEffect(() => {
        if (approveHash && step === 'approving') {
            setStep('waitingApproval');
        }
    }, [approveHash, step]);

    const reset = useCallback(() => {
        setStep('idle');
        setError(null);
        setPendingAmount(0n);
        resetApprove();
        resetDeposit();
    }, [resetApprove, resetDeposit]);

    return {
        deposit,
        step,
        error,
        reset,
        isPending: isApprovePending || isDepositPending,
        isConfirming: isApproveConfirming || isDepositConfirming,
    };
}

// ============================================================================
// useWithdraw — Single-step: Withdraw shares from ShieldVault
// ============================================================================

type WithdrawStep = 'idle' | 'withdrawing' | 'waitingWithdraw' | 'success' | 'error';

export function useWithdraw() {
    const [step, setStep] = useState<WithdrawStep>('idle');
    const [error, setError] = useState<string | null>(null);

    const {
        writeContract: writeWithdraw,
        data: withdrawHash,
        isPending,
        error: withdrawError,
        reset: resetWrite,
    } = useWriteContract();

    const {
        isLoading: isConfirming,
        isSuccess: isConfirmed,
    } = useWaitForTransactionReceipt({ hash: withdrawHash });

    useEffect(() => {
        if (withdrawHash && step === 'withdrawing') {
            setStep('waitingWithdraw');
        }
    }, [withdrawHash, step]);

    useEffect(() => {
        if (isConfirmed && step === 'waitingWithdraw') {
            setStep('success');
        }
    }, [isConfirmed, step]);

    useEffect(() => {
        if (withdrawError) {
            setError(withdrawError.message?.split('\n')[0] || 'Withdraw failed');
            setStep('error');
        }
    }, [withdrawError]);

    const withdraw = useCallback(
        (sharesRaw: bigint) => {
            setError(null);
            setStep('withdrawing');

            writeWithdraw({
                address: SHIELD_VAULT_ADDRESS,
                abi: SHIELD_VAULT_ABI,
                functionName: 'withdraw',
                args: [sharesRaw],
                // Explicit gas limit: prevents MetaMask from showing absurd
                // gas estimates ($16M+) when the tx might revert on Arbitrum.
                // 500_000 is well above the real cost (~150k) but safe.
                gas: 500_000n,
            });
        },
        [writeWithdraw]
    );

    const reset = useCallback(() => {
        setStep('idle');
        setError(null);
        resetWrite();
    }, [resetWrite]);

    return {
        withdraw,
        step,
        error,
        reset,
        isPending,
        isConfirming,
    };
}
