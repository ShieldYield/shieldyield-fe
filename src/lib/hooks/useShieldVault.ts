'use client';

import { useState, useCallback, useEffect } from 'react';
import {
    useWriteContract,
    useWaitForTransactionReceipt,
    useReadContracts,
    useAccount,
    usePublicClient,
} from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
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
// Helpers
// ============================================================================

/**
 * Extract human-readable message from a viem/wagmi error.
 * viem formats multi-line errors like:
 *   The contract function "foo" reverted with the following reason:\nActual reason\n...
 * split('\n')[0] only returns the header — this grabs the actual reason.
 */
function extractErrorMessage(error: Error): string {
    const anyErr = error as any;
    // viem ContractFunctionRevertedError exposes shortMessage with just the reason
    if (anyErr.shortMessage) return anyErr.shortMessage;
    if (anyErr.cause?.shortMessage) return anyErr.cause.shortMessage;

    // Parse multi-line viem error: reason is on the 2nd line
    const msg = error.message || '';
    const reasonMatch = msg.match(/reverted with the following reason:\n(.*)/);
    if (reasonMatch) return reasonMatch[1].trim();

    return msg.split('\n')[0] || 'Transaction failed';
}

/**
 * Returns a safe gasPrice for legacy (Type 0) transactions on Arbitrum Sepolia.
 *
 * MetaMask consistently overrides EIP-1559 maxFeePerGas/maxPriorityFeePerGas
 * with its own stale RPC estimate (~0.02 gwei), which falls below the actual
 * baseFee. Legacy transactions bypass this override — MetaMask respects the
 * provided gasPrice directly.
 *
 * Floor of 0.5 gwei ensures we always clear the baseFee regardless of RPC staleness.
 */
async function getFreshGasPrice(client: NonNullable<ReturnType<typeof usePublicClient>>) {
    const rpcGasPrice = await client.getGasPrice();
    const computed = rpcGasPrice * 4n;
    const floor = 500_000_000n; // 0.5 gwei — 25x Arbitrum Sepolia's ~0.02 gwei baseFee
    return computed > floor ? computed : floor;
}
// ============================================================================
// useDeposit — 2-step: Approve USDC → Deposit into ShieldVault
// ============================================================================

type DepositStep = 'idle' | 'approving' | 'waitingApproval' | 'depositing' | 'waitingDeposit' | 'success' | 'error';

export function useDeposit() {
    const [step, setStep] = useState<DepositStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const publicClient = usePublicClient();

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
        isError: isDepositReceiptError,
        error: depositReceiptError,
    } = useWaitForTransactionReceipt({ hash: depositHash });

    // Step 2: After approval confirmed, execute deposit
    const [pendingAmount, setPendingAmount] = useState<bigint>(0n);

    useEffect(() => {
        if (isApproveConfirmed && step === 'waitingApproval' && pendingAmount > 0n) {
            setStep('depositing');
            (async () => {
                const gasPrice = await getFreshGasPrice(publicClient!);
                writeDeposit({
                    address: SHIELD_VAULT_ADDRESS,
                    abi: SHIELD_VAULT_ABI,
                    functionName: 'deposit',
                    args: [pendingAmount],
                    gas: 700_000n,
                    gasPrice,
                });
            })();
        }
    }, [isApproveConfirmed, step, pendingAmount, writeDeposit, publicClient]);

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

    // Track errors (submission failures)
    useEffect(() => {
        if (approveError) {
            setError(extractErrorMessage(approveError));
            setStep('error');
        }
        if (depositError) {
            setError(extractErrorMessage(depositError));
            setStep('error');
        }
    }, [approveError, depositError]);

    // Handle on-chain revert: deposit tx submitted OK but reverted during execution
    useEffect(() => {
        if (isDepositReceiptError && depositReceiptError) {
            setError(extractErrorMessage(depositReceiptError));
            setStep('error');
        }
    }, [isDepositReceiptError, depositReceiptError]);

    const deposit = useCallback(
        async (amountUsdc: number) => {
            setError(null);
            setStep('approving');

            const amountRaw = parseUnits(amountUsdc.toString(), USDC_DECIMALS);
            setPendingAmount(amountRaw);

            const gasPrice = await getFreshGasPrice(publicClient!);

            writeApprove({
                address: MOCK_USDC_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [SHIELD_VAULT_ADDRESS, amountRaw],
                gas: 100_000n,
                gasPrice,
            });
        },
        [writeApprove, publicClient]
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
    const publicClient = usePublicClient();

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
        isError: isReceiptError,
        error: receiptError,
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
            setError(extractErrorMessage(withdrawError));
            setStep('error');
        }
    }, [withdrawError]);

    // Handle on-chain revert: tx submitted OK but reverted during execution
    useEffect(() => {
        if (isReceiptError && receiptError) {
            setError(extractErrorMessage(receiptError));
            setStep('error');
        }
    }, [isReceiptError, receiptError]);

    const withdraw = useCallback(
        async (sharesRaw: bigint) => {
            setError(null);
            setStep('withdrawing');

            const gasPrice = await getFreshGasPrice(publicClient!);

            writeWithdraw({
                address: SHIELD_VAULT_ADDRESS,
                abi: SHIELD_VAULT_ABI,
                functionName: 'withdraw',
                args: [sharesRaw],
                gas: 500_000n,
                gasPrice,
            });
        },
        [writeWithdraw, publicClient]
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
