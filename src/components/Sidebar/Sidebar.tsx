'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { VscHome, VscShield, VscPulse, VscSettingsGear } from 'react-icons/vsc';
import Image from 'next/image';
import ConnectButton from '../Wallet/ConnectButton';
import { useSimMode } from '../../context/SimModeContext';

export default function Sidebar() {
    const router = useRouter();
    const pathname = usePathname();
    const { isSimMode, toggleSimMode } = useSimMode();

    const navItems = [
        { icon: <VscHome size={22} />, label: 'Home', path: '/' },
        { icon: <VscShield size={22} />, label: 'Protocol', path: '/protocol' },
        { icon: <VscPulse size={22} />, label: 'Activity', path: '#' },
        { icon: <VscSettingsGear size={22} />, label: 'Setting', path: '/setting' },
        { icon: <VscShield size={22} />, label: 'Admin', path: '/admin' },
    ];

    const isActive = (path: string) => pathname === path;

    return (
        <aside className="fixed left-0 top-0 h-full w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col z-[60] hidden lg:flex shadow-2xl">
            {/* Logo */}
            <div className="p-8 flex items-center gap-3">
                <div className="relative w-7 h-7">
                    <Image
                        src="/logos/shieldyield.png"
                        alt="ShieldYield Logo"
                        fill
                        className="object-contain"
                        priority
                    />
                </div>
                <span className="text-lg font-bold text-zinc-100 ">
                    Shield<span className="text-cyan-400 font-bold">Yield</span>
                </span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 space-y-1 mt-4">
                {navItems.map((item) => (
                    <button
                        key={item.label}
                        onClick={() => item.path !== '#' ? router.push(item.path) : alert('Activity — coming soon!')}
                        className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-sm font-bold  transition-all duration-200 group ${isActive(item.path)
                            ? 'bg-[#006aff] text-white shadow-[0_0_15px_rgba(0,106,255,0.2)]'
                            : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50'
                            }`}
                    >
                        <span className={`transition-colors duration-200 ${isActive(item.path) ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                            {item.icon}
                        </span>
                        {item.label}
                        {isActive(item.path) && (
                            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
                        )}
                    </button>
                ))}
            </nav>

            {/* Bottom Section Spacer */}
            <div className="p-6 border-t border-zinc-800/50" />
        </aside>
    );
}
