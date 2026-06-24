# Atlas Trading Systems

Autonomous DeFi trading system. No centralized exchange API required.
Uses on-chain DEX aggregation (1inch, Uniswap) + AAVE flash loans for leverage.

## Quick Start
1. `cd backend && npm install`
2. Copy `.env` and add your config
3. `npm start` (runs on port 3000)

## Architecture
- **Backend**: Node.js + Express (trading engine)
- **Frontend**: React + Vite (dashboard)
- **AI**: Python research engine (historical analysis)
- **Database**: SQLite (via sql.js)
- **Alerts**: Telegram bot
- **DeFi**: Direct on-chain via ethers.js
