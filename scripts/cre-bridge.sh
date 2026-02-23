#!/bin/bash
# ============================================================
# CRE Bridge Script
# Runs CRE simulation, captures JSON output, and POSTs it
# to the Next.js dashboard API (localhost:3000)
# ============================================================

set -e

API_URL="${DASHBOARD_API_URL:-http://localhost:3000/api/monitoring/snapshot}"
WALLET="${SHIELD_VAULT_ADDRESS:-0xcFBd47c63D284A8F824e586596Df4d5c57326c8B}"
CRE_DIR="$(cd "$(dirname "$0")/../../shieldyield-cre" && pwd)"
TARGET="${1:-production-settings}"

echo "🔗 CRE Bridge — Simulate → Parse → POST"
echo "   CRE Dir:  $CRE_DIR"
echo "   Target:   $TARGET"
echo "   API:      $API_URL"
echo "   Wallet:   $WALLET"
echo ""

# Run CRE simulation with trigger "1" (cron) and capture output
echo "🚀 Running CRE simulation..."
OUTPUT=$(cd "$CRE_DIR" && echo "1" | cre workflow simulate ./shieldyield-workflow --target="$TARGET" 2>&1)

echo "$OUTPUT" | grep "\[USER LOG\]" | tail -20
echo ""

# Extract the JSON result from the "Workflow Simulation Result:" line
RESULT_JSON=$(echo "$OUTPUT" | grep -o '"{\\"status\\".*}"' | head -1)

if [ -z "$RESULT_JSON" ]; then
    echo "❌ No simulation result found in output."
    exit 1
fi

# Unescape the JSON (it's double-escaped in the simulation output)
PARSED_JSON=$(echo "$RESULT_JSON" | sed 's/^"//;s/"$//' | sed 's/\\"/"/g' | sed 's/\\\\/\\/g')

echo "📋 Simulation result parsed. Building POST payload..."

# Extract adapters and riskScores from the first result
ADAPTERS=$(echo "$PARSED_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
results = data.get('results', [])
if not results:
    print('[]')
    sys.exit(0)
r = results[0]
adapters = r.get('adapters', [])
print(json.dumps(adapters))
" 2>/dev/null || echo "[]")

RISK_SCORES=$(echo "$PARSED_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
results = data.get('results', [])
if not results:
    print('{}')
    sys.exit(0)
r = results[0]
scores = r.get('riskScores', {})
print(json.dumps(scores))
" 2>/dev/null || echo "{}")

ANOMALIES=$(echo "$PARSED_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
results = data.get('results', [])
if not results:
    print('[]')
    sys.exit(0)
r = results[0]
anomalies = r.get('anomalies', [])
print(json.dumps(anomalies))
" 2>/dev/null || echo "[]")

# Build the POST payload
PAYLOAD=$(python3 -c "
import json, sys
adapters = json.loads('''$ADAPTERS''')
risk_scores = json.loads('''$RISK_SCORES''')
anomalies = json.loads('''$ANOMALIES''')
payload = {
    'walletAddress': '$WALLET',
    'adapters': adapters,
    'riskScores': risk_scores,
    'anomalies': anomalies,
    'offchain': {
        'prices': {'ethUsd': 0, 'btcUsd': 0, 'usdcUsd': 1}
    }
}
print(json.dumps(payload))
")

echo ""
echo "📤 POSTing snapshot to $API_URL ..."
RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

echo "📥 Response: $RESPONSE"

# Check if response contains "ok":true
if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo ""
    echo "✅ Snapshot successfully pushed to dashboard database!"
    echo "   Open http://localhost:3000 to see the updated data."
else
    echo ""
    echo "⚠️  API response may indicate an error. Check above."
fi
