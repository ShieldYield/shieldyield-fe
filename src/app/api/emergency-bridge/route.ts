import { NextRequest, NextResponse } from "next/server";
import {
    createWalletClient,
    createPublicClient,
    http,
    parseUnits,
    formatUnits,
    encodeFunctionData,
    type Address,
    type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

// ============================================================================
// Contract Addresses (Arbitrum Sepolia)
// ============================================================================

const SHIELD_BRIDGE = "0xa66A087dFb94a198c793B65E66C412F063C15476" as const;
const USDC_ADDRESS = "0xA8C0c11bf64AF62CDCA6f93D3769B88BdD7cb93D" as const;

// ============================================================================
// ABI (Minimal — only what we need)
// ============================================================================

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

// Supported destination chains (CCIP selectors)
const SUPPORTED_CHAINS: Record<string, bigint> = {
    base_sepolia: 10344971235874465080n,
    ethereum_sepolia: 16015286601757825753n,
    optimism_sepolia: 5224473277236331295n,
};

// ============================================================================
// Security: Simple API Key authentication
// ============================================================================

function validateRequest(req: NextRequest): boolean {
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = process.env.EMERGENCY_BRIDGE_API_KEY;

    // If no API key is configured, deny all requests
    if (!expectedKey) {
        console.error("[emergency-bridge] EMERGENCY_BRIDGE_API_KEY not set in .env");
        return false;
    }

    return apiKey === expectedKey;
}

// ============================================================================
// POST /api/emergency-bridge
// ============================================================================

export async function POST(req: NextRequest) {
    console.log("=".repeat(60));
    console.log("🚨 EMERGENCY BRIDGE RELAY — Request Received");
    console.log("=".repeat(60));

    // 1. Authenticate
    if (!validateRequest(req)) {
        return NextResponse.json(
            { error: "Unauthorized. Invalid or missing API key." },
            { status: 401 }
        );
    }

    // 2. Parse request body
    let body: {
        amount: string; // USDC amount (human-readable, e.g. "10000")
        destinationChain: string; // e.g. "base_sepolia"
        reason?: string;
    };

    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 }
        );
    }

    const { amount, destinationChain, reason } = body;

    // 3. Validate inputs
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return NextResponse.json(
            { error: "Invalid or missing 'amount'. Must be a positive number in USDC." },
            { status: 400 }
        );
    }

    const chainSelector = SUPPORTED_CHAINS[destinationChain];
    if (!chainSelector) {
        return NextResponse.json(
            {
                error: `Unsupported destination chain '${destinationChain}'. Supported: ${Object.keys(SUPPORTED_CHAINS).join(", ")}`,
            },
            { status: 400 }
        );
    }

    // 4. Validate environment — relayer private key
    const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerPrivateKey) {
        console.error("[emergency-bridge] RELAYER_PRIVATE_KEY not set in .env");
        return NextResponse.json(
            { error: "Relayer not configured. Contact admin." },
            { status: 500 }
        );
    }

    const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";

    try {
        // 5. Create viem clients
        const account = privateKeyToAccount(relayerPrivateKey as Hex);
        const publicClient = createPublicClient({
            chain: arbitrumSepolia,
            transport: http(rpcUrl),
        });
        const walletClient = createWalletClient({
            account,
            chain: arbitrumSepolia,
            transport: http(rpcUrl),
        });

        const parsedAmount = parseUnits(amount, 6); // USDC = 6 decimals

        console.log(`[emergency-bridge] Relayer wallet: ${account.address}`);
        console.log(`[emergency-bridge] Bridging ${amount} USDC to ${destinationChain}`);
        console.log(`[emergency-bridge] Reason: ${reason || "AI-triggered emergency"}`);

        // 6. Get fee estimate from ShieldBridge
        let estimatedFee: bigint;
        try {
            estimatedFee = await publicClient.readContract({
                address: SHIELD_BRIDGE,
                abi: SHIELD_BRIDGE_ABI,
                functionName: "getEmergencyBridgeFee",
                args: [USDC_ADDRESS, parsedAmount, chainSelector],
            });
            console.log(`[emergency-bridge] Estimated CCIP fee: ${formatUnits(estimatedFee, 18)} ETH`);
        } catch (feeErr) {
            console.warn(`[emergency-bridge] Could not estimate fee, using fallback: ${feeErr}`);
            estimatedFee = parseUnits("0.02", 18); // Fallback: 0.02 ETH buffer
        }

        // Add 20% buffer on top of the estimated fee
        const feeWithBuffer = (estimatedFee * 120n) / 100n;

        // 7. Check relayer ETH balance
        const relayerBalance = await publicClient.getBalance({ address: account.address });
        if (relayerBalance < feeWithBuffer) {
            const needed = formatUnits(feeWithBuffer, 18);
            const available = formatUnits(relayerBalance, 18);
            console.error(`[emergency-bridge] Insufficient relayer ETH. Need ${needed}, have ${available}`);
            return NextResponse.json(
                {
                    error: "Relayer has insufficient ETH for CCIP fees.",
                    needed: `${needed} ETH`,
                    available: `${available} ETH`,
                },
                { status: 503 }
            );
        }

        // 8. Execute emergencyBridge via the relayer wallet
        const txHash = await walletClient.writeContract({
            address: SHIELD_BRIDGE,
            abi: SHIELD_BRIDGE_ABI,
            functionName: "emergencyBridge",
            args: [USDC_ADDRESS, parsedAmount, chainSelector],
            value: feeWithBuffer,
        });

        console.log(`[emergency-bridge] ✅ Transaction submitted: ${txHash}`);

        // 9. Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
        });

        console.log(`[emergency-bridge] ✅ Confirmed in block ${receipt.blockNumber}`);

        return NextResponse.json({
            success: true,
            txHash,
            blockNumber: Number(receipt.blockNumber),
            amount,
            destinationChain,
            feeUsed: formatUnits(feeWithBuffer, 18) + " ETH",
            reason: reason || "AI-triggered emergency",
            ccipExplorerUrl: `https://ccip.chain.link/tx/${txHash}`,
        });
    } catch (err: any) {
        console.error(`[emergency-bridge] ❌ Bridge execution failed:`, err);
        return NextResponse.json(
            {
                error: "Bridge execution failed",
                details: err?.message || String(err),
            },
            { status: 500 }
        );
    }
}

// ============================================================================
// GET /api/emergency-bridge — Health check & relayer status
// ============================================================================

export async function GET() {
    const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;

    if (!relayerPrivateKey) {
        return NextResponse.json({
            status: "not_configured",
            message: "RELAYER_PRIVATE_KEY is not set. Proxy relay is disabled.",
        });
    }

    try {
        const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
        const account = privateKeyToAccount(relayerPrivateKey as Hex);
        const publicClient = createPublicClient({
            chain: arbitrumSepolia,
            transport: http(rpcUrl),
        });

        const balance = await publicClient.getBalance({ address: account.address });

        return NextResponse.json({
            status: "ready",
            relayerAddress: account.address,
            ethBalance: formatUnits(balance, 18) + " ETH",
            supportedChains: Object.keys(SUPPORTED_CHAINS),
            shieldBridge: SHIELD_BRIDGE,
        });
    } catch (err: any) {
        return NextResponse.json({
            status: "error",
            message: err?.message || String(err),
        });
    }
}
