'use client';

import Image from 'next/image';

export default function Header() {
    return (
        <div className="flex items-center justify-between w-full px-4 py-3 md:px-8 md:py-4 transition-all duration-300">
            <div className="relative w-[80px] h-[16px] md:w-[120px] md:h-[24px]">
                <Image
                    src="/next.svg"
                    alt="Next.js Logo"
                    fill
                    className="object-contain"
                    priority
                />
            </div>

            <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 md:px-5 md:py-2 bg-zinc-800 rounded-full shadow-lg hover:scale-105 transition-transform cursor-pointer">
                    <p className="text-[10px] md:text-sm font-mono text-zinc-100 font-medium">
                        0x........
                    </p>
                </div>
            </div>
        </div>
    );
}