'use client';

import React from 'react';
import Image from 'next/image';
import ConnectButton from './Wallet/ConnectButton';
import { useSimMode } from '../context/SimModeContext';

export default function MobileHeader() {
    const { isSimMode, toggleSimMode } = useSimMode();

    return (
        <div className="flex items-center justify-between w-full px-5 py-4 bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-800 z-50 lg:hidden sticky top-0">
            <div className="flex items-center gap-2.5">
                <div className="relative w-6 h-6">
                    <Image
                        src="/logos/shieldyield.png"
                        alt="ShieldYield Logo"
                        fill
                        className="object-contain"
                        priority
                    />
                </div>
                <span className="text-sm font-bold text-zinc-100 ">
                    Shield<span className="text-cyan-400">Yield</span>
                </span>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={toggleSimMode}
                    className={` flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono transition-all duration-200 select-none cursor-pointer ${isSimMode ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'} border-none`}
                >
                    <span>{isSimMode ? 'SIM' : 'LIVE'}</span>
                </button>
                <ConnectButton />
            </div>
        </div>
    );
}
