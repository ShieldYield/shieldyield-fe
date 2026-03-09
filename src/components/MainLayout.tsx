'use client';

import React from 'react';
import { Sidebar } from './Sidebar';
import MobileHeader from './MobileHeader';
import { Navbar } from './Navbar';
import Header from './Header/Header';

export default function MainLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100 selection:bg-cyan-500/30">
            {/* Sidebar for Desktop */}
            <Sidebar />

            {/* Mobile Header */}
            <MobileHeader />

            {/* Main Content */}
            <main className="flex-1 lg:pl-64 flex flex-col transition-all duration-300 relative">
                {/* Desktop Header */}
                <div className="hidden lg:block sticky top-0 z-50 bg-zinc-950/50 backdrop-blur-md border-b border-zinc-800/50">
                    <Header />
                </div>

                <div className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-8 lg:p-12 pb-32 lg:pb-12">
                    {children}
                </div>
            </main>

            {/* Floating Mobile Nav (Bottom Bar) */}
            <div className="lg:hidden fixed bottom-6 left-0 right-0 z-[100] flex justify-center pointer-events-none">
                <div className="pointer-events-auto">
                    <Navbar />
                </div>
            </div>
        </div>
    );
}
