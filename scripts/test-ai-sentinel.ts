/**
 * ShieldYield AI Sentinel — API Endpoint Test
 *
 * Tests the /api/ai-sentinel endpoint with real HTTP calls.
 *
 * Prerequisites:
 *   1. Start the Next.js dev server: cd shieldyield-fe && npm run dev
 *   2. Set GROQ_API_KEY in .env.local (optional — falls back to rule-based)
 *
 * Run with: npx tsx scripts/test-ai-sentinel.ts
 */

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";

// =============================================
// TEST FRAMEWORK
// =============================================

let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
    testCount++;
    if (condition) {
        passCount++;
        console.log(`  ✅ ${message}`);
    } else {
        failCount++;
        console.error(`  ❌ ${message}`);
    }
}

function getThreatLabel(score: number): string {
    if (score <= 25) return "LOW";
    if (score <= 50) return "MODERATE";
    if (score <= 75) return "HIGH";
    return "CRITICAL";
}

function getColor(label: string): string {
    if (label === "LOW") return "\x1b[32m";
    if (label === "MODERATE") return "\x1b[33m";
    if (label === "HIGH") return "\x1b[38;5;208m";
    return "\x1b[31m";
}

// =============================================
// TESTS
// =============================================

async function runTests() {
    console.log("\n🤖 ShieldYield AI Sentinel — API Endpoint Test");
    console.log(`   Target: ${BASE_URL}/api/ai-sentinel\n`);

    // Check if server is running
    try {
        await fetch(`${BASE_URL}/api/ai-sentinel?protocol=AaveAdapter`, { signal: AbortSignal.timeout(5000) });
    } catch {
        console.error("❌ Cannot connect to server. Start it first:");
        console.error("   cd shieldyield-fe && npm run dev\n");
        process.exit(1);
    }

    // ---- Test 1: Valid protocol request ----
    console.log("━".repeat(55));
    console.log("  TEST 1: Valid protocol — AaveAdapter");
    console.log("━".repeat(55));

    const aaveRes = await fetch(`${BASE_URL}/api/ai-sentinel?protocol=AaveAdapter`);
    const aaveData = await aaveRes.json();

    assert(aaveRes.ok, `HTTP status = ${aaveRes.status} (expected 200)`);
    assert(typeof aaveData.ai_threat_score === "number", `ai_threat_score = ${aaveData.ai_threat_score} (is number)`);
    assert(aaveData.ai_threat_score >= 0 && aaveData.ai_threat_score <= 100,
        `ai_threat_score range: ${aaveData.ai_threat_score} (0-100)`);
    assert(typeof aaveData.confidence === "number", `confidence = ${aaveData.confidence} (is number)`);
    assert(aaveData.confidence >= 0 && aaveData.confidence <= 1,
        `confidence range: ${aaveData.confidence} (0-1)`);
    assert(typeof aaveData.reasoning === "string" && aaveData.reasoning.length > 0,
        `reasoning = "${aaveData.reasoning.slice(0, 80)}..."`);
    assert(Array.isArray(aaveData.signals), `signals is array (length ${aaveData.signals.length})`);
    assert(["HOLD", "REDUCE", "EXIT"].includes(aaveData.recommendation),
        `recommendation = ${aaveData.recommendation} (valid)`);
    assert(typeof aaveData.github === "object", "github object present");
    assert(typeof aaveData.github.lastPushDaysAgo === "number",
        `github.lastPushDaysAgo = ${aaveData.github.lastPushDaysAgo}`);
    assert(typeof aaveData.timestamp === "string", `timestamp = ${aaveData.timestamp}`);

    const aaveLabel = getThreatLabel(aaveData.ai_threat_score);
    const aaveColor = getColor(aaveLabel);
    console.log(`\n  Result: ${aaveColor}${aaveLabel}\x1b[0m (${aaveData.ai_threat_score}/100) — ${aaveData.recommendation}`);
    console.log(`  Reasoning: ${aaveData.reasoning}`);
    if (aaveData.signals.length > 0) {
        console.log("  Signals:");
        for (const s of aaveData.signals) {
            const sentColor = s.sentiment === "positive" ? "\x1b[32m" : s.sentiment === "negative" ? "\x1b[31m" : "\x1b[90m";
            console.log(`    ${sentColor}[${s.sentiment}]\x1b[0m ${s.source}: ${s.signal}`);
        }
    }

    // ---- Test 2: All protocols ----
    console.log(`\n${"━".repeat(55)}`);
    console.log("  TEST 2: All protocols");
    console.log("━".repeat(55));

    const protocols = ["AaveAdapter", "CompoundAdapter", "MorphoAdapter", "YieldMaxAdapter"];
    for (const protocol of protocols) {
        const res = await fetch(`${BASE_URL}/api/ai-sentinel?protocol=${protocol}`);
        const data = await res.json();
        assert(res.ok, `${protocol}: HTTP ${res.status}`);

        const label = getThreatLabel(data.ai_threat_score);
        const color = getColor(label);
        console.log(`    ${protocol.padEnd(20)} ${color}${label.padEnd(10)}\x1b[0m score=${data.ai_threat_score}, conf=${data.confidence}, rec=${data.recommendation}`);
    }

    // ---- Test 3: Cache behavior ----
    console.log(`\n${"━".repeat(55)}`);
    console.log("  TEST 3: Cache behavior");
    console.log("━".repeat(55));

    const res1 = await fetch(`${BASE_URL}/api/ai-sentinel?protocol=AaveAdapter`);
    const cache1 = res1.headers.get("X-Cache");

    const res2 = await fetch(`${BASE_URL}/api/ai-sentinel?protocol=AaveAdapter`);
    const cache2 = res2.headers.get("X-Cache");

    console.log(`    First request:  X-Cache = ${cache1}`);
    console.log(`    Second request: X-Cache = ${cache2}`);
    assert(cache2 === "HIT", `Second request should be cached (X-Cache: ${cache2})`);

    // ---- Test 4: Invalid protocol ----
    console.log(`\n${"━".repeat(55)}`);
    console.log("  TEST 4: Invalid protocol → error");
    console.log("━".repeat(55));

    const invalidRes = await fetch(`${BASE_URL}/api/ai-sentinel?protocol=InvalidProtocol`);
    assert(invalidRes.status === 400, `HTTP status = ${invalidRes.status} (expected 400)`);
    const invalidData = await invalidRes.json();
    assert(typeof invalidData.error === "string", `Error message: ${invalidData.error}`);
    assert(Array.isArray(invalidData.valid), `Valid protocols: ${invalidData.valid.join(", ")}`);

    // ---- Test 5: Missing protocol param ----
    console.log(`\n${"━".repeat(55)}`);
    console.log("  TEST 5: Missing protocol param → error");
    console.log("━".repeat(55));

    const missingRes = await fetch(`${BASE_URL}/api/ai-sentinel`);
    assert(missingRes.status === 400, `HTTP status = ${missingRes.status} (expected 400)`);

    // ---- Test 6: Response shape for CRE compatibility ----
    console.log(`\n${"━".repeat(55)}`);
    console.log("  TEST 6: CRE compatibility — response shape");
    console.log("━".repeat(55));

    const creRes = await fetch(`${BASE_URL}/api/ai-sentinel?protocol=AaveAdapter`);
    const creData = await creRes.json();

    // CRE needs these exact fields from the response
    assert("github" in creData, "Has 'github' field (for CRE GithubSignal)");
    assert("recentCommits" in creData.github, "github.recentCommits (CRE needs this)");
    assert("openIssues" in creData.github, "github.openIssues (CRE needs this)");
    assert("lastPushDaysAgo" in creData.github, "github.lastPushDaysAgo (CRE needs this)");
    assert("ai_threat_score" in creData, "Has 'ai_threat_score' (for CRE AiSentinelSignal)");
    assert("confidence" in creData, "Has 'confidence' (for CRE AiSentinelSignal)");
    assert("reasoning" in creData, "Has 'reasoning' (for CRE AiSentinelSignal)");
    assert("recommendation" in creData, "Has 'recommendation' (for CRE AiSentinelSignal)");
    assert("signals" in creData, "Has 'signals' (for CRE AiSentinelSignal)");

    console.log("  CRE can extract both GithubSignal and AiSentinelSignal from this response ✓");

    // ---- Summary ----
    console.log(`\n${"═".repeat(55)}`);
    console.log(`  Results: ${passCount}/${testCount} passed, ${failCount} failed`);
    console.log("═".repeat(55) + "\n");

    if (failCount > 0) {
        console.log("  💥 SOME TESTS FAILED!\n");
        process.exit(1);
    } else {
        console.log("  🎉 All API tests passed!\n");
    }
}

runTests();
