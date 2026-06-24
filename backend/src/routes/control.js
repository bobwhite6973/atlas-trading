import express from 'express';
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
    activePositions: tradingEngineRef?.activePositions?.size || 0,
    monitoredPairs: Array.from(tradingEngineRef?.monitoredPairs?.keys() || [])
  });
});

router.post('/start', (req, res) => {
  if (!tradingEngineRef) return res.status(500).json({ error: 'Engine not initialized' });
  tradingEngineRef.startMonitoring();
  if (telegramRef) telegramRef.sendAlert('▶️ Trading engine STARTED');
  res.json({ status: 'started' });
});

router.post('/stop', (req, res) => {
  if (!tradingEngineRef) return res.status(500).json({ error: 'Engine not initialized' });
  tradingEngineRef.stop();
  if (telegramRef) telegramRef.sendAlert('⏸️ Trading engine STOPPED');
  res.json({ status: 'stopped' });
});

export default router;