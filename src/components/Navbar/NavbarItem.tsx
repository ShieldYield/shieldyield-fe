'use client';

import React, { Children, cloneElement, useRef, useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NavbarItemData = {
    icon: React.ReactNode;
    label: React.ReactNode;
    onClick: () => void;
    className?: string;
};

export type NavbarProps = {
    items: NavbarItemData[];
    className?: string;
    distance?: number;
    panelHeight?: number;
    baseItemSize?: number;
    magnification?: number;
};

type NavbarItemProps = {
    className?: string;
    children: React.ReactNode;
    onClick?: () => void;
    mouseX: number | null;
    distance: number;
    baseItemSize: number;
    magnification: number;
};

type NavbarLabelProps = {
    className?: string;
    children: React.ReactNode;
    isHovered?: boolean;
};

type NavbarIconProps = {
    className?: string;
    children: React.ReactNode;
    isHovered?: boolean;
};

// ─── NavbarItem ───────────────────────────────────────────────────────────────

function NavbarItem({
    children,
    className = '',
    onClick,
    mouseX,
    distance,
    magnification,
    baseItemSize,
}: NavbarItemProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);

    const size = (() => {
        if (mouseX === null || ref.current === null) return baseItemSize;
        const rect = ref.current.getBoundingClientRect();
        const itemCenter = rect.left + rect.width / 2;
        const dist = Math.abs(mouseX - itemCenter);
        if (dist >= distance) return baseItemSize;
        const ratio = 1 - dist / distance;
        return baseItemSize + (magnification - baseItemSize) * ratio;
    })();

    return (
        <div
            ref={ref}
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onFocus={() => setIsHovered(true)}
            onBlur={() => setIsHovered(false)}
            tabIndex={0}
            role="button"
            aria-haspopup="true"
            className={`relative inline-flex items-center justify-center rounded-full border-2 border-zinc-700 bg-zinc-900 shadow-md cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${className}`}
            style={{
                width: size,
                height: size,
                transition: 'width 120ms ease, height 120ms ease',
                flexShrink: 0,
            }}
        >
            {Children.map(children, (child) =>
                React.isValidElement(child)
                    ? cloneElement(child as React.ReactElement<{ isHovered?: boolean }>, { isHovered })
                    : child
            )}
        </div>
    );
}

// ─── NavbarLabel ─────────────────────────────────────────────────────────────

function NavbarLabel({ children, className = '', isHovered }: NavbarLabelProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (isHovered) {
            setVisible(true);
        } else {
            const t = setTimeout(() => setVisible(false), 150);
            return () => clearTimeout(t);
        }
    }, [isHovered]);

    return (
        <div
            role="tooltip"
            aria-hidden={!visible}
            className={`
                ${className}
                absolute -top-8 left-1/2 -translate-x-1/2
                w-fit whitespace-pre rounded-lg
                border border-zinc-700 bg-zinc-900
                px-2.5 py-1 text-xs font-medium text-zinc-100
                pointer-events-none
                transition-all duration-150
                ${visible ? 'opacity-100 -translate-y-1' : 'opacity-0 translate-y-0'}
            `}
        >
            {children}
        </div>
    );
}

// ─── NavbarIcon ───────────────────────────────────────────────────────────────

function NavbarIcon({ children, className = '' }: NavbarIconProps) {
    return (
        <div className={`flex items-center justify-center text-zinc-300 ${className}`}>
            {children}
        </div>
    );
}

// ─── NavbarContent (default export) ──────────────────────────────────────────

export default function NavbarContent({
    items,
    className = '',
    magnification = 70,
    distance = 140,
    panelHeight = 64,
    baseItemSize = 50,
}: NavbarProps) {
    const [mouseX, setMouseX] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        setMouseX(e.clientX);
    }, []);

    const handleMouseLeave = useCallback(() => {
        setMouseX(null);
    }, []);

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className={`
                ${className}
                flex items-center gap-3
                rounded-2xl
                border-2 border-zinc-700/60
                bg-zinc-800
                px-4 shadow-2xl
                ring-1 ring-inset ring-white/5
            `}
            style={{ height: panelHeight }}
            role="toolbar"
            aria-label="Application navbar"
        >
            {items.map((item, index) => (
                <NavbarItem
                    key={index}
                    onClick={item.onClick}
                    className={item.className}
                    mouseX={mouseX}
                    distance={distance}
                    magnification={magnification}
                    baseItemSize={baseItemSize}
                >
                    <NavbarIcon>{item.icon}</NavbarIcon>
                    <NavbarLabel>{item.label}</NavbarLabel>
                </NavbarItem>
            ))}
        </div>
    );
}