'use client';

import { useCallback } from 'react';

/**
 * useFaucet — opens the Chainlink faucet in a new tab.
 * BnM tokens are claimed directly from faucets.chain.link,
 * not from a custom on-chain Faucet contract.
 */
export function useFaucet() {
    const claim = useCallback(() => {
        window.open('https://faucets.chain.link/arbitrum-sepolia', '_blank');
    }, []);

    return {
        claim,
        step: 'idle' as const,
        error: null,
        reset: () => {},
        isPending: false,
        isConfirming: false,
    };
}
