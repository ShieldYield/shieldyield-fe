// ============================================================================
// Contract Addresses
// ============================================================================

export const SHIELD_VAULT_ADDRESS = '0xE2b7f9E85ee0390B2c3bC874301CAeB941Fc88eB' as const;
export const BASE_SHIELD_VAULT_ADDRESS = '0x2EDEe329359aC421059B09C4049A750CD71831E1' as const;
export const MOCK_USDC_ADDRESS = '0xA8C0c11bf64AF62CDCA6f93D3769B88BdD7cb93D' as const; // CCIP-BnM on Arb Sepolia

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
    {
        name: 'claimCrossChainFunds',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [],
        outputs: [],
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
    {
        name: 'crossChainClaims',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const;

// ============================================================================
// ERC-20 ABI (subset for BnM approve / allowance / balanceOf)
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
// Constants
// ============================================================================

export const USDC_DECIMALS = 18; // BnM uses 18 decimals
export const MIN_DEPOSIT_USDC = 1; // 1 BnM minimum
