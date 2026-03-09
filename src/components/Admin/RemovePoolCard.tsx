import { useState } from "react";
import { useWriteContract, useReadContract } from "wagmi";
import { isAddress } from "viem";

const SHIELD_VAULT = "0xE2b7f9E85ee0390B2c3bC874301CAeB941Fc88eB";

const SHIELD_VAULT_ABI = [
    {
        name: "getPoolAllocations",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [
            {
                name: "",
                type: "tuple[]",
                components: [
                    { name: "adapter", type: "address" },
                    { name: "tier", type: "uint8" },
                    { name: "targetWeight", type: "uint256" },
                    { name: "currentAmount", type: "uint256" },
                    { name: "isActive", type: "bool" },
                ],
            },
        ],
    },
    {
        name: "removePool",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "adapter", type: "address" }],
        outputs: [],
    },
] as const;

export function RemovePoolCard() {
    const [selectedAdapter, setSelectedAdapter] = useState("");

    const {
        data: pools,
        refetch: refetchPools,
        isLoading: isLoadingPools,
    } = useReadContract({
        address: SHIELD_VAULT,
        abi: SHIELD_VAULT_ABI,
        functionName: "getPoolAllocations",
    });

    const { writeContract, isPending, isSuccess, isError, error } =
        useWriteContract({
            mutation: {
                onSuccess: () => {
                    setSelectedAdapter("");
                    setTimeout(() => refetchPools(), 3000); // give it time to mine
                },
            },
        });

    const handleRemovePool = () => {
        if (!isAddress(selectedAdapter)) return;

        // Additional confirmation for destructive action
        if (!window.confirm("Are you sure you want to PERMANENTLY remove this pool and withdraw all its assets?")) return;

        writeContract({
            address: SHIELD_VAULT,
            abi: SHIELD_VAULT_ABI,
            functionName: "removePool",
            args: [selectedAdapter],
        });
    };

    const activePools = pools?.filter((p) => p.isActive) || [];

    return (
        <div className="bg-red-500/5 backdrop-blur-xl border border-red-500/20 rounded-2xl p-6 transition-all duration-300 hover:border-red-500/40">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
                    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-xl font-bold text-red-400">Remove Pool (Danger Zone)</h3>
                    <p className="text-gray-400 text-sm">
                        Permanently deactivate adapter
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="p-3 rounded-xl bg-red-900/20 border border-red-500/10 text-sm text-red-200/80">
                    <p>
                        <strong>Warning:</strong> This action will call <code className="bg-black/40 px-1 rounded text-red-300">emergencyWithdraw()</code> on the adapter, moving all funds back to the vault, and mark the pool as inactive. It cannot be easily reversed.
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                        Select Active Pool to Remove
                    </label>
                    {isLoadingPools ? (
                        <div className="w-full h-[46px] bg-black/30 rounded-xl animate-pulse border border-white/5"></div>
                    ) : activePools.length === 0 ? (
                        <div className="p-3 rounded-xl bg-black/30 text-white/50 text-sm text-center border border-white/5">
                            No active pools found in ShieldVault
                        </div>
                    ) : (
                        <select
                            title="Select Adapter"
                            value={selectedAdapter}
                            onChange={(e) => setSelectedAdapter(e.target.value)}
                            className="w-full bg-black/50 border border-red-500/20 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 cursor-pointer font-mono text-sm"
                        >
                            <option value="" disabled className="bg-slate-900 text-gray-400">
                                -- Select Adapter Address --
                            </option>
                            {activePools.map((pool, idx) => (
                                <option key={idx} value={pool.adapter} className="bg-slate-900">
                                    {pool.adapter} (Weight: {Number(pool.targetWeight) / 100}%)
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                <button
                    onClick={handleRemovePool}
                    disabled={!isAddress(selectedAdapter) || isPending}
                    className="w-full relative group overflow-hidden rounded-xl bg-red-600/80 text-white font-medium py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-red-600 border-none"
                >
                    {isPending ? "Confirming in Wallet..." : "Permanently Remove Pool"}
                </button>

                {isSuccess && (
                    <div className="text-sm text-center bg-white/5 text-white/70 py-2 rounded-lg">
                        Action submitted to blockchain
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
