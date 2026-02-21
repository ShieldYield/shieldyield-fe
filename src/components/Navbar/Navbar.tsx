'use client';

import NavbarContent from './NavbarItem';
import { VscHome, VscShield, VscPulse } from 'react-icons/vsc';

const items = [
    { icon: <VscHome size={20} />, label: 'Home', onClick: () => alert('Welcome Home!') },
    { icon: <VscShield size={20} />, label: 'Protocol', onClick: () => alert('Opening Protocol...') },
    { icon: <VscPulse size={20} />, label: 'Activity', onClick: () => alert('Checking Activity...') },
];

export default function Navbar() {
    return (
        <NavbarContent
            items={items}
            panelHeight={72}
            baseItemSize={40}
            magnification={64}
        />
    );
}