# 💻 ShieldYield Frontend

The user-facing dashboard for ShieldYield. Built with **Next.js**, **Tailwind CSS**, and **Wagmi/Viem**.

## 🎨 Features

- **Real-Time Portfolio Tracking**: View your deposit value and yield across multiple chains.
- **Risk Visualization**: Dynamic "Guardian" indicators showing the health of each underlying protocol.
- **Vault Interface**: Easy deposit and withdrawal flow with multi-step transaction tracking.
- **Cross-Chain Status**: Monitor CCIP bridge transactions and claim funds on the Safe Haven chain.
- **Simulation Mode**: Integrated with the CRE simulation daemon to test "Shield" events in real-time.

## 🚀 Getting Started

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

### Build
```bash
npm run build
```

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS v4
- **Web3**: Wagmi, Viem, ConnectKit
- **AI Sentinel (Groq)**: Uses **Groq API** (Llama 3.1) for real-time risk assessment and sentiment analysis.
- **Data Feeds**:
  - **DeFiLlama**: Real-time APY and TVL metrics from the Llama Yields API.
  - **CryptoPanic**: Live crypto news aggregation for sentiment monitoring.
  - **GitHub API**: Monitoring repository activity for underlying protocols.
- **Icons**: Lucide React
- **Animations**: Framer Motion

---
✨ *Modern DeFi UI for maximum clarity and safety.*
