"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useBalance, useAccount } from "wagmi";
import { parseUnits, formatUnits } from "viem";

const SHIELD_BRIDGE = "0x" as const; // TODO: Replace with actual ShieldBridge address
const USDC_ARBITRUM = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Arbitrum USDC

const SHIELD_BRIDGE_ABI = [
    {
        name: "emergencyBridge",
        type: "function",
        stateMutability: "payable",
        inputs: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "destinationChainSelector", type: "uint64" },
        ],
        outputs: [{ name: "messageId", type: "bytes32" }],
    },
    {
        name: "getEmergencyBridgeFee",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "destinationChainSelector", type: "uint64" },
        ],
        outputs: [{ name: "fee", type: "uint256" }],
    },
] as const;

// CCIP Selectors
const NETWORKS = [
    { name: "Base Sepolia", selector: 10344971235874465080n },
    { name: "Ethereum Sepolia", selector: 16015286601757825753n },
    { name: "Optimism Sepolia", selector: 5224473277236331295n },
];

export function EmergencyBridgeCard() {
    const { address } = useAccount();
    const [amount, setAmount] = useState("");
    const [targetChain, setTargetChain] = useState<bigint>(NETWORKS[0].selector);
    const [isConfirming, setIsConfirming] = useState(false);

    // Get Native Balance (ETH) for gas/fees
    const { data: ethBalance } = useBalance({ address });

    // Wagmi hooks for writing to contract
    const { data: hash, isPending, writeContract, error: writeError } = useWriteContract();

    // Wait for transaction
    const { isLoading: isWaiting, isSuccess } = useWaitForTransactionReceipt({ hash });

    const handleExecute = () => {
        setIsConfirming(true);
    };

    const confirmExecute = () => {
        if (!amount || isNaN(Number(amount))) return;

        try {
            // Note: In a real scenario, we'd need to fetch getEmergencyBridgeFee first to pass as `value`
            // For now, we attempt with a hardcoded buffer or rely on wallet estimation
            const parsedAmount = parseUnits(amount, 6); // USDC has 6 decimals

            writeContract({
                address: SHIELD_BRIDGE,
                abi: SHIELD_BRIDGE_ABI,
                functionName: "emergencyBridge",
                args: [USDC_ARBITRUM, parsedAmount, targetChain],
                value: parseUnits("0.02", 18), // Estimated buffer for CCIP fee in native eth
            });
            setIsConfirming(false);
        } catch (err) {
            console.error("Failed to parse amount or send tx:", err);
            setIsConfirming(false);
        }
    };

    const cancelExecute = () => {
        setIsConfirming(false);
    };

    return (
        <div className="bg-zinc-900/40 border border-red-500/20 backdrop-blur-md rounded-2xl p-6 relative overflow-hidden group hover:border-red-500/40 transition-colors">
            {/* Background warning glow */}
            <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-red-600/0 via-red-500 to-red-600/0 opacity-50" />
            <div className="absolute -inset-24 bg-red-500/5 blur-3xl rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-red-500/10 rounded-lg text-red-400">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-zinc-100">Emergency CCIP Bridge</h2>
                        <p className="text-sm font-medium text-red-400/80">Cross-Chain Evacuation</p>
                    </div>
                </div>

                <p className="text-sm text-zinc-400 mb-6 font-light leading-relaxed">
                    Evacuate funds to another blockchain network using Chainlink CCIP.
                    <span className="text-red-400 block mt-1">Requires Native ETH for cross-chain fees.</span>
                </p>

                <div className="space-y-4">
                    {/* Network Selection */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Target Network</label>
                        <select
                            value={targetChain.toString()}
                            onChange={(e) => setTargetChain(BigInt(e.target.value))}
                            className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 outline-none focus:border-red-500/50 transition-colors appearance-none"
                        >
                            {NETWORKS.map((net) => (
                                <option key={net.selector.toString()} value={net.selector.toString()}>
                                    {net.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">USDC Amount</label>
                        <div className="relative">
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="e.g. 10000"
                                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 outline-none focus:border-red-500/50 transition-colors"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500 px-2 py-1 bg-zinc-800/50 rounded-md">
                                USDC
                            </div>
                        </div>
                    </div>

                    {/* Status area */}
                    {ethBalance && (
                        <div className="text-xs text-zinc-500 flex justify-between px-1">
                            <span>Balance: </span>
                            <span className={Number(formatUnits(ethBalance.value, 18)) < 0.01 ? "text-orange-400" : "text-emerald-400"}>
                                {Number(formatUnits(ethBalance.value, 18)).toFixed(4)} ETH
                            </span>
                        </div>
                    )}

                    {writeError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title={writeError.message}>
                            ⚠️ {writeError.message.split('\n')[0]}
                        </div>
                    )}

                    {isSuccess && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 font-medium text-center">
                            ✅ Bridge Initiated Successfully
                            <a
                                href={`https://ccip.chain.link/msg/${hash}`} // Note: hash represents tx, not messageId yet, but gives user a link base
                                target="_blank"
                                rel="noreferrer"
                                className="block mt-1 underline decoration-emerald-500/30 hover:text-emerald-300"
                            >
                                Track on CCIP Explorer
                            </a>
                        </div>
                    )}

                    {/* Action Button */}
                    {!isConfirming ? (
                        <button
                            onClick={handleExecute}
                            disabled={isPending || isWaiting || !amount}
                            className="w-full mt-2 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-500 font-medium py-3 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed group-hover:border-red-500/50"
                        >
                            {isPending || isWaiting ? "Initiating Escape..." : "Trigger Escape"}
                        </button>
                    ) : (
                        <div className="mt-2 p-4 bg-red-950/50 border border-red-500/30 rounded-xl">
                            <p className="text-xs text-red-400 mb-3 font-medium text-center">⚠️ DANGER: FUNDS WILL LEAVE NETWORK</p>
                            <div className="flex gap-2">
                                <button
                                    onClick={cancelExecute}
                                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-2 rounded-lg transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmExecute}
                                    className="flex-1 bg-red-600 hover:bg-red-500 text-white font-medium py-2 rounded-lg transition-colors text-sm shadow-[0_0_15px_rgba(220,38,38,0.5)]"
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
