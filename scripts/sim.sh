#!/bin/bash
# ============================================================
#  ShieldYield — Manual Simulation Runner
#  Usage: bash scripts/sim.sh <scenario>
#
#  Available scenarios:
#    reset      → Kembali ke data Blockchain asli (matikan simulasi)
#    normal     → Semua protokol sehat, yield naik perlahan
#    watch      → YieldMax mulai bergerak mencurigakan (WATCH)
#    warning    → Aave utilization tinggi, Morpho WARNING
#    critical   → YieldMax CRITICAL, dana dievakuasi ke safe haven
#    exploit    → Simulasi eksploitasi — semua dana hilang dari YieldMax
#    recovery   → Pasca-insiden, YieldMax pulih ke SAFE
#
#  Contoh:
#    bash scripts/sim.sh reset
#    bash scripts/sim.sh critical
# ============================================================

SIM_FILE="/tmp/shieldyield-simulation.json"
SCENARIO="${1:-help}"

# ── Helpers ────────────────────────────────────────────────

write_sim() {
  echo "$1" > "$SIM_FILE"
  echo "✅  Scenario aktif  →  '$SCENARIO'"
  echo "   Refresh dashboard di browser (http://localhost:3000)"
}

print_help() {
  echo ""
  echo "  ShieldYield Simulation Runner"
  echo ""
  echo "  Usage:"
  echo "    bash scripts/sim.sh <scenario>"
  echo ""
  echo "  Scenarios:"
  echo "    reset     → OFF — gunakan data Blockchain nyata"
  echo "    normal    → Semua SAFE, yield naik normal"
  echo "    watch     → YieldMax mulai mencurigakan (WATCH 38)"
  echo "    warning   → Aave over-utilized, Morpho WARNING"
  echo "    critical  → YieldMax CRITICAL (96), dana dievakuasi"
  echo "    exploit   → Eksploitasi aktif, saldo YieldMax = 0"
  echo "    recovery  → YieldMax pulih kembali ke SAFE"
  echo ""
}

# ── Scenarios ──────────────────────────────────────────────

case "$SCENARIO" in

  reset)
    rm -f "$SIM_FILE"
    echo "🔴  Simulasi DIMATIKAN — data kini diambil langsung dari Blockchain Arbitrum Sepolia."
    echo "   Refresh browser untuk melihat data asli."
    ;;

  normal)
    write_sim '{
      "active": true,
      "step": 1,
      "stepLabel": "Normal — All protocols healthy",
      "totalValueUsd": 1.00,
      "totalAssets": 1.00,
      "totalChangePercent": 0.12,
      "totalChangeDirection": "up",
      "lastUpdated": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "adapters": {
        "AaveAdapter":     { "address": "0xb81961aa49d7e834404e299e688b3dc09a5efe5a", "balance": 0.45, "apy": 1.50, "isHealthy": true,  "principal": 0.45, "accruedYield": 0.002, "allocation": 45.0, "targetAllocation": 45.0 },
        "CompoundAdapter": { "address": "0xcc547a2b0f18b34095623809977d54cfe306bebf", "balance": 0.25, "apy": 2.44, "isHealthy": true,  "principal": 0.25, "accruedYield": 0.001, "allocation": 25.0, "targetAllocation": 25.0 },
        "MorphoAdapter":   { "address": "0x5f8a64bc67f23b8d5d02c7cfe187ad42d59f1d59", "balance": 0.30, "apy": 2.83, "isHealthy": true,  "principal": 0.30, "accruedYield": 0.001, "allocation": 30.0, "targetAllocation": 30.0 },
        "YieldMaxAdapter": { "address": "0x5ebd6f3da76c2b9c9d6aac89da08c388eab2b3cb", "balance": 0.00, "apy": 17.23,"isHealthy": true,  "principal": 0.00, "accruedYield": 0.000, "allocation": 0.0,  "targetAllocation": 0.0,
          "topPools": [
            { "protocol": "peapods-finance",  "apy": 17.23 },
            { "protocol": "gains-network",    "apy": 10.13 },
            { "protocol": "tender-finance",   "apy": 9.62  },
            { "protocol": "deltaprime",       "apy": 8.02  },
            { "protocol": "woofi-earn",       "apy": 7.44  }
          ]
        }
      },
      "riskScores": {
        "AaveAdapter":     { "score": 10, "level": "SAFE" },
        "CompoundAdapter": { "score": 13, "level": "SAFE" },
        "MorphoAdapter":   { "score": 15, "level": "SAFE" },
        "YieldMaxAdapter": { "score": 18, "level": "SAFE" }
      }
    }'
    ;;

  watch)
    write_sim '{
      "active": true,
      "step": 2,
      "stepLabel": "Watch — YieldMax anomaly detected",
      "totalValueUsd": 1.00,
      "totalAssets": 1.00,
      "totalChangePercent": 0.05,
      "totalChangeDirection": "up",
      "lastUpdated": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "adapters": {
        "AaveAdapter":     { "address": "0xb81961aa49d7e834404e299e688b3dc09a5efe5a", "balance": 0.45, "apy": 1.50, "isHealthy": true,  "principal": 0.45, "accruedYield": 0.003, "allocation": 45.0, "targetAllocation": 45.0 },
        "CompoundAdapter": { "address": "0xcc547a2b0f18b34095623809977d54cfe306bebf", "balance": 0.25, "apy": 2.44, "isHealthy": true,  "principal": 0.25, "accruedYield": 0.002, "allocation": 25.0, "targetAllocation": 25.0 },
        "MorphoAdapter":   { "address": "0x5f8a64bc67f23b8d5d02c7cfe187ad42d59f1d59", "balance": 0.30, "apy": 2.83, "isHealthy": true,  "principal": 0.30, "accruedYield": 0.001, "allocation": 30.0, "targetAllocation": 30.0 },
        "YieldMaxAdapter": { "address": "0x5ebd6f3da76c2b9c9d6aac89da08c388eab2b3cb", "balance": 0.00, "apy": 32.50,"isHealthy": true,  "principal": 0.00, "accruedYield": 0.000, "allocation": 0.0,  "targetAllocation": 0.0,
          "topPools": [
            { "protocol": "peapods-finance", "apy": 32.50 },
            { "protocol": "gains-network",   "apy": 10.13 },
            { "protocol": "tender-finance",  "apy": 9.62  },
            { "protocol": "deltaprime",      "apy": 8.02  },
            { "protocol": "woofi-earn",      "apy": 7.44  }
          ]
        }
      },
      "riskScores": {
        "AaveAdapter":     { "score": 10, "level": "SAFE"  },
        "CompoundAdapter": { "score": 13, "level": "SAFE"  },
        "MorphoAdapter":   { "score": 15, "level": "SAFE"  },
        "YieldMaxAdapter": { "score": 38, "level": "WATCH" }
      }
    }'
    echo "   ⚠️  YieldMax APY melonjak ke 32.5% — sinyal mencurigakan mulai muncul"
    ;;

  warning)
    write_sim '{
      "active": true,
      "step": 3,
      "stepLabel": "Warning — Aave over-utilized, Morpho WARNING",
      "totalValueUsd": 1.00,
      "totalAssets": 1.00,
      "totalChangePercent": 0.02,
      "totalChangeDirection": "neutral",
      "lastUpdated": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "adapters": {
        "AaveAdapter":     { "address": "0xb81961aa49d7e834404e299e688b3dc09a5efe5a", "balance": 0.45, "apy": 7.20, "isHealthy": true,  "principal": 0.45, "accruedYield": 0.003, "allocation": 45.0, "targetAllocation": 45.0 },
        "CompoundAdapter": { "address": "0xcc547a2b0f18b34095623809977d54cfe306bebf", "balance": 0.25, "apy": 2.44, "isHealthy": true,  "principal": 0.25, "accruedYield": 0.002, "allocation": 25.0, "targetAllocation": 25.0 },
        "MorphoAdapter":   { "address": "0x5f8a64bc67f23b8d5d02c7cfe187ad42d59f1d59", "balance": 0.30, "apy": 2.83, "isHealthy": true,  "principal": 0.30, "accruedYield": 0.001, "allocation": 30.0, "targetAllocation": 30.0 },
        "YieldMaxAdapter": { "address": "0x5ebd6f3da76c2b9c9d6aac89da08c388eab2b3cb", "balance": 0.00, "apy": 17.23,"isHealthy": true,  "principal": 0.00, "accruedYield": 0.000, "allocation": 0.0,  "targetAllocation": 0.0,
          "topPools": [
            { "protocol": "peapods-finance", "apy": 17.23 },
            { "protocol": "gains-network",   "apy": 10.13 },
            { "protocol": "tender-finance",  "apy": 9.62  },
            { "protocol": "deltaprime",      "apy": 8.02  },
            { "protocol": "woofi-earn",      "apy": 7.44  }
          ]
        }
      },
      "riskScores": {
        "AaveAdapter":     { "score": 20, "level": "SAFE"    },
        "CompoundAdapter": { "score": 13, "level": "SAFE"    },
        "MorphoAdapter":   { "score": 55, "level": "WARNING" },
        "YieldMaxAdapter": { "score": 28, "level": "WATCH"   }
      }
    }'
    echo "   ⚠️  Aave utilization 88.5% — risk score Morpho naik ke WARNING (55)"
    ;;

  critical)
    write_sim '{
      "active": true,
      "step": 4,
      "stepLabel": "Critical — YieldMax CRITICAL, funds evacuated",
      "totalValueUsd": 1.00,
      "totalAssets": 1.00,
      "totalChangePercent": 0.0,
      "totalChangeDirection": "neutral",
      "lastUpdated": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "adapters": {
        "AaveAdapter":     { "address": "0xb81961aa49d7e834404e299e688b3dc09a5efe5a", "balance": 0.450363, "apy": 1.50, "isHealthy": true,  "principal": 0.45, "accruedYield": 0.000363, "allocation": 45.0, "targetAllocation": 45.0 },
        "CompoundAdapter": { "address": "0xcc547a2b0f18b34095623809977d54cfe306bebf", "balance": 0.250202, "apy": 2.44, "isHealthy": true,  "principal": 0.25, "accruedYield": 0.000202, "allocation": 25.0, "targetAllocation": 25.0 },
        "MorphoAdapter":   { "address": "0x5f8a64bc67f23b8d5d02c7cfe187ad42d59f1d59", "balance": 0.300242, "apy": 2.83, "isHealthy": true,  "principal": 0.30, "accruedYield": 0.000242, "allocation": 30.0, "targetAllocation": 30.0 },
        "YieldMaxAdapter": { "address": "0x5ebd6f3da76c2b9c9d6aac89da08c388eab2b3cb", "balance": 0.00,     "apy": 17.23,"isHealthy": false, "principal": 0.00, "accruedYield": 0.000000, "allocation": 0.0,  "targetAllocation": 20.0,
          "topPools": [
            { "protocol": "peapods-finance", "apy": 17.23 },
            { "protocol": "gains-network",   "apy": 10.13 },
            { "protocol": "tender-finance",  "apy": 9.62  },
            { "protocol": "deltaprime",      "apy": 8.02  },
            { "protocol": "woofi-earn",      "apy": 7.44  }
          ]
        }
      },
      "riskScores": {
        "AaveAdapter":     { "score": 10, "level": "SAFE"     },
        "CompoundAdapter": { "score": 13, "level": "SAFE"     },
        "MorphoAdapter":   { "score": 35, "level": "WATCH"    },
        "YieldMaxAdapter": { "score": 96, "level": "CRITICAL" }
      }
    }'
    echo "   🚨  YieldMax CRITICAL (96) — status Unhealthy, alokasi dievakuasi ke 0%"
    ;;

  exploit)
    write_sim '{
      "active": true,
      "step": 5,
      "stepLabel": "Exploit — Active attack, funds drained from YieldMax",
      "totalValueUsd": 1.00,
      "totalAssets": 1.00,
      "totalChangePercent": 0.0,
      "totalChangeDirection": "down",
      "lastUpdated": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "adapters": {
        "AaveAdapter":     { "address": "0xb81961aa49d7e834404e299e688b3dc09a5efe5a", "balance": 0.450363, "apy": 1.50, "isHealthy": true,  "principal": 0.45, "accruedYield": 0.000363, "allocation": 45.0, "targetAllocation": 45.0 },
        "CompoundAdapter": { "address": "0xcc547a2b0f18b34095623809977d54cfe306bebf", "balance": 0.250202, "apy": 2.44, "isHealthy": true,  "principal": 0.25, "accruedYield": 0.000202, "allocation": 25.0, "targetAllocation": 25.0 },
        "MorphoAdapter":   { "address": "0x5f8a64bc67f23b8d5d02c7cfe187ad42d59f1d59", "balance": 0.300242, "apy": 2.83, "isHealthy": true,  "principal": 0.30, "accruedYield": 0.000242, "allocation": 30.0, "targetAllocation": 30.0 },
        "YieldMaxAdapter": { "address": "0x5ebd6f3da76c2b9c9d6aac89da08c388eab2b3cb", "balance": 0.00,     "apy": 0.00, "isHealthy": false, "principal": 0.00, "accruedYield": 0.000000, "allocation": 0.0,  "targetAllocation": 20.0,
          "topPools": []
        }
      },
      "riskScores": {
        "AaveAdapter":     { "score": 10,  "level": "SAFE"     },
        "CompoundAdapter": { "score": 13,  "level": "SAFE"     },
        "MorphoAdapter":   { "score": 35,  "level": "WATCH"    },
        "YieldMaxAdapter": { "score": 100, "level": "CRITICAL" }
      }
    }'
    echo "   💀  EXPLOIT AKTIF — YieldMax APY = 0%, saldo nol, score MAX (100)"
    echo "       ShieldYield telah mengamankan dana Aave/Compound/Morpho!"
    ;;

  recovery)
    write_sim '{
      "active": true,
      "step": 6,
      "stepLabel": "Recovery — YieldMax recovering back to SAFE",
      "totalValueUsd": 1.00,
      "totalAssets": 1.00,
      "totalChangePercent": 0.08,
      "totalChangeDirection": "up",
      "lastUpdated": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "adapters": {
        "AaveAdapter":     { "address": "0xb81961aa49d7e834404e299e688b3dc09a5efe5a", "balance": 0.45, "apy": 1.50, "isHealthy": true, "principal": 0.45, "accruedYield": 0.003, "allocation": 45.0, "targetAllocation": 45.0 },
        "CompoundAdapter": { "address": "0xcc547a2b0f18b34095623809977d54cfe306bebf", "balance": 0.25, "apy": 2.44, "isHealthy": true, "principal": 0.25, "accruedYield": 0.002, "allocation": 25.0, "targetAllocation": 25.0 },
        "MorphoAdapter":   { "address": "0x5f8a64bc67f23b8d5d02c7cfe187ad42d59f1d59", "balance": 0.30, "apy": 2.83, "isHealthy": true, "principal": 0.30, "accruedYield": 0.001, "allocation": 30.0, "targetAllocation": 30.0 },
        "YieldMaxAdapter": { "address": "0x5ebd6f3da76c2b9c9d6aac89da08c388eab2b3cb", "balance": 0.00, "apy": 11.40,"isHealthy": true, "principal": 0.00, "accruedYield": 0.000, "allocation": 0.0,  "targetAllocation": 0.0,
          "topPools": [
            { "protocol": "gains-network",   "apy": 11.40 },
            { "protocol": "tender-finance",  "apy": 9.62  },
            { "protocol": "deltaprime",      "apy": 8.02  },
            { "protocol": "woofi-earn",      "apy": 7.44  }
          ]
        }
      },
      "riskScores": {
        "AaveAdapter":     { "score": 10, "level": "SAFE" },
        "CompoundAdapter": { "score": 13, "level": "SAFE" },
        "MorphoAdapter":   { "score": 15, "level": "SAFE" },
        "YieldMaxAdapter": { "score": 22, "level": "SAFE" }
      }
    }'
    echo "   ✅  YieldMax PULIH — status kembali Healthy, score SAFE (22)"
    echo "       CRE akan mulai mempertimbangkan re-alokasi ke YieldMax"
    ;;

  help|*)
    print_help
    ;;

esac
