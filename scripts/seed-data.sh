#!/bin/bash
# ShieldYield — Seed Monitoring Data
# Posts multiple snapshots to /api/monitoring/snapshot to populate the dashboard
# Usage: bash scripts/seed-data.sh

BASE_URL="${1:-http://localhost:3000}"
WALLET="0xcFBd47c63D284A8F824e586596Df4d5c57326c8B"

echo "🌱 Seeding ShieldYield dashboard data..."
echo "   Target: $BASE_URL"
echo "   Wallet: $WALLET"
echo ""

# --- Snapshot 1: Healthy state (30 min ago baseline) ---
echo "📊 Snapshot 1/5: Healthy baseline..."
curl -s -X POST "$BASE_URL/api/monitoring/snapshot" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "'"$WALLET"'",
    "adapters": [
      { "name": "AaveAdapter", "address": "0xAaveAdap000000000000000000000000000000001", "balance": "3500000000", "principal": "3400000000", "apy": "450", "isHealthy": true, "accruedYield": "100000000" },
      { "name": "CompoundAdapter", "address": "0xCompound00000000000000000000000000000002", "balance": "2800000000", "principal": "2750000000", "apy": "380", "isHealthy": true, "accruedYield": "50000000" },
      { "name": "MorphoAdapter", "address": "0xMorphoAd000000000000000000000000000000003", "balance": "2200000000", "principal": "2150000000", "apy": "520", "isHealthy": true, "accruedYield": "50000000" },
      { "name": "YieldMaxAdapter", "address": "0xYieldMax000000000000000000000000000000004", "balance": "1500000000", "principal": "1450000000", "apy": "680", "isHealthy": true, "accruedYield": "50000000" }
    ],
    "riskScores": {
      "AaveAdapter": { "score": 5, "level": "SAFE" },
      "CompoundAdapter": { "score": 8, "level": "SAFE" },
      "MorphoAdapter": { "score": 12, "level": "SAFE" },
      "YieldMaxAdapter": { "score": 18, "level": "SAFE" }
    },
    "anomalies": [],
    "offchain": {
      "prices": { "ethUsd": 2650, "btcUsd": 52000, "usdcUsd": 1.0 },
      "defiMetrics": {
        "aave": { "totalSupplied": "45000000", "totalBorrowed": "28000000", "supplyApy": 4.5, "borrowApy": 6.8, "utilization": 62.2 },
        "compound": { "totalSupply": "38000000", "totalBorrow": "22000000", "supplyApr": 3.8, "borrowApr": 5.9, "utilization": 57.9 }
      }
    }
  }' | jq . 2>/dev/null || echo "(response received)"
echo ""

sleep 1

# --- Snapshot 2: Slight growth ---
echo "📊 Snapshot 2/5: Growth phase..."
curl -s -X POST "$BASE_URL/api/monitoring/snapshot" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "'"$WALLET"'",
    "adapters": [
      { "name": "AaveAdapter", "address": "0xAaveAdap000000000000000000000000000000001", "balance": "3520000000", "principal": "3400000000", "apy": "455", "isHealthy": true, "accruedYield": "120000000" },
      { "name": "CompoundAdapter", "address": "0xCompound00000000000000000000000000000002", "balance": "2815000000", "principal": "2750000000", "apy": "385", "isHealthy": true, "accruedYield": "65000000" },
      { "name": "MorphoAdapter", "address": "0xMorphoAd000000000000000000000000000000003", "balance": "2218000000", "principal": "2150000000", "apy": "525", "isHealthy": true, "accruedYield": "68000000" },
      { "name": "YieldMaxAdapter", "address": "0xYieldMax000000000000000000000000000000004", "balance": "1512000000", "principal": "1450000000", "apy": "690", "isHealthy": true, "accruedYield": "62000000" }
    ],
    "riskScores": {
      "AaveAdapter": { "score": 5, "level": "SAFE" },
      "CompoundAdapter": { "score": 8, "level": "SAFE" },
      "MorphoAdapter": { "score": 12, "level": "SAFE" },
      "YieldMaxAdapter": { "score": 18, "level": "SAFE" }
    },
    "anomalies": [],
    "offchain": {
      "prices": { "ethUsd": 2680, "btcUsd": 52500, "usdcUsd": 1.0 },
      "defiMetrics": {
        "aave": { "totalSupplied": "45500000", "totalBorrowed": "29000000", "supplyApy": 4.6, "borrowApy": 7.0, "utilization": 63.7 },
        "compound": { "totalSupply": "38500000", "totalBorrow": "22500000", "supplyApr": 3.9, "borrowApr": 6.0, "utilization": 58.4 }
      }
    }
  }' | jq . 2>/dev/null || echo "(response received)"
echo ""

sleep 1

# --- Snapshot 3: Utilization spike + WARNING ---
echo "📊 Snapshot 3/5: Utilization spike (WARNING)..."
curl -s -X POST "$BASE_URL/api/monitoring/snapshot" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "'"$WALLET"'",
    "adapters": [
      { "name": "AaveAdapter", "address": "0xAaveAdap000000000000000000000000000000001", "balance": "3540000000", "principal": "3400000000", "apy": "480", "isHealthy": true, "accruedYield": "140000000" },
      { "name": "CompoundAdapter", "address": "0xCompound00000000000000000000000000000002", "balance": "2830000000", "principal": "2750000000", "apy": "395", "isHealthy": true, "accruedYield": "80000000" },
      { "name": "MorphoAdapter", "address": "0xMorphoAd000000000000000000000000000000003", "balance": "2235000000", "principal": "2150000000", "apy": "530", "isHealthy": true, "accruedYield": "85000000" },
      { "name": "YieldMaxAdapter", "address": "0xYieldMax000000000000000000000000000000004", "balance": "1525000000", "principal": "1450000000", "apy": "700", "isHealthy": true, "accruedYield": "75000000" }
    ],
    "riskScores": {
      "AaveAdapter": { "score": 8, "level": "SAFE" },
      "CompoundAdapter": { "score": 11, "level": "SAFE" },
      "MorphoAdapter": { "score": 15, "level": "SAFE" },
      "YieldMaxAdapter": { "score": 28, "level": "WATCH" }
    },
    "anomalies": [
      { "type": "HIGH_UTILIZATION", "severity": "WARNING", "adapter": "AaveAdapter", "message": "Protocol utilization at 88.5% — withdrawals may be delayed" }
    ],
    "offchain": {
      "prices": { "ethUsd": 2620, "btcUsd": 51000, "usdcUsd": 1.0 },
      "defiMetrics": {
        "aave": { "totalSupplied": "46000000", "totalBorrowed": "40700000", "supplyApy": 7.2, "borrowApy": 11.5, "utilization": 88.5 },
        "compound": { "totalSupply": "39000000", "totalBorrow": "23000000", "supplyApr": 4.0, "borrowApr": 6.2, "utilization": 59.0 }
      }
    }
  }' | jq . 2>/dev/null || echo "(response received)"
echo ""

sleep 1

# --- Snapshot 4: Recovery ---
echo "📊 Snapshot 4/5: Recovery phase..."
curl -s -X POST "$BASE_URL/api/monitoring/snapshot" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "'"$WALLET"'",
    "adapters": [
      { "name": "AaveAdapter", "address": "0xAaveAdap000000000000000000000000000000001", "balance": "3555000000", "principal": "3400000000", "apy": "460", "isHealthy": true, "accruedYield": "155000000" },
      { "name": "CompoundAdapter", "address": "0xCompound00000000000000000000000000000002", "balance": "2845000000", "principal": "2750000000", "apy": "390", "isHealthy": true, "accruedYield": "95000000" },
      { "name": "MorphoAdapter", "address": "0xMorphoAd000000000000000000000000000000003", "balance": "2250000000", "principal": "2150000000", "apy": "535", "isHealthy": true, "accruedYield": "100000000" },
      { "name": "YieldMaxAdapter", "address": "0xYieldMax000000000000000000000000000000004", "balance": "1538000000", "principal": "1450000000", "apy": "695", "isHealthy": true, "accruedYield": "88000000" }
    ],
    "riskScores": {
      "AaveAdapter": { "score": 5, "level": "SAFE" },
      "CompoundAdapter": { "score": 8, "level": "SAFE" },
      "MorphoAdapter": { "score": 13, "level": "SAFE" },
      "YieldMaxAdapter": { "score": 20, "level": "SAFE" }
    },
    "anomalies": [],
    "offchain": {
      "prices": { "ethUsd": 2700, "btcUsd": 53000, "usdcUsd": 1.0 },
      "defiMetrics": {
        "aave": { "totalSupplied": "47000000", "totalBorrowed": "32000000", "supplyApy": 5.0, "borrowApy": 7.5, "utilization": 68.1 },
        "compound": { "totalSupply": "39500000", "totalBorrow": "23500000", "supplyApr": 4.1, "borrowApr": 6.3, "utilization": 59.5 }
      }
    }
  }' | jq . 2>/dev/null || echo "(response received)"
echo ""

sleep 1

# --- Snapshot 5: Current state (latest) ---
echo "📊 Snapshot 5/5: Current state (latest)..."
curl -s -X POST "$BASE_URL/api/monitoring/snapshot" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "'"$WALLET"'",
    "adapters": [
      { "name": "AaveAdapter", "address": "0xAaveAdap000000000000000000000000000000001", "balance": "3570000000", "principal": "3400000000", "apy": "465", "isHealthy": true, "accruedYield": "170000000" },
      { "name": "CompoundAdapter", "address": "0xCompound00000000000000000000000000000002", "balance": "2860000000", "principal": "2750000000", "apy": "392", "isHealthy": true, "accruedYield": "110000000" },
      { "name": "MorphoAdapter", "address": "0xMorphoAd000000000000000000000000000000003", "balance": "2268000000", "principal": "2150000000", "apy": "540", "isHealthy": true, "accruedYield": "118000000" },
      { "name": "YieldMaxAdapter", "address": "0xYieldMax000000000000000000000000000000004", "balance": "1550000000", "principal": "1450000000", "apy": "705", "isHealthy": true, "accruedYield": "100000000" }
    ],
    "riskScores": {
      "AaveAdapter": { "score": 3, "level": "SAFE" },
      "CompoundAdapter": { "score": 6, "level": "SAFE" },
      "MorphoAdapter": { "score": 10, "level": "SAFE" },
      "YieldMaxAdapter": { "score": 16, "level": "SAFE" }
    },
    "anomalies": [],
    "offchain": {
      "prices": { "ethUsd": 2720, "btcUsd": 53500, "usdcUsd": 1.0 },
      "defiMetrics": {
        "aave": { "totalSupplied": "47500000", "totalBorrowed": "31000000", "supplyApy": 4.7, "borrowApy": 7.1, "utilization": 65.3 },
        "compound": { "totalSupply": "40000000", "totalBorrow": "24000000", "supplyApr": 4.2, "borrowApr": 6.4, "utilization": 60.0 }
      }
    }
  }' | jq . 2>/dev/null || echo "(response received)"
echo ""

echo "✅ Done! 5 snapshots seeded."
echo "   → Open $BASE_URL to see the dashboard with data"
echo "   → Open $BASE_URL/protocol to see protocol details"
