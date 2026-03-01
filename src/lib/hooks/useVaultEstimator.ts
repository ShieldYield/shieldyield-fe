'use client';

import { useState, useEffect, useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import {
    SHIELD_VAULT_ADDRESS,
    SHIELD_VAULT_ABI,
    USDC_DECIMALS,
} from '../contracts';

// ============================================================================
// useVaultEstimator — Debounced preview for deposit/withdraw amounts
// ============================================================================

/**
 * Debounced estimator hook that calls `previewDeposit` or `previewWithdraw`
 * on ShieldVault to show the user how many shares/USDC they'll receive.
 *
 * @param amountStr - Raw input string from the user (e.g. "100.5")
 * @param mode - Current tab: 'deposit' or 'withdraw'
 */
export function useVaultEstimator(amountStr: string, mode: 'deposit' | 'withdraw') {
    // Debounce the input to avoid hammering the RPC on every keystroke
    const [debouncedAmount, setDebouncedAmount] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedAmount(amountStr), 500);
        return () => clearTimeout(timer);
    }, [amountStr]);

    // Parse the debounced amount into BigInt
    const amountRaw = useMemo(() => {
        const num = parseFloat(debouncedAmount);
        if (!num || num <= 0) return 0n;
        try {
            return parseUnits(debouncedAmount, USDC_DECIMALS);
        } catch {
            return 0n;
        }
    }, [debouncedAmount]);

    const isValidAmount = amountRaw > 0n;

    // Preview Deposit → returns estimated shares
    const {
        data: previewDepositResult,
        isLoading: isDepositPreviewLoading,
    } = useReadContract({
        address: SHIELD_VAULT_ADDRESS,
        abi: SHIELD_VAULT_ABI,
        functionName: 'previewDeposit',
        args: [amountRaw],
        query: {
            enabled: isValidAmount && mode === 'deposit',
        },
    });

    // Preview Withdraw → returns estimated USDC
    const {
        data: previewWithdrawResult,
        isLoading: isWithdrawPreviewLoading,
    } = useReadContract({
        address: SHIELD_VAULT_ADDRESS,
        abi: SHIELD_VAULT_ABI,
        functionName: 'previewWithdraw',
        args: [amountRaw],
        query: {
            enabled: isValidAmount && mode === 'withdraw',
        },
    });

    // Format results for display
    const estimatedShares = previewDepositResult
        ? Number(formatUnits(previewDepositResult as bigint, USDC_DECIMALS))
        : null;

    const estimatedUsdc = previewWithdrawResult
        ? Number(formatUnits(previewWithdrawResult as bigint, USDC_DECIMALS))
        : null;

    const isLoading = mode === 'deposit' ? isDepositPreviewLoading : isWithdrawPreviewLoading;

    // Show loading state also during debounce wait
    const isDebouncePending = amountStr !== debouncedAmount;

    return {
        estimatedShares,
        estimatedUsdc,
        isLoading: isLoading || isDebouncePending,
        isValidAmount,
    };
}

// ============================================================================
// useActivePoolCount — Read the number of active adapter pools
// ============================================================================

export function useActivePoolCount() {
    const { data, isLoading } = useReadContract({
        address: SHIELD_VAULT_ADDRESS,
        abi: SHIELD_VAULT_ABI,
        functionName: 'getActivePoolCount',
        query: {
            refetchInterval: 30_000, // Refresh every 30s
        },
    });

    const count = data ? Number(data as bigint) : null;

    return { activePoolCount: count, isLoading };
}
