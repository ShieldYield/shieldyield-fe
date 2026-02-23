'use client';

import Image from 'next/image';
import ConnectButton from '../Wallet/ConnectButton';

export default function Header() {
    return (
        <div className="flex items-center justify-between w-full px-4 py-3 md:px-8 md:py-4 transition-all duration-300">
            <div className="flex items-center gap-3">
                <div className="relative w-[24px] h-[24px] md:w-[28px] md:h-[28px]">
                    <Image
                        src="/next.svg"
                        alt="ShieldYield Logo"
                        fill
                        className="object-contain"
                        priority
                    />
                </div>
                <span className="text-sm md:text-base font-bold text-zinc-100 tracking-tight">
                    Shield<span className="text-cyan-400">Yield</span>
                </span>
            </div>

            <ConnectButton />
        </div>
    );
}