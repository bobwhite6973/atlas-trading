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

export default router;