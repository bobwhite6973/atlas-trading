import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import apiRoutes from './routes/api.js';
import { TradingEngine } from './engine/tradingEngine.js';
import { MarketDataService } from './engine/marketData.js';
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
  
  // 3. Trading Engine
  const tradingEngine = new TradingEngine(marketData);
  
  // 4. Telegram notifier
  const telegram = new TelegramNotifier(process.env.TELEGRAM_BOT_TOKEN);
  
  // Start server
  app.listen(PORT, () => {
    console.log(`[Atlas] Dashboard server running on port ${PORT}`);
    console.log(`[Atlas] API: http://localhost:${PORT}/api`);
    
    // Start market monitoring
    tradingEngine.startMonitoring();
    telegram.sendAlert('🚀 Atlas Trading System is now LIVE and monitoring the market.');
  });
}

initialize().catch(err => {
  console.error('[Atlas] Initialization failed:', err);
  process.exit(1);
});

export default app;