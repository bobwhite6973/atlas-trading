// CopyTrader - Analyzes on-chain DEX data to find profitable wallets and copy-trade them
// Uses Uniswap V3 subgraph data (no CEX API)

const PROFITABLE_WALLETS_CACHE = new Map();
const WHALE_TRACKING = new Map();
const COPY_TRADE_ACTIVE = new Map();

const TRACKED_PAIRS = {
  'ETH/USDC': {
    subgraph: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
    pool: '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8',
    token0: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    token1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  },
  'BTC/USDC': {
    subgraph: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
    pool: '0x99ac8ca7087fa4a2a1fb6357269965a2014abc35',
    token0: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    token1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  }
};

export class CopyTrader {
  constructor(marketData, tradingEngine, telegram) {
    this.marketData = marketData;
    this.tradingEngine = tradingEngine;
    this.telegram = telegram;
    this.topWallets = new Map(); // pair -> [{address, score, profit, trades}]
    this.isMonitoring = false;
  }

  async initialize() {
    console.log('[CopyTrader] Analyzing top profitable wallets...');
    for (const [pair, config] of Object.entries(TRACKED_PAIRS)) {
      try {
        const wallets = await this.findProfitableWallets(pair, config);
        this.topWallets.set(pair, wallets.slice(0, 20));
        console.log(`[CopyTrader] ${pair}: Found ${Math.min(wallets.length, 20)} profitable wallets`);
      } catch (err) {
        console.error(`[CopyTrader] Error analyzing ${pair}:`, err.message);
      }
    }
  }

  async findProfitableWallets(pair, config) {
    // Query Uniswap V3 subgraph for recent swaps and analyze wallet profitability
    const query = `{
      swaps(first: 1000, orderBy: timestamp, orderDirection: desc, where: {pool: "${config.pool}"}) {
        sender
        recipient
        amount0
        amount1
        amountUSD
        timestamp
        origin
      }
    }`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(config.subgraph, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) return [];
      const data = await res.json();
      const swaps = data?.data?.swaps || [];

      // Analyze wallet performance
      const walletStats = new Map();
      for (const swap of swaps) {
        const wallet = swap.origin || swap.sender;
        if (!wallet || wallet === '0x0000000000000000000000000000000000000000') continue;

        if (!walletStats.has(wallet)) {
          walletStats.set(wallet, { trades: 0, totalVolume: 0, winTrades: 0, address: wallet, score: 0 });
        }
        const stats = walletStats.get(wallet);
        stats.trades++;
        stats.totalVolume += Math.abs(parseFloat(swap.amountUSD) || 0);

        // Simple profitability heuristic: frequent traders with high volume
        if (Math.abs(parseFloat(swap.amountUSD) || 0) > 10000) {
          stats.winTrades++;
        }
      }

      // Score and rank wallets
      const ranked = Array.from(walletStats.values())
        .map(w => ({
          address: w.address,
          trades: w.trades,
          totalVolume: w.totalVolume,
          score: (w.winTrades / Math.max(w.trades, 1)) * (w.totalVolume > 100000 ? 2 : 1),
          profit: (w.winTrades / Math.max(w.trades, 1)) * w.totalVolume * 0.01
        }))
        .filter(w => w.trades > 5 && w.totalVolume > 50000) // Minimum thresholds
        .sort((a, b) => b.score - a.score);

      return ranked;
    } catch {
      return [];
    }
  }

  async startMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    console.log('[CopyTrader] Starting whale monitoring...');
    this.monitorLoop();
  }

  async monitorLoop() {
    while (this.isMonitoring) {
      try {
        for (const [pair, wallets] of this.topWallets) {
          if (wallets.length === 0) continue;

          // Check recent activity from top wallets
          const top20 = wallets.slice(0, 20);
          for (const wallet of top20) {
            const activity = await this.checkWalletActivity(pair, wallet.address);
            if (activity && activity.shouldCopy) {
              await this.executeCopyTrade(pair, activity, wallet);
            }
          }
        }
      } catch (err) {
        console.error('[CopyTrader] Monitor error:', err.message);
      }
      // Check every 3 minutes
      await new Promise(r => setTimeout(r, 180000));
    }
  }

  async checkWalletActivity(pair, walletAddress) {
    const config = TRACKED_PAIRS[pair];
    if (!config) return null;

    // Query recent swaps from this wallet
    const query = `{
      swaps(first: 3, orderBy: timestamp, orderDirection: desc, where: {pool: "${config.pool}", origin: "${walletAddress}"}) {
        amount0
        amount1
        amountUSD
        timestamp
        sender
      }
    }`;

    try {
      const res = await fetch(config.subgraph, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      if (!res.ok) return null;
      const data = await res.json();
      const swaps = data?.data?.swaps || [];
      if (swaps.length === 0) return null;

      const recentSwap = swaps[0];
      const timeSince = Date.now() / 1000 - parseFloat(recentSwap.timestamp);

      // Only copy trades from last 5 minutes
      if (timeSince > 300) return null;

      const amountUSD = Math.abs(parseFloat(recentSwap.amountUSD) || 0);
      if (amountUSD < 5000) return null; // Skip small trades

      // Determine direction
      const amount0 = parseFloat(recentSwap.amount0);
      const isBuy = amount0 < 0; // Selling token0 = buying token1 (USDC) ... simplified

      return {
        shouldCopy: true,
        direction: isBuy ? 'long' : 'short',
        amountUSD,
        confidence: Math.min(amountUSD / 50000, 0.95),
        walletAddress
      };
    } catch {
      return null;
    }
  }

  async executeCopyTrade(pair, activity, wallet) {
    if (!this.tradingEngine) return;

    const action = activity.direction === 'long' ? 'BUY' : 'SELL';
    const msg = `🐋 Copy Trade Signal: ${action} ${pair}\nWallet: ${wallet.address.slice(0,10)}...\nAmount: $${(activity.amountUSD * 0.1).toFixed(0)} (10% of whale)\nScore: ${wallet.score.toFixed(2)}`;

    console.log(`[CopyTrader] ${msg}`);

    if (this.telegram) {
      this.telegram.sendAlert(msg);
    }

    // Execute trade at 10% of whale size
    await this.tradingEngine.executeTrade({
      pair,
      direction: activity.direction,
      price: await this.marketData.getCurrentPrice(pair),
      confidence: activity.confidence,
      balance: activity.amountUSD * 0.1,
      strategy: 'copy_trade'
    });
  }

  stop() {
    this.isMonitoring = false;
    console.log('[CopyTrader] Stopped.');
  }
}