import express from 'express';
import { getTrades, getActivePositions } from '../database/setup.js';
import { MarketDataService } from '../engine/marketData.js';

const router = express.Router();
const marketData = new MarketDataService();

let walletBal = { eth: 0, usdc: 0, total: 0 };
export function updateWallet(b) { walletBal = b; }

let engineRunning = false;
export function setEngineRunning(v) { engineRunning = v; }

// Dashboard summary
router.get('/summary', async (req, res) => {
  try {
    const trades = getTrades(100);
    const active = getActivePositions();
    
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winTrades = trades.filter(t => t.pnl > 0);
    const winRate = trades.length > 0 ? (winTrades.length / trades.length * 100).toFixed(1) : 0;
    
    // Get current prices for dashboard
    const prices = {};
    for (const pair of ['ETH/USDC', 'BTC/USDC', 'SOL/USDC', 'BNB/USDC', 'XRP/USDC', 'KAS/USDC']) {
      prices[pair] = await marketData.getCurrentPrice(pair);
    }
    
    res.json({
      status: 'running',
      engineRunning: engineRunning,
      uptime: process.uptime(),
      totalTrades: trades.length,
      activePositions: active.length,
      totalPnl: Math.round(totalPnl * 100) / 100,
      winRate: parseFloat(winRate),
      currentPrices: prices,
      wallet: walletBal,
      lastUpdate: Date.now()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All trades
router.get('/trades', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const trades = getTrades(limit);
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Active positions
router.get('/positions', (req, res) => {
  try {
    const positions = getActivePositions();
    res.json(positions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Market prices
router.get('/prices', async (req, res) => {
  try {
    const pairs = ['WETH/USDC', 'WBTC/USDC', 'WETH/USDT', 'ARB/USDC', 'MATIC/USDC', 'OP/USDC'];
    const prices = {};
    const research = {};
    
    for (const pair of pairs) {
      prices[pair] = await marketData.getCurrentPrice(pair);
    }
    
    res.json({ prices, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Research a pair
router.get('/research/:pair', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 400;
    const result = await marketData.deepResearch(req.params.pair, days);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// System config
router.get('/config', (req, res) => {
  res.json({
    maxDrawdown: process.env.MAX_DRAWDOWN || '15%',
    maxPositionSize: process.env.MAX_POSITION_SIZE || '30%',
    leverage: process.env.LEVERAGE || '3x',
    monitoredPairs: ['WETH/USDC', 'WBTC/USDC', 'WETH/USDT', 'ARB/USDC', 'MATIC/USDC', 'OP/USDC'],
    researchDepth: '400 days',
    checkInterval: '2 minutes'
  });
});

export default router;
