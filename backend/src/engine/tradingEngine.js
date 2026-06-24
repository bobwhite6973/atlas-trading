import { ethers } from 'ethers';
import { saveTrade } from '../database/setup.js';

const TRADING_PAIRS = [
  'ETH/USDC', 'BTC/USDC', 'SOL/USDC',
  'BNB/USDC', 'XRP/USDC', 'KAS/USDC'
];

export class TradingEngine {
  constructor(marketData) {
    this.marketData = marketData;
    this.provider = null;
    this.wallet = null;
    this.walletAddress = '0xb1567f3cD10b476A7673f2F87c8ECA832fCCC6a5';
    this.activePositions = new Map();
    this.monitoredPairs = new Map();
    this.isRunning = false;
    this.useDemoMode = true; // Safe default
    this.config = {
      maxDrawdown: 0.15,
      maxPositionSize: 0.15,
      leverageMultiplier: 3,
      minConfidence: 0.15,
      takeProfitMultiplier: 2.5,
      stopLossMultiplier: 0.5,
      pairResearchDays: 400,
      slippageTolerance: 0.01
    };
    
    // Start in demo mode immediately - try real connection in background
    console.log(`[TradingEngine] Starting in DEMO mode (wallet: ${this.walletAddress})`);
    if (process.env.BURNER_WALLET_PRIVATE_KEY) {
      console.log('[TradingEngine] Wallet private key configured, will attempt RPC connection...');
    }
    this.tryRealConnection();
  }

  async tryRealConnection() {
    try {
      const rpcUrl = process.env.ETH_RPC || 'https://ethereum-rpc.publicnode.com';
      
      // Test RPC
      const res = await fetch(rpcUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc:'2.0', method:'eth_blockNumber', params:[], id:1 })
      });
      const data = await res.json();
      if (!data.result) { console.log('[TradingEngine] RPC not responding - staying demo'); return; }
      
      // RPC works - go LIVE immediately
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.useDemoMode = false;
      console.log(`[TradingEngine] RPC OK - SWITCHED TO LIVE MODE`);
      
      // Connect wallet if key exists
      if (process.env.BURNER_WALLET_PRIVATE_KEY) {
        this.wallet = new ethers.Wallet(process.env.BURNER_WALLET_PRIVATE_KEY, this.provider);
        console.log(`[TradingEngine] Wallet ready: ${this.wallet.address}`);
      }
    } catch (err) {
      console.log('[TradingEngine] RPC failed:', err.message);
    }
  }

  async startMonitoring() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[TradingEngine] Starting market monitoring...');
    
    // Try to switch to LIVE mode
    if (this.useDemoMode && process.env.BURNER_WALLET_PRIVATE_KEY) {
      await this.tryRealConnection();
    }
    
    // Research all pairs first, then start monitoring
    for (const pair of TRADING_PAIRS) {
      await this.researchPair(pair);
    }
    console.log('[TradingEngine] All pairs researched, starting monitor loop...');
    this.monitorLoop();
  }

  async researchPair(pair) {
    console.log(`[TradingEngine] Researching ${pair}...`);
    try {
      const research = await this.marketData.deepResearch(pair, this.config.pairResearchDays);
      this.monitoredPairs.set(pair, {
        ...research,
        lastUpdated: Date.now(),
        strategy: this.determineStrategy(research),
        confidence: this.calculateConfidence(research)
      });
      console.log(`[Research] ${pair}: ${research.volatility?.toFixed(1) || '?'}% volatility, confidence ${this.monitoredPairs.get(pair).confidence.toFixed(2)}`);
      return research;
    } catch (err) {
      console.error(`[Research] Failed for ${pair}:`, err.message);
    }
  }

  determineStrategy(research) {
    if (!research || !research.volatility) return 'mean_reversion';
    if (research.volatility > 5) return 'trend_following';
    if (research.volatility > 2) return 'breakout';
    return 'mean_reversion';
  }

  calculateConfidence(research) {
    if (!research) return 0;
    let score = 0.5;
    if (research.dataPoints > 200) score += 0.15;
    if (research.dataPoints > 365) score += 0.15;
    if (research.avgVolume24h > 1000000) score += 0.1;
    if (research.supportLevel && research.resistanceLevel) score += 0.1;
    return Math.min(score, 1.0);
  }

  async monitorLoop() {
    while (this.isRunning) {
      try {
        const balance = await this.getWalletBalance();
        
        // Force trade on first empty pair every cycle
        let traded = false;
        
        for (const [pair, research] of this.monitoredPairs) {
          if (Date.now() - research.lastUpdated > 86400000) {
            this.researchPair(pair);
          }
          if (this.activePositions.has(pair)) continue;
          
          const currentPrice = await this.marketData.getCurrentPrice(pair);
          if (!currentPrice) continue;
          
          const signal = await this.evaluateEntry(pair, currentPrice, research);
          if (signal.shouldEnter && signal.confidence >= this.config.minConfidence) {
            await this.executeTrade({ pair, direction: signal.direction, price: currentPrice, confidence: signal.confidence, balance, strategy: research.strategy });
            traded = true;
          }
        }
        
        // If no pair triggered, force trade on first available pair
        if (!traded && balance > 5) {
          for (const [pair] of this.monitoredPairs) {
            if (this.activePositions.has(pair)) continue;
            const currentPrice = await this.marketData.getCurrentPrice(pair);
            if (currentPrice) {
              await this.executeTrade({ pair, direction: 'long', price: currentPrice, confidence: 0.5, balance, strategy: 'forced' });
              break;
            }
          }
        }
        
        await this.managePositions();
        await this.scanArbitrage();
      } catch (err) {
        console.error('[MonitorLoop] Error:', err.message);
      }
      await new Promise(r => setTimeout(r, 30000));
    }
  }

  async evaluateEntry(pair, currentPrice, research) {
    const signal = { shouldEnter: false, direction: 'long', confidence: 0, reason: [] };
    if (!research) return signal;
    
    const { supportLevel, resistanceLevel, avgPrice, volatility } = research;
    
    // Aggressive: trade on any small move
    if (currentPrice > avgPrice * 1.002) {
      signal.shouldEnter = true;
      signal.direction = 'long';
      signal.confidence = Math.min(0.3 + (volatility / 30), 0.9);
      signal.reason.push('Aggressive long');
    } else if (currentPrice < avgPrice * 0.998) {
      signal.shouldEnter = true;
      signal.direction = 'short';
      signal.confidence = Math.min(0.3 + (volatility / 30), 0.9);
      signal.reason.push('Aggressive short');
    } else {
      // Always enter if no strong signal - scalp small moves
      signal.shouldEnter = true;
      signal.direction = currentPrice > avgPrice ? 'long' : 'short';
      signal.confidence = 0.15;
      signal.reason.push('Scalp trade');
    }
    
    return signal;
  }

  async executeTrade(params) {
    const { pair, direction, price, confidence, balance, strategy } = params;
    
    if (this.useDemoMode || !this.wallet) {
      console.log(`[Demo] ${direction.toUpperCase()} ${pair} @ $${price.toFixed(2)} | Conf: ${confidence.toFixed(2)}`);
      this.simulateTrade(params);
      return;
    }
    
    try {
      const positionSize = Math.min(balance * this.config.maxPositionSize, await this.getMaxPositionSize());
      if (positionSize < 0.01) return;
      
      console.log(`[Trade] EXECUTING ${direction.toUpperCase()} ${pair} Size: $${positionSize.toFixed(2)}`);
      
      const position = {
        id: `${pair}-${Date.now()}`,
        pair, direction, entryPrice: price, positionSize,
        leverage: this.config.leverageMultiplier,
        effectiveSize: positionSize * this.config.leverageMultiplier,
        entryTime: Date.now(), strategy, confidence,
        takeProfit: direction === 'long' ? price * 1.015 : price * 0.985,
        stopLoss: direction === 'long' ? price * 0.995 : price * 1.005,
        status: 'open'
      };
      
      this.activePositions.set(pair, position);
      saveTrade(position);
      console.log(`[Trade] Position opened: ${position.id}`);
      console.log(`[Trade] TP: $${position.takeProfit.toFixed(2)} | SL: $${position.stopLoss.toFixed(2)}`);
    } catch (err) {
      console.error('[Trade] Execution error:', err.message);
    }
  }

  async managePositions() {
    for (const [pair, position] of this.activePositions) {
      if (position.status !== 'open') continue;
      const currentPrice = await this.marketData.getCurrentPrice(pair);
      if (!currentPrice) continue;
      
      if (position.direction === 'long' && currentPrice <= position.stopLoss) {
        await this.closePosition(pair, currentPrice, 'stop_loss');
      } else if (position.direction === 'short' && currentPrice >= position.stopLoss) {
        await this.closePosition(pair, currentPrice, 'stop_loss');
      } else if (position.direction === 'long' && currentPrice >= position.takeProfit) {
        await this.closePosition(pair, currentPrice, 'take_profit');
      } else if (position.direction === 'short' && currentPrice <= position.takeProfit) {
        await this.closePosition(pair, currentPrice, 'take_profit');
      } else if (Date.now() - position.entryTime > 172800000) {
        await this.closePosition(pair, currentPrice, 'time_exit');
      }
    }
  }

  async closePosition(pair, exitPrice, reason) {
    const position = this.activePositions.get(pair);
    if (!position) return;
    
    const pnl = position.direction === 'long'
      ? ((exitPrice - position.entryPrice) / position.entryPrice) * position.effectiveSize
      : ((position.entryPrice - exitPrice) / position.entryPrice) * position.effectiveSize;
    
    position.status = 'closed';
    position.exitPrice = exitPrice;
    position.pnl = pnl;
    position.closeReason = reason;
    position.closeTime = Date.now();
    
    console.log(`[Trade] CLOSED ${pair} | ${reason} | PnL: ${pnl.toFixed(2)}`);
    saveTrade(position);
    this.activePositions.delete(pair);
  }

  async getWalletBalance() {
    const rpcUrl = process.env.ETH_RPC || 'https://ethereum-rpc.publicnode.com';
    try {
      // Check ETH balance
      const ethRes = await fetch(rpcUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc:'2.0', method:'eth_getBalance', params:[this.walletAddress,'latest'], id:1 })
      });
      const ethData = await ethRes.json();
      const ethBalance = ethData.result ? parseInt(ethData.result, 16) / 1e18 : 0;
      const ethUsd = ethBalance * 1662;
      
      // Check USDC balance
      const usdcRes = await fetch(rpcUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc:'2.0', method:'eth_call', params:[{to:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', data:'0x70a08231000000000000000000000000'+this.walletAddress.slice(2)},'latest'], id:2 })
      });
      const usdcData = await usdcRes.json();
      const usdcBalance = usdcData.result ? parseInt(usdcData.result, 16) / 1e6 : 0;
      
      const total = ethUsd + usdcBalance;
      console.log(`[Wallet] ETH: ${ethBalance.toFixed(4)} (${ethUsd.toFixed(2)}) | USDC: ${usdcBalance.toFixed(2)} | Total: ${total.toFixed(2)}`);
      return total;
    } catch (err) {
      console.log('[Wallet] Check failed:', err.message);
      return 0;
    }
  }

  async getMaxPositionSize() { return 500; }
  async scanArbitrage() {}

  simulateTrade(params) {
    // Demo mode - log the trade
  }

  stop() { this.isRunning = false; console.log('[TradingEngine] Stopped.'); }
}
