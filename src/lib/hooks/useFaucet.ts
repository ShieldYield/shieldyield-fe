'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount, usePublicClient } from 'wagmi';
import { MOCK_USDC_ADDRESS, BASE_USDC_ADDRESS } from '../contracts';
import { baseSepolia } from 'viem/chains';

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
    const { address: userAddress, chainId } = useAccount();
    const [step, setStep] = useState<FaucetStep>('idle');
    const [error, setError] = useState<string | null>(null);
    const publicClient = usePublicClient();

    // Dynamic token address based on chain
    const tokenAddress = chainId === baseSepolia.id ? BASE_USDC_ADDRESS : MOCK_USDC_ADDRESS;

    const {
        writeContractAsync,
        error: txError,
        isPending: isConfirming
    } = useWriteContract();

    const claim = useCallback(async () => {
        try {
            setError(null);
            setStep('depositing');
            if (!userAddress || !publicClient) throw new Error("Wallet not connected");

            console.log("🚀 Starting Multi-Mint (10 USDC)...");
            
            // Get current nonce to send transactions in order
            let currentNonce = await publicClient.getTransactionCount({ 
                address: userAddress, 
                blockTag: 'pending' 
            });

            // Loop 10 times to get 10 USDC (since each drip = 1 USDC)
            const txs = [];
            for (let i = 0; i < 10; i++) {
                console.log(`Submitting drip ${i+1}/10...`);
                const hash = await writeContractAsync({
                    address: tokenAddress,
                    abi: MOCK_TOKEN_ABI,
                    functionName: 'drip',
                    args: [userAddress], 
                    nonce: currentNonce++,
                    maxFeePerGas: BigInt(500000000), // 0.5 gwei
                });
                txs.push(hash);
            }

            setStep('waitingDeposit');
            
            // Wait for all transactions to complete
            await Promise.all(txs.map(hash => publicClient.waitForTransactionReceipt({ hash })));
            
            setStep('success');
            console.log("✅ All 10 USDC minted successfully!");
        } catch (err: any) {
            console.error('Faucet multi-mint error:', err);
            setError(err?.shortMessage || err?.message || 'Failed to submit transactions');
            setStep('error');
        }
    }, [writeContractAsync, userAddress, tokenAddress, publicClient]);

    const reset = useCallback(() => {
        setStep('idle');
        setError(null);
    }, []);

    return {
        claim,
        step,
        error,
        reset,
        isPending: step === 'depositing' || step === 'waitingDeposit',
        isConfirming: isConfirming,
    };
}
