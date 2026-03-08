'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';

const CCIP_BNM_ADDRESS = '0xA8C0c11bf64AF62CDCA6f93D3769B88BdD7cb93D';

const MOCK_TOKEN_ABI = [
    {
        name: "drip",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "token", type: "address" }],
        outputs: [],
    },
] as const;

export type FaucetStep = 'idle' | 'depositing' | 'waitingDeposit' | 'success' | 'error';

export function useFaucet() {
    const { address: userAddress } = useAccount();
    const [step, setStep] = useState<FaucetStep>('idle');
    const [error, setError] = useState<string | null>(null);

    const {
        writeContract,
        data: hash,
        error: txError,
        isPending: isConfirming
    } = useWriteContract();

    const {
        isLoading: isWaiting,
        isSuccess: hasTxSucceeded,
        error: receiptError
    } = useWaitForTransactionReceipt({ hash });

    const claim = useCallback(() => {
        try {
            setError(null);
            setStep('depositing');
            if (!userAddress) throw new Error("Wallet not connected");

            writeContract({
                address: CCIP_BNM_ADDRESS,
                abi: MOCK_TOKEN_ABI,
                functionName: 'drip',
                args: [userAddress], // send tokens to the connected user
                maxFeePerGas: BigInt(500000000), // 0.5 gwei - safe margin for arbitrum sepolia base fee spikes
            });
        } catch (err: any) {
            console.error('Faucet catch error:', err);
            setError(err?.message || 'Failed to submit transaction');
            setStep('error');
        }
    }, [writeContract]);

    // Handle contract write errors (e.g. user rejected)
    useEffect(() => {
        if (txError) {
            console.error('Faucet TX Error:', txError);
            setError(txError.message || 'Transaction rejected or failed');
            setStep('error');
        }
    }, [txError]);

    // Handle receipt errors (transaction reverted on chain)
    useEffect(() => {
        if (receiptError) {
            console.error('Faucet Receipt Error:', receiptError);
            setError(receiptError.message || 'Transaction reverted');
            setStep('error');
        }
    }, [receiptError]);

    // Update steps based on tx state
    useEffect(() => {
        if (isConfirming) {
            setStep('depositing');
        } else if (isWaiting) {
            setStep('waitingDeposit');
        } else if (hasTxSucceeded) {
            setStep('success');
        }
    }, [isConfirming, isWaiting, hasTxSucceeded]);

    const reset = useCallback(() => {
        setStep('idle');
        setError(null);
    }, []);

    return {
        claim,
        step,
        error,
        reset,
        isPending: isConfirming || isWaiting, // Busy state
        isConfirming: isConfirming,
    };
}

