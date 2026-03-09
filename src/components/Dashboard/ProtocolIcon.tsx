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
  Aave: '🔵',
  Compound: '🟢',
  Morpho: '🟣',
  YieldMax: '🟡',
};

// This component can be easily updated by the user to use real images
// just by adding image paths to the iconMap or replacing the logic here.
export function ProtocolIcon({ name, className, size = 32 }: ProtocolIconProps) {
  const displayName = name.replace('Adapter', '');
  const icon = iconMap[displayName];

  // If the user wants to use images, they can do:
  // const imagePath = `/logos/${displayName.toLowerCase()}.png`;
  // return <Image src={imagePath} alt={name} width={size} height={size} className={className} />;

  return (
    <div 
      className={cn(
        "flex items-center justify-center rounded-lg bg-zinc-800/50 border border-zinc-700/50 overflow-hidden font-bold text-zinc-400",
        className
      )}
      style={{ width: size, height: size }}
    >
      {icon || displayName.charAt(0)}
    </div>
  );
}
