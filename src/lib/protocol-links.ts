/**
 * Protocol Links — Dynamic mapping from adapter names to DeFi DApp URLs.
 * Links change based on which protocol currently holds user's assets.
 */

export interface ProtocolLink {
    name: string;
    displayName: string;
    url: string;
    docsUrl: string;
    icon: string;
    color: string;
}

const PROTOCOL_LINKS: Record<string, ProtocolLink> = {
    AaveAdapter: {
        name: 'AaveAdapter',
        displayName: 'Aave V3',
        url: 'https://app.aave.com/',
        docsUrl: 'https://docs.aave.com/',
        icon: '🔵',
        color: 'from-blue-500/20',
    },
    CompoundAdapter: {
        name: 'CompoundAdapter',
        displayName: 'Compound V3',
        url: 'https://app.compound.finance/',
        docsUrl: 'https://docs.compound.finance/',
        icon: '🟢',
        color: 'from-green-500/20',
    },
    MorphoAdapter: {
        name: 'MorphoAdapter',
        displayName: 'Morpho Blue',
        url: 'https://app.morpho.org/',
        docsUrl: 'https://docs.morpho.org/',
        icon: '🟣',
        color: 'from-purple-500/20',
    },
    YieldMaxAdapter: {
        name: 'YieldMaxAdapter',
        displayName: 'YieldMax (Yearn)',
        url: 'https://yearn.fi/',
        docsUrl: 'https://docs.yearn.fi/',
        icon: '🟡',
        color: 'from-yellow-500/20',
    },
};

/**
 * Get protocol link for a specific adapter
 */
export function getProtocolLink(adapterName: string): ProtocolLink | null {
    return PROTOCOL_LINKS[adapterName] || null;
}

/**
 * Get all protocol links
 */
export function getAllProtocolLinks(): Record<string, ProtocolLink> {
    return PROTOCOL_LINKS;
}

/**
 * Get the "safe haven" protocol — the one ShieldYield would redirect funds to
 * during a risk event. Currently defaults to Aave as the most battle-tested.
 */
export function getSafeHavenProtocol(): ProtocolLink {
    return PROTOCOL_LINKS.AaveAdapter;
}

/**
 * Get recommended protocol link based on risk analysis.
 * If any adapter has WARNING/CRITICAL risk, recommend safe haven.
 * Otherwise, recommend the adapter with highest APY.
 */
export function getRecommendedProtocol(
    adapters: Record<string, { apy?: number; balance?: number }>,
    riskScores: Record<string, { score: number; level: string }>
): { protocol: ProtocolLink; reason: string } {
    // Check for high-risk adapters
    const hasHighRisk = Object.values(riskScores).some(
        (r) => r.level === 'WARNING' || r.level === 'CRITICAL'
    );

    if (hasHighRisk) {
        return {
            protocol: getSafeHavenProtocol(),
            reason: '⚠️ High risk detected — recommending safe haven protocol',
        };
    }

    // Find adapter with highest APY
    let bestAdapter = 'AaveAdapter';
    let bestApy = 0;
    for (const [name, data] of Object.entries(adapters)) {
        const apy = data.apy || 0;
        if (apy > bestApy) {
            bestApy = apy;
            bestAdapter = name;
        }
    }

    const protocol = PROTOCOL_LINKS[bestAdapter] || getSafeHavenProtocol();
    return {
        protocol,
        reason: `✨ Best yield: ${protocol.displayName} at ${bestApy.toFixed(2)}% APY`,
    };
}
