'use client';

import NavbarContent from './NavbarItem';
import { VscHome, VscShield, VscPulse } from 'react-icons/vsc';
import { useRouter } from 'next/navigation';

export default function Navbar() {
    const router = useRouter();

    const items = [
        { icon: <VscHome size={20} />, label: 'Home', onClick: () => router.push('/') },
        { icon: <VscShield size={20} />, label: 'Protocol', onClick: () => router.push('/protocol') },
        { icon: <VscPulse size={20} />, label: 'Activity', onClick: () => alert('Activity — coming soon!') },
    ];

    return (
        <NavbarContent
            items={items}
            panelHeight={72}
            baseItemSize={40}
            magnification={64}
        />
    );
}