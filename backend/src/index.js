import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import apiRoutes from './routes/api.js';
import controlRoutes, { setEngineRef, setTelegramRef } from './routes/control.js';
import { updateWallet } from './routes/api.js';
import { TradingEngine } from './engine/tradingEngine.js';
import { MarketDataService } from './engine/marketData.js';
import { CopyTrader } from './engine/copyTrader.js';
import { setupDatabase } from './database/setup.js';
import { TelegramNotifier } from './utils/telegram.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static frontend if built
app.use(express.static(path.join(__dirname, '../../frontend-react/dist')));

// API Routes
app.use('/api', apiRoutes);
app.use('/api/control', controlRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'running', uptime: process.uptime() });
});

// Initialize all systems
async function initialize() {
  console.log('[Atlas] Initializing systems...');
  
  // 1. Database
  await setupDatabase();
  
  // 2. Market Data Service
  const marketData = new MarketDataService();
  
  // 3. Trading Engine (standby - start via dashboard/telegram)
  const tradingEngine = new TradingEngine(marketData);
  setEngineRef(tradingEngine);
  
  // 4. Telegram notifier
  const telegram = new TelegramNotifier(process.env.TELEGRAM_BOT_TOKEN);
  setTelegramRef(telegram);
  
  // 5. Copy Trader
  const copyTrader = new CopyTrader(marketData, tradingEngine, telegram);
  
  // 6. Wallet balance checker
  async function checkWallet() {
    try {
      const bal = await tradingEngine.getWalletBalance();
      updateWallet({ eth: bal * 0.3, usdc: bal * 0.7, total: bal });
    } catch { /* ignore */ }
  }
  
  // Start server
  app.listen(PORT, () => {
    console.log(`[Atlas] Dashboard server running on port ${PORT}`);
    console.log(`[Atlas] API: http://localhost:${PORT}/api`);
    console.log(`[Atlas] ⏸️ Trading in STANDBY - start from dashboard or Telegram`);
    
    // Research pairs in background but don't trade
    tradingEngine.monitoredPairs = new Map();
    for (const pair of ['ETH/USDC', 'BTC/USDC', 'SOL/USDC', 'BNB/USDC', 'XRP/USDC', 'KAS/USDC']) {
      tradingEngine.researchPair(pair);
    }
    
    // Copy trader analysis
    copyTrader.initialize();
    
    // Check wallet
    checkWallet();
    setInterval(checkWallet, 60000);
    
    telegram.sendAlert('🚀 Atlas Trading System deployed. Use /start to begin trading.');
  });
}

initialize().catch(err => {
  console.error('[Atlas] Initialization failed:', err);
  process.exit(1);
});

export default app;