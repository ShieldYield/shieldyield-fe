import { useWriteContract, useReadContract } from "wagmi";

const SHIELD_VAULT = "0xE2b7f9E85ee0390B2c3bC874301CAeB941Fc88eB";

const SHIELD_VAULT_ABI = [
    {
        name: "paused",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "bool" }],
    },
    {
        name: "setPaused",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "_paused", type: "bool" }],
        outputs: [],
    },
] as const;

export function VaultStatusCard() {
    const {
        data: isPaused,
        refetch: refetchPausedStatus,
        isLoading,
    } = useReadContract({
        address: SHIELD_VAULT,
        abi: SHIELD_VAULT_ABI,
        functionName: "paused",
    });

    const { writeContract, isPending, isSuccess, isError, error } =
        useWriteContract({
            mutation: {
                onSuccess: () => {
                    setTimeout(() => refetchPausedStatus(), 3000); // give it time to mine
                },
            },
        });

    const handleTogglePause = () => {
        if (isPaused === undefined) return;

        writeContract({
            address: SHIELD_VAULT,
            abi: SHIELD_VAULT_ABI,
            functionName: "setPaused",
            args: [!isPaused], // toggle current state
        });
    };

    return (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 transition-all duration-300 hover:border-white/20">
            <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${isPaused ? "bg-red-500/10 border-red-500/20" : "bg-green-500/10 border-green-500/20"}`}>
                    {isPaused ? (
                        <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">Vault Status</h3>
                    <p className="text-gray-400 text-sm">
                        Global circuit breaker
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="p-4 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between">
                    <span className="text-gray-400 text-sm font-medium">Current Status</span>
                    {isLoading ? (
                        <span className="text-white/50 animate-pulse text-sm">Loading...</span>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-3 w-3">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isPaused ? "bg-red-400" : "bg-green-400"}`}></span>
                                <span className={`relative inline-flex rounded-full h-3 w-3 ${isPaused ? "bg-red-500" : "bg-green-500"}`}></span>
                            </span>
                            <span className={`font-bold ${isPaused ? "text-red-400" : "text-green-400"}`}>
                                {isPaused ? "PAUSED" : "ACTIVE"}
                            </span>
                        </div>
                    )}
                </div>

                <button
                    onClick={handleTogglePause}
                    disabled={isLoading || isPending || isPaused === undefined}
                    className={`w-full relative overflow-hidden rounded-xl font-medium py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${isPaused ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" : "bg-red-500/20 text-red-400 hover:bg-red-500/30"} border-none`}
                >
                    {isPending
                        ? "Confirming status change..."
                        : isPaused
                            ? "Resume Vault Engine (Unpause)"
                            : "Trigger Circuit Breaker (Pause)"}
                </button>

                {isSuccess && (
                    <div className="text-sm text-center bg-white/5 text-white/70 py-2 rounded-lg">
                        Action submitted to blockchain
                    </div>
                )}
                {isError && (
                    <div className="text-sm text-red-400 mt-2 text-center bg-red-400/10 py-2 px-3 rounded-lg overflow-hidden text-ellipsis whitespace-nowrap" title={error?.message}>
                        Error submitting: {error?.message.slice(0, 50)}...
                    </div>
                )}
            </div>
        </div>
    );
}
