// ============================================================================
// Contract Addresses (Arbitrum Sepolia)
// ============================================================================

export const SHIELD_VAULT_ADDRESS = '0xcFBd47c63D284A8F824e586596Df4d5c57326c8B' as const;
export const MOCK_USDC_ADDRESS = '0x4d107C58DCda55ea6ea2B162d9C434F710E42038' as const;
export const FAUCET_ADDRESS = '0x6E860FF2C4ea6b01815D74E54859Cdd9DD172256' as const;

// ============================================================================
// ShieldVault ABI (subset for frontend interactions)
// ============================================================================

export const SHIELD_VAULT_ABI = [
    // -- Write Functions --
    {
        name: 'deposit',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'amount', type: 'uint256' }],
        outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
        name: 'withdraw',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'shares', type: 'uint256' }],
        outputs: [{ name: 'amount', type: 'uint256' }],
    },
    // -- View Functions --
    {
        name: 'getUserBalance',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [{ name: 'balance', type: 'uint256' }],
    },
    {
        name: 'getUserPosition',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [
            {
                name: '',
                type: 'tuple',
                components: [
                    { name: 'totalDeposited', type: 'uint256' },
                    { name: 'totalShares', type: 'uint256' },
                    { name: 'lastDepositTime', type: 'uint256' },
                ],
            },
        ],
    },
    {
        name: 'previewDeposit',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'amount', type: 'uint256' }],
        outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
        name: 'previewWithdraw',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'shares', type: 'uint256' }],
        outputs: [{ name: 'amount', type: 'uint256' }],
    },
    {
        name: 'getTotalAssets',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: 'total', type: 'uint256' }],
    },
    {
        name: 'getActivePoolCount',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: 'count', type: 'uint256' }],
    },
] as const;

// ============================================================================
// ERC-20 ABI (subset for USDC approve / allowance / balanceOf)
// ============================================================================

export const ERC20_ABI = [
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
    },
] as const;

// ============================================================================
// Faucet ABI
// ============================================================================

export const FAUCET_ABI = [
    {
        name: 'claim',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [],
        outputs: [],
    },
] as const;

// ============================================================================
// Constants
// ============================================================================

export const USDC_DECIMALS = 6;
export const MIN_DEPOSIT_USDC = 1; // 1 USDC minimum
