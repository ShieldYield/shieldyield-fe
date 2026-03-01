import { useState } from "react";
import { useWriteContract, useReadContract } from "wagmi";
import { isAddress } from "viem";

const SHIELD_VAULT = "0xcFBd47c63D284A8F824e586596Df4d5c57326c8B";

// ABI for ShieldVault Admin functions
const SHIELD_VAULT_ABI = [
    {
        name: "safeHaven",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
    },
    {
        name: "setSafeHaven",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "_safeHaven", type: "address" }],
        outputs: [],
    },
] as const;

export function SetSafeHavenCard() {
    const [adapterAddress, setAdapterAddress] = useState("");

    const {
        data: currentSafeHaven,
        refetch: refetchSafeHaven,
        isLoading: isLoadingSafeHaven,
    } = useReadContract({
        address: SHIELD_VAULT,
        abi: SHIELD_VAULT_ABI,
        functionName: "safeHaven",
    });

    const { writeContract, isPending, isSuccess, isError, error } =
        useWriteContract({
            mutation: {
                onSuccess: () => {
                    setAdapterAddress("");
                    setTimeout(() => refetchSafeHaven(), 3000); // give it time to mine
                },
            },
        });

    const handleSetSafeHaven = () => {
        if (!isAddress(adapterAddress)) return;

        writeContract({
            address: SHIELD_VAULT,
            abi: SHIELD_VAULT_ABI,
            functionName: "setSafeHaven",
            args: [adapterAddress],
        });
    };

    return (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 transition-all duration-300 hover:border-white/20">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                    <svg
                        className="w-5 h-5 text-blue-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                        />
                    </svg>
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">Safe Haven Adapter</h3>
                    <p className="text-gray-400 text-sm">
                        Set the emergency fallback pool
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex flex-col gap-1 text-sm">
                    <span className="text-gray-400">Current Safe Haven:</span>
                    {isLoadingSafeHaven ? (
                        <span className="text-white/50 animate-pulse">Loading...</span>
                    ) : (
                        <span className="text-blue-400 font-mono break-all">
                            {currentSafeHaven === "0x0000000000000000000000000000000000000000"
                                ? "Not Set (None)"
                                : currentSafeHaven}
                        </span>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                        New Adapter Address
                    </label>
                    <input
                        type="text"
                        value={adapterAddress}
                        onChange={(e) => setAdapterAddress(e.target.value)}
                        placeholder="0x..."
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono text-sm"
                    />
                </div>

                <button
                    onClick={handleSetSafeHaven}
                    disabled={!isAddress(adapterAddress) || isPending}
                    className="w-full relative group overflow-hidden rounded-xl bg-blue-500 text-white font-medium py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-blue-600"
                >
                    <div className="relative z-10 flex items-center justify-center gap-2">
                        {isPending ? "Confirming in Wallet..." : "Set Safe Haven"}
                    </div>
                </button>

                {isSuccess && (
                    <div className="text-sm text-green-400 mt-2 text-center bg-green-400/10 py-2 rounded-lg">
                        Transaction submitted!
                    </div>
                )}
                {isError && (
                    <div className="text-sm text-red-400 mt-2 text-center bg-red-400/10 py-2 px-3 rounded-lg overflow-hidden text-ellipsis whitespace-nowrap" title={error?.message}>
                        Error: {error?.message.slice(0, 50)}...
                    </div>
                )}
            </div>
        </div>
    );
}
