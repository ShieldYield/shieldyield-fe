import { NextRequest, NextResponse } from "next/server";


// ============================================================================
// Protocol Config — maps adapter name to data sources
// ============================================================================

const PROTOCOL_CONFIG: Record<
  string,
  { github: string; cryptoPanicCurrency: string; name: string }
> = {
  AaveAdapter: {
    github: "https://api.github.com/repos/aave/aave-v3-core",
    cryptoPanicCurrency: "AAVE",
    name: "Aave V3",
  },
  CompoundAdapter: {
    github: "https://api.github.com/repos/compound-finance/comet",
    cryptoPanicCurrency: "COMP",
    name: "Compound V3",
  },
  MorphoAdapter: {
    github: "https://api.github.com/repos/morpho-org/morpho-blue",
    cryptoPanicCurrency: "MORPHO",
    name: "Morpho Blue",
  },
  YieldMaxAdapter: {
    github: "",
    cryptoPanicCurrency: "USDC",
    name: "YieldMax",
  },
};

// ============================================================================
// Types
// ============================================================================

interface AiSentinelSignal {
  source: string;
  signal: string;
  sentiment: "positive" | "negative" | "neutral";
}

interface AiSentinelResponse {
  protocol: string;
  ai_threat_score: number;
  confidence: number;
  reasoning: string;
  signals: AiSentinelSignal[];
  recommendation: "HOLD" | "REDUCE" | "EXIT";
  github: {
    recentCommits: number;
    openIssues: number;
    lastPushDaysAgo: number;
  };
  sources: {
    githubUrl: string;
    cryptoPanicUrl: string;
  };
  newsHeadlines: string[];
  timestamp: string;
}

// ============================================================================
// In-memory cache (30 min per protocol — saves CryptoPanic + Groq credits)
// ============================================================================

interface CacheEntry {
  data: AiSentinelResponse;
  timestamp: number;
}
const apiCache: Record<string, CacheEntry> = {};
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// YieldMax Dynamic Resolver
// ============================================================================

async function getYieldMaxActiveProtocol(): Promise<string> {
  try {
    const res = await fetch("https://yields.llama.fi/pools", { cache: "no-store" });
    if (!res.ok) return "YieldMax";

    const { data: pools } = await res.json();

    const EXCLUDED_PROJECTS = new Set([
      "uniswap-v3", "uniswap-v4", "curve-dex", "balancer-v2",
      "pancakeswap-amm-v3", "gmx-v2-perps", "steer-protocol",
      "gamma", "beefy", "hermes-v2", "acryptos",
    ]);

    const usdcPools = pools.filter((p: any) =>
      p.chain === "Arbitrum" &&
      p.symbol?.toUpperCase() === "USDC" &&
      !EXCLUDED_PROJECTS.has(p.project) &&
      (p.apy ?? 0) > 0 &&
      (p.apy ?? 0) < 50
    );

    if (usdcPools.length > 0) {
      const sorted = usdcPools.sort((a: any, b: any) => (b.apy ?? 0) - (a.apy ?? 0));
      // Return e.g. "Peapods Finance"
      return sorted[0].project.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    }
  } catch (err) {
    console.error("[ai-sentinel] Failed to resolve YieldMax top protocol:", err);
  }
  return "YieldMax";
}

// ============================================================================
// Data Fetchers
// ============================================================================

async function fetchGitHub(githubUrl: string) {
  if (!githubUrl) {
    return { recentCommits: 0, openIssues: 0, lastPushDaysAgo: 999, description: "" };
  }

  try {
    const res = await fetch(githubUrl, {
      headers: { "User-Agent": "ShieldYield-AI-Sentinel" },
    });
    if (!res.ok) return { recentCommits: 0, openIssues: 0, lastPushDaysAgo: 999, description: "" };

    const data = await res.json();
    const lastPush = new Date(data.pushed_at || Date.now());
    const daysSincePush = Math.floor(
      (Date.now() - lastPush.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      recentCommits: data.subscribers_count || data.watchers_count || 0,
      openIssues: data.open_issues_count || 0,
      lastPushDaysAgo: daysSincePush,
      description: data.description || "",
    };
  } catch {
    return { recentCommits: 0, openIssues: 0, lastPushDaysAgo: 999, description: "" };
  }
}

async function fetchCryptoPanicNews(currency: string): Promise<string[]> {
  const apiKey = process.env.CRYPTOPANIC_API_KEY;

  if (!apiKey) {
    console.warn(`[ai-sentinel] No CRYPTOPANIC_API_KEY found. Using mock headlines.`);
    return getMockHeadlines(currency);
  }

  try {
    const url = `https://cryptopanic.com/api/developer/v2/posts/?auth_token=${apiKey}&currencies=${currency}&kind=news&public=true`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[ai-sentinel] CryptoPanic API error: ${res.status}`);
      // On rate limit (429) or any error, return realistic mock headlines
      return getMockHeadlines(currency);
    }

    const data = await res.json();
    const posts = data.results || [];
    // Take top 5 headlines
    return posts.slice(0, 5).map((p: { title: string }) => p.title);
  } catch (err) {
    console.error("[ai-sentinel] CryptoPanic fetch failed:", err);
    return getMockHeadlines(currency);
  }
}

/** Realistic mock headlines when CryptoPanic API is unavailable or rate-limited */
function getMockHeadlines(currency: string): string[] {
  const mockData: Record<string, string[]> = {
    AAVE: [
      "Aave V3 surpasses $12B in total value locked across all chains",
      "Aave governance proposes new risk parameters for stablecoin markets",
      "Aave DAO approves GHO stablecoin expansion to Arbitrum",
      "Security audit completed for Aave V3.1 upgrade — no critical issues found",
      "Aave integrates Chainlink CCIP for cross-chain lending capabilities",
    ],
    COMP: [
      "Compound Finance launches Compound V3 on Base network",
      "Compound governance votes on treasury management proposal",
      "Compound Labs announces new institutional lending features",
      "Market analysis: Compound V3 sees 30% increase in deposits this quarter",
      "Compound protocol achieves $2B in total assets under management",
    ],
    MORPHO: [
      "Morpho Blue protocol sees rapid adoption with $1.5B in TVL",
      "Morpho Labs raises Series B funding to expand DeFi lending protocol",
      "Morpho introduces new vault creation framework for optimized lending",
      "Morpho Blue completes third-party security audit by Spearbit",
      "New Morpho integration enables USDC lending on Ethereum mainnet",
    ],
    USDC: [
      "Circle reports steady USDC market cap growth amid regulatory clarity",
      "USDC expands to new blockchain networks for broader DeFi access",
      "Circle partners with major exchanges for improved USDC liquidity",
      "USDC reserves audit report confirms full backing by US Treasury bonds",
      "DeFi protocols increasingly adopt USDC as primary stablecoin",
    ],
  };
  return mockData[currency] || mockData.USDC;
}

// ============================================================================
// GroqAI LLM Call
// ============================================================================

interface GroqAiResult {
  ai_threat_score: number;
  confidence: number;
  reasoning: string;
  signals: AiSentinelSignal[];
  recommendation: "HOLD" | "REDUCE" | "EXIT";
}

async function callGroqAI(
  protocolName: string,
  github: { recentCommits: number; openIssues: number; lastPushDaysAgo: number; description: string },
  newsHeadlines: string[]
): Promise<GroqAiResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    // Fallback: rule-based scoring when no API key
    return fallbackRuleBasedScore(github, newsHeadlines);
  }

  const prompt = `You are a DeFi security analyst for ShieldYield, a yield aggregator protocol. Analyze the following data for ${protocolName} and assess its risk level.

## GitHub Activity
- Recent watchers/subscribers: ${github.recentCommits}
- Open issues: ${github.openIssues}
- Days since last push: ${github.lastPushDaysAgo}
- Description: ${github.description || "N/A"}

## Recent News Headlines
${newsHeadlines.length > 0 ? newsHeadlines.map((h, i) => `${i + 1}. ${h}`).join("\n") : "No recent news found."}

## Instructions
Respond ONLY with a valid JSON object (no markdown, no explanation outside JSON):
{
  "ai_threat_score": <number 0-100, higher = more risky>,
  "confidence": <number 0-1, how confident you are>,
  "reasoning": "<1-2 sentence summary of your analysis>",
  "signals": [
    { "source": "github", "signal": "<what you found>", "sentiment": "positive|negative|neutral" },
    { "source": "news", "signal": "<what you found>", "sentiment": "positive|negative|neutral" }
  ],
  "recommendation": "HOLD|REDUCE|EXIT"
}

Guidelines:
- ai_threat_score 0-20: Very safe, active development, no negative news
- ai_threat_score 21-40: Mostly safe, minor concerns
- ai_threat_score 41-60: Moderate risk, some concerning signals
- ai_threat_score 61-80: High risk, multiple warning signs
- ai_threat_score 81-100: Critical risk, immediate action needed
- If data is insufficient, set confidence low (0.3-0.5) and use moderate score (30-50)`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 512,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error(`[ai-sentinel] Groq API error: ${res.status}`);
      return fallbackRuleBasedScore(github, newsHeadlines);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return fallbackRuleBasedScore(github, newsHeadlines);

    const parsed = JSON.parse(content) as GroqAiResult;

    // Sanitize values
    return {
      ai_threat_score: Math.max(0, Math.min(100, Math.round(parsed.ai_threat_score ?? 50))),
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      reasoning: String(parsed.reasoning || "Analysis unavailable").slice(0, 300),
      signals: Array.isArray(parsed.signals)
        ? parsed.signals.slice(0, 5).map((s) => ({
          source: String(s.source || "unknown"),
          signal: String(s.signal || "").slice(0, 200),
          sentiment: (["positive", "negative", "neutral"].includes(s.sentiment) ? s.sentiment : "neutral") as "positive" | "negative" | "neutral",
        }))
        : [],
      recommendation: (["HOLD", "REDUCE", "EXIT"].includes(parsed.recommendation) ? parsed.recommendation : "HOLD") as "HOLD" | "REDUCE" | "EXIT",
    };
  } catch (err) {
    console.error("[ai-sentinel] Groq call failed:", err);
    return fallbackRuleBasedScore(github, newsHeadlines);
  }
}

/** Rule-based fallback when Groq API is unavailable */
function fallbackRuleBasedScore(
  github: { recentCommits: number; openIssues: number; lastPushDaysAgo: number },
  newsHeadlines: string[]
): GroqAiResult {
  let score = 30; // baseline

  // GitHub activity
  if (github.lastPushDaysAgo > 60) score += 20;
  else if (github.lastPushDaysAgo > 30) score += 10;
  else if (github.lastPushDaysAgo < 7) score -= 10;

  if (github.openIssues > 50) score += 5;

  // News sentiment (simple keyword check)
  const negativeKeywords = ["hack", "exploit", "vulnerability", "rug", "drain", "attack", "compromised"];
  const hasNegativeNews = newsHeadlines.some((h) =>
    negativeKeywords.some((k) => h.toLowerCase().includes(k))
  );
  if (hasNegativeNews) score += 25;

  score = Math.max(0, Math.min(100, score));

  const signals: AiSentinelSignal[] = [
    {
      source: "github",
      signal: github.lastPushDaysAgo < 7
        ? `Active development — last push ${github.lastPushDaysAgo}d ago`
        : `Last push ${github.lastPushDaysAgo}d ago, ${github.openIssues} open issues`,
      sentiment: github.lastPushDaysAgo < 14 ? "positive" : github.lastPushDaysAgo > 30 ? "negative" : "neutral",
    },
    {
      source: "news",
      signal: hasNegativeNews
        ? "Negative security news detected"
        : newsHeadlines.length > 0
          ? "No security incidents in recent news"
          : "No recent news available",
      sentiment: hasNegativeNews ? "negative" : "neutral",
    },
  ];

  return {
    ai_threat_score: score,
    confidence: 0.5,
    reasoning: `Rule-based analysis (AI unavailable): GitHub activity ${github.lastPushDaysAgo}d ago, ${newsHeadlines.length} news items.`,
    signals,
    recommendation: score > 70 ? "EXIT" : score > 50 ? "REDUCE" : "HOLD",
  };
}

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const protocol = searchParams.get("protocol") || "AaveAdapter"; // Default to AaveAdapter if not specified

  if (!protocol || !PROTOCOL_CONFIG[protocol]) {
    return NextResponse.json(
      {
        error: "Invalid protocol",
        valid: Object.keys(PROTOCOL_CONFIG),
      },
      { status: 400 }
    );
  }

  // ── Simulation mode bypass ────────────────────────────────────────────────
  // Active when: ?sim=true param (sim-daemon via mock-variance-server)
  //           OR cookie sy-sim-mode=1 (FE toggle button)
  const isSim =
    searchParams.get("sim") === "true" ||
    request.cookies.get("sy-sim-mode")?.value === "1";

  if (isSim) {
    const config = PROTOCOL_CONFIG[protocol];
    const mockGithub = { recentCommits: 25, openIssues: 8, lastPushDaysAgo: 3, description: "" };
    const headlines = getMockHeadlines(config.cryptoPanicCurrency);
    const aiResult = fallbackRuleBasedScore(mockGithub, headlines);

    // Cek apakah sim-inject sedang aktif → override AI score jika ada
    let injectedAiScore: number | undefined;
    try {
      const injectResp = await fetch("http://localhost:3099/inject-state", {
        signal: AbortSignal.timeout(1_000),
      });
      if (injectResp.ok) {
        const state = await injectResp.json();
        injectedAiScore = state.scenario?.aiScore as number | undefined;
      }
    } catch { /* daemon/mock-server tidak jalan → gunakan static sim data */ }

    const finalScore: number = injectedAiScore !== undefined
      ? Math.max(0, Math.min(100, injectedAiScore))
      : aiResult.ai_threat_score;

    const finalRecommendation: "HOLD" | "REDUCE" | "EXIT" =
      finalScore > 70 ? "EXIT" : finalScore > 50 ? "REDUCE" : "HOLD";

    return NextResponse.json(
      {
        protocol,
        ...aiResult,
        ai_threat_score: finalScore,
        recommendation: finalRecommendation,
        reasoning: injectedAiScore !== undefined
          ? `[INJECTED SCENARIO] AI Threat Score: ${finalScore}/100`
          : aiResult.reasoning,
        github: { recentCommits: 25, openIssues: 8, lastPushDaysAgo: 3 },
        sources: {
          githubUrl: config.github || "",
          cryptoPanicUrl: `https://cryptopanic.com/news/${config.cryptoPanicCurrency}/`,
        },
        newsHeadlines: headlines,
        timestamp: new Date().toISOString(),
        _sim: true,
        ...(injectedAiScore !== undefined ? { _injected: true } : {}),
      },
      { headers: { "X-Sim-Mode": "true", "X-Cache": "SIM" } }
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Check cache first
  const now = Date.now();
  const cached = apiCache[protocol];
  if (cached && (now - cached.timestamp < CACHE_DURATION_MS)) {
    console.log(`[ai-sentinel] Serving cached data for ${protocol}`);
    return NextResponse.json(cached.data, { headers: { "X-Cache": "HIT" } });
  }

  // Clone config so we don't mutate the global one
  const config = { ...PROTOCOL_CONFIG[protocol] };

  // 🚀 MAGIC: If YieldMax, dynamically find what protocol they are depositing into right now!
  if (protocol === "YieldMaxAdapter") {
    const activeProtocol = await getYieldMaxActiveProtocol();
    console.log(`[ai-sentinel] YieldMax is routing to: ${activeProtocol}. Instructing AI to audit ${activeProtocol}.`);
    config.name = activeProtocol !== "YieldMax" ? `${activeProtocol} (via YieldMax routing)` : "YieldMax";
  }

  try {
    // Fetch GitHub + News in parallel
    const [github, newsHeadlines] = await Promise.all([
      fetchGitHub(config.github),
      fetchCryptoPanicNews(config.cryptoPanicCurrency),
    ]);

    // Call GroqAI for analysis
    const aiResult = await callGroqAI(config.name, github, newsHeadlines);

    const resultData: AiSentinelResponse = {
      protocol,
      ai_threat_score: aiResult.ai_threat_score,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning,
      signals: aiResult.signals,
      recommendation: aiResult.recommendation,
      github: {
        recentCommits: github.recentCommits,
        openIssues: github.openIssues,
        lastPushDaysAgo: github.lastPushDaysAgo,
      },
      sources: {
        githubUrl: config.github || "",
        cryptoPanicUrl: `https://cryptopanic.com/news/${config.cryptoPanicCurrency}/`,
      },
      newsHeadlines,
      timestamp: new Date().toISOString(),
    };

    // Save to cache
    apiCache[protocol] = {
      data: resultData,
      timestamp: Date.now(),
    };

    return NextResponse.json(resultData, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (err) {
    console.error("[ai-sentinel] Error:", err);
    return NextResponse.json(
      { error: "AI Sentinel analysis failed", details: String(err) },
      { status: 500 }
    );
  }
}
