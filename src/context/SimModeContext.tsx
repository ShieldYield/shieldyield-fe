'use client';

/**
 * SimModeContext.tsx
 * ─────────────────────────────────────────────────────────────
 * Global context untuk simulation mode toggle.
 *
 * Saat sim mode ON:
 *   - Cookie sy-sim-mode=1 di-set → Next.js API routes baca cookie ini
 *     dan mengembalikan mock data (bukan memanggil external APIs)
 *   - localStorage menyimpan state agar persist setelah page refresh
 *
 * Dipakai oleh:
 *   - Header: toggle button + visual badge "⚡ SIM" / "● LIVE"
 *   - API routes: cek request.cookies.get("sy-sim-mode")?.value === "1"
 * ─────────────────────────────────────────────────────────────
 */

import {
    createContext,
    useContext,
    useState,
    useEffect,
    type ReactNode,
} from 'react';

const STORAGE_KEY = 'shieldyield-sim-mode';
const COOKIE_NAME = 'sy-sim-mode';

interface SimModeContextType {
    isSimMode: boolean;
    toggleSimMode: () => void;
}

const SimModeContext = createContext<SimModeContextType>({
    isSimMode:    false,
    toggleSimMode: () => {},
});

export function SimModeProvider({ children }: { children: ReactNode }) {
    const [isSimMode, setIsSimMode] = useState(false);

    // Restore state from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'true') {
            setIsSimMode(true);
            document.cookie = `${COOKIE_NAME}=1; path=/; SameSite=Lax`;
        }
    }, []);

    const toggleSimMode = () => {
        const next = !isSimMode;
        setIsSimMode(next);
        localStorage.setItem(STORAGE_KEY, String(next));

        if (next) {
            // Set cookie — Next.js API routes (server-side) akan membacanya
            document.cookie = `${COOKIE_NAME}=1; path=/; SameSite=Lax`;
        } else {
            // Hapus cookie
            document.cookie = `${COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }

        // Reload page so all API fetches restart with updated cookie
        setTimeout(() => window.location.reload(), 100);
    };

    return (
        <SimModeContext.Provider value={{ isSimMode, toggleSimMode }}>
            {children}
        </SimModeContext.Provider>
    );
}

export function useSimMode(): SimModeContextType {
    return useContext(SimModeContext);
}
