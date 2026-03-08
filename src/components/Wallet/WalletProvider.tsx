'use client';

import { useState, useEffect } from 'react';
import { WagmiProvider, http } from 'wagmi';
import { arbitrumSepolia, baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

const config = getDefaultConfig({
    appName: 'ShieldYield',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo',
    chains: [arbitrumSepolia, baseSepolia],
    transports: {
        [arbitrumSepolia.id]: http(
            process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC ||
            'https://sepolia-rollup.arbitrum.io/rpc'
        ),
        [baseSepolia.id]: http('https://sepolia.base.org'),
    },
    ssr: true,
});

const queryClient = new QueryClient();

export default function WalletProvider({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider
                    theme={darkTheme({
                        accentColor: '#06b6d4',
                        accentColorForeground: 'white',
                        borderRadius: 'medium',
                    })}
                >
                    {mounted ? children : null}
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
