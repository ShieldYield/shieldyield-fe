'use client';

import dynamic from 'next/dynamic';

// Dynamic import with SSR disabled — prevents RainbowKit/wagmi from
// accessing localStorage during server-side rendering
const WalletProvider = dynamic(
    () => import('../components/Wallet/WalletProvider'),
    { ssr: false }
);

export default function Providers({ children }: { children: React.ReactNode }) {
    return <WalletProvider>{children}</WalletProvider>;
}
