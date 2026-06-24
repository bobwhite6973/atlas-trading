import express from 'express';
import { setEngineRunning } from './api.js';
const router = express.Router();

let tradingEngineRef = null;
let telegramRef = null;

export function setEngineRef(engine) { tradingEngineRef = engine; }
export function setTelegramRef(tg) { telegramRef = tg; }

router.get('/status', (req, res) => {
  res.json({
    running: tradingEngineRef?.isRunning || false,
    mode: tradingEngineRef?.useDemoMode ? 'demo' : 'live',
    wallet: tradingEngineRef?.walletAddress || 'N/A',
    hasRealWallet: tradingEngineRef?.wallet ? true : false,
    liveTrading: tradingEngineRef?.liveTradingEnabled || false,
    activePositions: tradingEngineRef?.activePositions?.size || 0,
    monitoredPairs: Array.from(tradingEngineRef?.monitoredPairs?.keys() || [])
  });
});

router.get('/diagnostics', async (req, res) => {
  const hasKey = !!process.env.BURNER_WALLET_PRIVATE_KEY;
  let ethersWalletTest = null;
  let walletError = null;
  try {
    const { ethers } = await import('ethers');
    if (hasKey) {
      try {
        const w = new ethers.Wallet(process.env.BURNER_WALLET_PRIVATE_KEY);
        ethersWalletTest = { address: w.address, success: true };
      } catch (e) {
        walletError = e.message;
        ethersWalletTest = { success: false, error: e.message };
      }
    }
  } catch (e) {
    walletError = 'ethers import failed: ' + e.message;
  }

  res.json({
    env: {
      hasBurnerKey: hasKey,
      keyPrefix: hasKey ? process.env.BURNER_WALLET_PRIVATE_KEY.substring(0, 10) + '...' : 'NOT SET',
      keyLength: hasKey ? process.env.BURNER_WALLET_PRIVATE_KEY.length : 0,
      hasRpc: !!process.env.ETH_RPC,
      rpcUrl: process.env.ETH_RPC || 'NOT SET',
      hasTelegramBot: !!process.env.TELEGRAM_BOT_TOKEN,
      hasTelegramChat: !!process.env.TELEGRAM_CHAT_ID
    },
    ethersWalletTest,
    walletError,
    engine: {
      mode: tradingEngineRef?.useDemoMode ? 'demo' : 'live',
      running: tradingEngineRef?.isRunning || false,
      hasWalletInstance: tradingEngineRef?.wallet ? true : false,
      walletAddress: tradingEngineRef?.walletAddress || 'N/A'
    }
  });
});

router.post('/start', (req, res) => {
  if (!tradingEngineRef) return res.status(500).json({ error: 'Engine not initialized' });
  tradingEngineRef.startMonitoring();
  setEngineRunning(true);
  if (telegramRef) telegramRef.sendAlert('▶️ Trading engine STARTED');
  res.json({ status: 'started' });
});

router.post('/stop', (req, res) => {
  if (!tradingEngineRef) return res.status(500).json({ error: 'Engine not initialized' });
  tradingEngineRef.stop();
  setEngineRunning(false);
  if (telegramRef) telegramRef.sendAlert('⏸️ Trading engine STOPPED');
  res.json({ status: 'stopped' });
});

router.post('/go-live', async (req, res) => {
  if (!tradingEngineRef) return res.status(500).json({ error: 'Engine not initialized' });
  if (!tradingEngineRef.wallet) return res.status(400).json({ error: 'No wallet connected' });
  if (!tradingEngineRef.dexExecutor) return res.status(400).json({ error: 'No DEX executor available' });
  
  tradingEngineRef.useDemoMode = false;
  tradingEngineRef.liveTradingEnabled = true;
  console.log('[Control] 🔴 SWITCHED TO LIVE TRADING - real swaps enabled');
  if (telegramRef) telegramRef.sendAlert('🔴 LIVE TRADING ENABLED - real on-chain swaps will execute');
  res.json({ status: 'live', message: 'Live trading enabled. Real on-chain swaps will execute.' });
});

router.post('/go-demo', (req, res) => {
  if (!tradingEngineRef) return res.status(500).json({ error: 'Engine not initialized' });
  tradingEngineRef.useDemoMode = true;
  tradingEngineRef.liveTradingEnabled = false;
  console.log('[Control] 🟢 SWITCHED TO DEMO MODE');
  if (telegramRef) telegramRef.sendAlert('🟢 DEMO MODE - no real swaps');
  res.json({ status: 'demo', message: 'Demo mode enabled. No real swaps.' });
});

export default router;