"use client";

import { useAccount } from "wagmi";
import { useReadContract } from "wagmi";
import { SetSafeHavenCard } from "@/components/Admin/SetSafeHavenCard";
import { VaultStatusCard } from "@/components/Admin/VaultStatusCard";
import { RemovePoolCard } from "@/components/Admin/RemovePoolCard";
import { EmergencyBridgeCard } from "@/components/Admin/EmergencyBridgeCard";

const SHIELD_VAULT = "0xE2b7f9E85ee0390B2c3bC874301CAeB941Fc88eB";

const SHIELD_VAULT_ABI = [
    {
        name: "owner",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
    },
] as const;

export default function AdminPage() {
    const { address, isConnected } = useAccount();

    // Check if current user is owner
    const { data: ownerAddress, isLoading: isOwnerLoading } = useReadContract({
        address: SHIELD_VAULT,
        abi: SHIELD_VAULT_ABI,
        functionName: "owner",
    });

    const isOwner = isConnected && address && ownerAddress && address.toLowerCase() === ownerAddress.toLowerCase();

    return (
        <main className="min-h-screen pt-24 pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-12">
            {/* Header Section */}
            <section className="space-y-4">
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-600">
                    Admin Dashboard
                </h1>
                <p className="text-lg text-gray-400 max-w-2xl">
                    Protocol configuration and emergency controls. Actions performed here require the &apos;Owner&apos; wallet.
                </p>

                {isOwnerLoading ? (
                    <div className="max-w-md w-full h-[52px] bg-white/5 rounded-xl border border-white/10 animate-pulse"></div>
                ) : !isConnected ? (
                    <div className="max-w-md p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center gap-3">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        <span className="text-sm">Please connect your wallet to access admin controls.</span>
                    </div>
                ) : !isOwner ? (
                    <div className="max-w-md p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        <div>
                            <p className="text-sm font-bold">Access Denied</p>
                            <p className="text-xs opacity-80 mt-1">Connected wallet is not the owner of ShieldVault.</p>
                        </div>
                    </div>
                ) : (
                    <div className="max-w-md p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 flex items-center gap-3">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span className="text-sm font-medium">Owner authenticated. Controls unlocked.</span>
                    </div>
                )}
            </section>

            {/* Control Cards */}
            <section className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-all duration-500 ${!isOwner ? 'opacity-50 pointer-events-none filter grayscale-[50%]' : ''}`}>
                <VaultStatusCard />
                <SetSafeHavenCard />
                <RemovePoolCard />
                <EmergencyBridgeCard />
            </section>
        </main>
    );
}
