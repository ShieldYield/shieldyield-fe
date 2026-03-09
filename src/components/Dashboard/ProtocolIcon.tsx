'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface ProtocolIconProps {
  name: string;
  className?: string;
  size?: number;
}

const iconMap: Record<string, string> = {
  Aave: '/logos/aave.svg',
  Compound: '/logos/compound.svg',
  Morpho: '/logos/morpho.svg',
  YieldMax: '🟡', // Keep emoji for YieldMax as no SVG was provided
};

export function ProtocolIcon({ name, className, size = 32 }: ProtocolIconProps) {
  const displayName = name.replace('Adapter', '');
  const iconPath = iconMap[displayName];
  const isImage = iconPath && iconPath.startsWith('/');

  return (
    <div 
      className={cn(
        "flex items-center justify-center rounded-lg bg-zinc-800/50 border border-zinc-700/50 overflow-hidden font-bold text-zinc-400 shrink-0",
        className
      )}
      style={{ width: size, height: size }}
    >
      {isImage ? (
        <div className="relative w-full h-full p-1.5">
          <Image 
            src={iconPath} 
            alt={displayName} 
            fill 
            className="object-contain"
          />
        </div>
      ) : (
        <span>{iconPath || displayName.charAt(0)}</span>
      )}
    </div>
  );
}
