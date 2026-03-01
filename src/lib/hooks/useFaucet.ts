'use client';

import { useState, useCallback, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { FAUCET_ADDRESS, FAUCET_ABI } from '../contracts';

type ClaimStep = 'idle' | 'claiming' | 'waitingClaim' | 'success' | 'error';

export function useFaucet() {
    const [step, setStep] = useState<ClaimStep>('idle');
    const [error, setError] = useState<string | null>(null);

    const {
        writeContract: writeClaim,
        data: claimHash,
        isPending,
        error: claimError,
        reset: resetWrite,
    } = useWriteContract();

    const {
        isLoading: isConfirming,
        isSuccess: isConfirmed,
    } = useWaitForTransactionReceipt({ hash: claimHash });

    // Track pending -> confirming
    useEffect(() => {
        if (claimHash && step === 'claiming') {
            setStep('waitingClaim');
        }
    }, [claimHash, step]);

    // Track confirmed
    useEffect(() => {
        if (isConfirmed && step === 'waitingClaim') {
            setStep('success');
        }
    }, [isConfirmed, step]);

    // Track errors
    useEffect(() => {
        if (claimError) {
            setError(claimError.message?.split('\n')[0] || 'Claim failed');
            setStep('error');
        }
    }, [claimError]);

    const claim = useCallback(() => {
        setError(null);
        setStep('claiming');

        writeClaim({
            address: FAUCET_ADDRESS,
            abi: FAUCET_ABI,
            functionName: 'claim',
            args: [],
        });
    }, [writeClaim]);

    const reset = useCallback(() => {
        setStep('idle');
        setError(null);
        resetWrite();
    }, [resetWrite]);

    return {
        claim,
        step,
        error,
        reset,
        isPending,
        isConfirming,
    };
}
