'use client';

import { useState, useCallback, useEffect } from 'react';
import {
    useWriteContract,
    useWaitForTransactionReceipt,
    useReadContracts,
    useAccount,
    usePublicClient,
    useChainId,
} from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import {
    SHIELD_VAULT_ADDRESS,
    BASE_SHIELD_VAULT_ADDRESS,
    SHIELD_VAULT_ABI,
    MOCK_USDC_ADDRESS,
    ERC20_ABI,
    USDC_DECIMALS,
} from '../contracts';

// ============================================================================
// useVaultData — Read vault + wallet state (supports both chains)
// ============================================================================

export function useVaultData() {
    const { address } = useAccount();
    const chainId = useChainId();
    
    // Select the correct vault address based on current chain
    const activeVaultAddress = chainId === 84532 ? BASE_SHIELD_VAULT_ADDRESS : SHIELD_VAULT_ADDRESS;

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
                // 1: USDC allowance for the active ShieldVault
                {
                    address: MOCK_USDC_ADDRESS,
                    abi: ERC20_ABI,
                    functionName: 'allowance',
                    args: [address, activeVaultAddress],
                },
                // 2: Vault balance (USDC terms)
                {
                    address: activeVaultAddress,
                    abi: SHIELD_VAULT_ABI,
                    functionName: 'getUserBalance',
                    args: [address],
                },
                // 3: User position (deposited, shares, lastDepositTime)
                {
                    address: activeVaultAddress,
                    abi: SHIELD_VAULT_ABI,
                    functionName: 'getUserPosition',
                    args: [address],
                },
                // 4: Cross-chain claimable amount (specific to Base)
                {
                    address: activeVaultAddress,
                    abi: SHIELD_VAULT_ABI,
                    functionName: 'crossChainClaims',
                    args: [address],
                }
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

    const claimableAmount = data?.[4]?.result
        ? Number(formatUnits(data[4].result as bigint, USDC_DECIMALS))
        : 0;

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
        claimableAmount,
        activeVaultAddress,
        refetch,
        isLoading,
    };
}

// ============================================================================
// Helpers
// ============================================================================

function extractErrorMessage(error: Error): string {
    const anyErr = error as any;
    if (anyErr.shortMessage) return anyErr.shortMessage;
    if (anyErr.cause?.shortMessage) return anyErr.cause.shortMessage;
    const msg = error.message || '';
    const reasonMatch = msg.match(/reverted with the following reason:\n(.*)/);
    if (reasonMatch) return reasonMatch[1].trim();
    return msg.split('\n')[0] || 'Transaction failed';
}

async function getFreshGasPrice(client: NonNullable<ReturnType<typeof usePublicClient>>) {
    try {
        const rpcGasPrice = await client.getGasPrice();
        const computed = rpcGasPrice * 4n;
        const floor = 500_000_000n; // 0.5 gwei
        return computed > floor ? computed : floor;
    } catch {
        return 1000_000_000n; // 1 gwei fallback
    }
}

// ============================================================================
// useDeposit — 2-step: Approve USDC → Deposit into ShieldVault
// ============================================================================

type DepositStep = 'idle' | 'approving' | 'waitingApproval' | 'depositing' | 'waitingDeposit' | 'success' | 'error';

export function useDeposit() {
    const [step, setStep] = useState<DepositStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const activeVaultAddress = chainId === 84532 ? BASE_SHIELD_VAULT_ADDRESS : SHIELD_VAULT_ADDRESS;

    const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending, error: approveError, reset: resetApprove } = useWriteContract();
    const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash });

    const { writeContract: writeDeposit, data: depositHash, isPending: isDepositPending, error: depositError, reset: resetDeposit } = useWriteContract();
    const { isLoading: isDepositConfirming, isSuccess: isDepositConfirmed, isError: isDepositReceiptError, error: depositReceiptError } = useWaitForTransactionReceipt({ hash: depositHash });

    const [pendingAmount, setPendingAmount] = useState<bigint>(0n);

    useEffect(() => {
        if (isApproveConfirmed && step === 'waitingApproval' && pendingAmount > 0n) {
            setStep('depositing');
            (async () => {
                const gasPrice = await getFreshGasPrice(publicClient!);
                writeDeposit({
                    address: activeVaultAddress,
                    abi: SHIELD_VAULT_ABI,
                    functionName: 'deposit',
                    args: [pendingAmount],
                    gas: 700_000n,
                    gasPrice,
                });
            })();
        }
    }, [isApproveConfirmed, step, pendingAmount, writeDeposit, publicClient, activeVaultAddress]);

    useEffect(() => {
        if (depositHash && step === 'depositing') setStep('waitingDeposit');
    }, [depositHash, step]);

    useEffect(() => {
        if (isDepositConfirmed && step === 'waitingDeposit') setStep('success');
    }, [isDepositConfirmed, step]);

    useEffect(() => {
        if (approveError) { setError(extractErrorMessage(approveError)); setStep('error'); }
        if (depositError) { setError(extractErrorMessage(depositError)); setStep('error'); }
    }, [approveError, depositError]);

    useEffect(() => {
        if (isDepositReceiptError && depositReceiptError) { setError(extractErrorMessage(depositReceiptError)); setStep('error'); }
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
                args: [activeVaultAddress, amountRaw],
                gas: 100_000n,
                gasPrice,
            });
        },
        [writeApprove, publicClient, activeVaultAddress]
    );

    useEffect(() => {
        if (approveHash && step === 'approving') setStep('waitingApproval');
    }, [approveHash, step]);

    const reset = useCallback(() => {
        setStep('idle'); setError(null); setPendingAmount(0n); resetApprove(); resetDeposit();
    }, [resetApprove, resetDeposit]);

    return { deposit, step, error, reset, isPending: isApprovePending || isDepositPending, isConfirming: isApproveConfirming || isDepositConfirming };
}

// ============================================================================
// useWithdraw — Single-step: Withdraw shares from ShieldVault
// ============================================================================

type WithdrawStep = 'idle' | 'withdrawing' | 'waitingWithdraw' | 'success' | 'error';

export function useWithdraw() {
    const [step, setStep] = useState<WithdrawStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const activeVaultAddress = chainId === 84532 ? BASE_SHIELD_VAULT_ADDRESS : SHIELD_VAULT_ADDRESS;

    const { writeContract: writeWithdraw, data: withdrawHash, isPending, error: withdrawError, reset: resetWrite } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed, isError: isReceiptError, error: receiptError } = useWaitForTransactionReceipt({ hash: withdrawHash });

    useEffect(() => {
        if (withdrawHash && step === 'withdrawing') setStep('waitingWithdraw');
    }, [withdrawHash, step]);

    useEffect(() => {
        if (isConfirmed && step === 'waitingWithdraw') setStep('success');
    }, [isConfirmed, step]);

    useEffect(() => {
        if (withdrawError) { setError(extractErrorMessage(withdrawError)); setStep('error'); }
    }, [withdrawError]);

    useEffect(() => {
        if (isReceiptError && receiptError) { setError(extractErrorMessage(receiptError)); setStep('error'); }
    }, [isReceiptError, receiptError]);

    const withdraw = useCallback(
        async (sharesRaw: bigint) => {
            setError(null); setStep('withdrawing');
            const gasPrice = await getFreshGasPrice(publicClient!);
            writeWithdraw({
                address: activeVaultAddress,
                abi: SHIELD_VAULT_ABI,
                functionName: 'withdraw',
                args: [sharesRaw],
                gas: 500_000n,
                gasPrice,
            });
        },
        [writeWithdraw, publicClient, activeVaultAddress]
    );

    const reset = useCallback(() => { setStep('idle'); setError(null); resetWrite(); }, [resetWrite]);

    return { withdraw, step, error, reset, isPending, isConfirming };
}

// ============================================================================
// useClaimCrossChain — For Base-side claim of bridged funds
// ============================================================================

export function useClaimCrossChain() {
    const [step, setStep] = useState<WithdrawStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const publicClient = usePublicClient();
    const chainId = useChainId();

    const { writeContract: writeClaim, data: hash, isPending, error: claimError, reset: resetWrite } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed, isError: isReceiptError, error: receiptError } = useWaitForTransactionReceipt({ hash });

    useEffect(() => {
        if (hash && step === 'withdrawing') setStep('waitingWithdraw'); // reusing WithdrawStep types
    }, [hash, step]);

    useEffect(() => {
        if (isConfirmed && step === 'waitingWithdraw') setStep('success');
    }, [isConfirmed, step]);

    useEffect(() => {
        if (claimError) { setError(extractErrorMessage(claimError)); setStep('error'); }
    }, [claimError]);

    useEffect(() => {
        if (isReceiptError && receiptError) { setError(extractErrorMessage(receiptError)); setStep('error'); }
    }, [isReceiptError, receiptError]);

    const claim = useCallback(async () => {
        if (chainId !== 84532) { setError("Switch to Base Sepolia first"); return; }
        setError(null); setStep('withdrawing');
        const gasPrice = await getFreshGasPrice(publicClient!);
        writeClaim({
            address: BASE_SHIELD_VAULT_ADDRESS,
            abi: SHIELD_VAULT_ABI,
            functionName: 'claimCrossChainFunds',
            gas: 500_000n,
            gasPrice,
        });
    }, [writeClaim, publicClient, chainId]);

    const reset = useCallback(() => { setStep('idle'); setError(null); resetWrite(); }, [resetWrite]);

    return { claim, step, error, reset, isPending, isConfirming };
}
