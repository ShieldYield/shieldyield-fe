'use client';

import Image from 'next/image';
import ConnectButton from '../Wallet/ConnectButton';
import { useSimMode } from '../../context/SimModeContext';

export default function Header() {
    const { isSimMode, toggleSimMode } = useSimMode();

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

            <div className="flex items-center gap-3">
                {/* Simulation mode toggle */}
                <button
                    onClick={toggleSimMode}
                    title={isSimMode ? 'Simulation mode ON — click to switch to LIVE' : 'Live mode — click to switch to SIMULATION'}
                    className={`
                        flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono
                        border transition-all duration-200 select-none cursor-pointer
                        ${isSimMode
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/40 hover:bg-amber-500/25'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                        }
                    `}
                >
                    <span>{isSimMode ? '⚡' : '●'}</span>
                    <span>{isSimMode ? 'SIM' : 'LIVE'}</span>
                </button>

                <ConnectButton />
            </div>
        </div>
    );
}