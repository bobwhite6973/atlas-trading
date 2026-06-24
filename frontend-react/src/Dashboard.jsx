import React, { useState, useEffect, useCallback } from 'react';

// Backend API URL - change this to your Railway URL
const API_BASE = import.meta.env.VITE_API_URL || 'https://atlas-trading-production-9fd5.up.railway.app/api';
const PAIRS = ['ETH/USDC', 'BTC/USDC', 'SOL/USDC', 'BNB/USDC', 'XRP/USDC', 'KAS/USDC'];

function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [trades, setTrades] = useState([]);
  const [research, setResearch] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedPair, setSelectedPair] = useState('ETH/USDC');

  const toggleEngine = async () => {
    try {
      const res = await fetch(`${API_BASE}/control/status`);
      const data = await res.json();
      const endpoint = data.running ? 'control/stop' : 'control/start';
      await fetch(`${API_BASE}/${endpoint}`, { method: 'POST' });
    } catch (e) {}
  };

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/summary`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (e) {}
  }, []);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/trades`);
      if (res.ok) {
        const data = await res.json();
        setTrades(data);
      }
    } catch (e) {}
  }, []);

  const fetchResearch = useCallback(async (pair) => {
    try {
      const res = await fetch(`${API_BASE}/research/${pair}?days=400`);
      if (res.ok) {
        const data = await res.json();
        setResearch(prev => ({ ...prev, [pair]: data }));
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchTrades();
    PAIRS.forEach(p => fetchResearch(p));
    setLoading(false);
    const interval = setInterval(() => { fetchSummary(); fetchTrades(); }, 5000);
    return () => clearInterval(interval);
  }, [fetchSummary, fetchTrades, fetchResearch]);

  const formatTime = (ts) => {
    if (!ts) return '\u2014';
    return new Date(Number(ts)).toLocaleString();
  };

  const formatUsd = (val) => {
    if (val === null || val === undefined) return '$0.00';
    return `$${(Math.round(val * 100) / 100).toFixed(2)}`;
  };

  const card = { background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' };
  const cardVal = { fontSize: 28, fontWeight: 700, color: '#e2e8f0', marginTop: 4 };

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', color: '#e2e8f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <header style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, background: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Atlas Trading Systems</h1>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Autonomous DeFi Trading - No CEX API - 3x Flash Loan Leverage</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: summary?.status === 'running' ? '#4ade80' : '#f87171', fontSize: 14 }}>{summary?.status === 'running' ? 'LIVE' : 'Starting...'}</span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>|</span>
          <span style={{ fontSize: 12, color: '#e2e8f0' }}>💰 ${summary?.wallet?.total?.toFixed(2) || '0.00'}</span>
          <button onClick={toggleEngine} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: summary?.status === 'running' ? '#dc2626' : '#059669',
            color: 'white', fontWeight: 600, fontSize: 12
          }}>
            {summary?.status === 'running' ? '⏹ STOP' : '▶ START'}
          </button>
          <span style={{ fontSize: 12, color: '#64748b' }}>{new Date().toLocaleString()}</span>
        </div>
      </header>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 4, padding: '16px 24px 0', borderBottom: '1px solid #334155' }}>
        {[{ id: 'dashboard', label: 'Dashboard' }, { id: 'research', label: 'Research' }, { id: 'config', label: 'Config' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', borderRadius: '8px 8px 0 0',
              background: activeTab === tab.id ? '#1e293b' : 'transparent', color: activeTab === tab.id ? '#e2e8f0' : '#64748b', fontWeight: activeTab === tab.id ? 600 : 400 }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 24 }}>
        {activeTab === 'dashboard' && (
          <>
            {/* Status + KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Active Positions</div><div style={cardVal}>{summary?.activePositions || 0}</div></div>
              <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Total Trades</div><div style={cardVal}>{summary?.totalTrades || 0}</div></div>
              <div style={{ ...card, borderColor: (summary?.totalPnl || 0) >= 0 ? '#05966988' : '#dc262688' }}>
                <div style={{ fontSize: 14, color: '#94a3b8' }}>Total PnL</div>
                <div style={{ ...cardVal, color: (summary?.totalPnl || 0) >= 0 ? '#4ade80' : '#f87171' }}>{summary ? formatUsd(summary.totalPnl) : '$0.00'}</div>
              </div>
              <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Win Rate</div><div style={cardVal}>{summary ? `${summary.winRate.toFixed(1)}%` : '0%'}</div></div>
            </div>

            {/* Prices */}
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#e2e8f0' }}>Market Prices</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
              {PAIRS.map(pair => {
                const price = summary?.currentPrices?.[pair];
                const r = research[pair];
                return (
                  <div key={pair} style={{ ...card, cursor: 'pointer', padding: 16 }} onClick={() => { setSelectedPair(pair); setActiveTab('research'); }}>
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>{pair}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginTop: 4 }}>{price ? `$${price.toFixed(2)}` : '\u2014'}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Vol: {r?.volatility ? `${r.volatility.toFixed(1)}%` : '...'}</div>
                  </div>
                );
              })}
            </div>

            {/* Trades Table */}
            <div style={card}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#e2e8f0' }}>Recent Trades</h2>
              {trades.length === 0 ? (
                <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>No trades yet. AI is researching and waiting for entries.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead><tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Pair</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Dir</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Entry</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Exit</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>PnL</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Reason</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Time</th>
                    </tr></thead>
                    <tbody>
                      {trades.slice(0, 25).map(t => (
                        <tr key={t.id} style={{ borderBottom: '1px solid #1e293b' }}>
                          <td style={{ padding: '8px 12px' }}>{t.pair}</td>
                          <td style={{ padding: '8px 12px', color: t.direction === 'long' ? '#4ade80' : '#f87171' }}>{t.direction?.toUpperCase()}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>${parseFloat(t.entry_price || 0).toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{t.exit_price ? `$${parseFloat(t.exit_price).toFixed(2)}` : '\u2014'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: parseFloat(t.pnl || 0) >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                            ${parseFloat(t.pnl || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '8px 12px' }}>{t.close_reason || (t.status === 'open' ? 'OPEN' : '\u2014')}</td>
                          <td style={{ padding: '8px 12px', fontSize: 12 }}>{formatTime(t.entry_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'research' && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {PAIRS.map(p => (
                <button key={p} onClick={() => setSelectedPair(p)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none',
                    background: selectedPair === p ? '#0d7377' : '#334155',
                    color: 'white', cursor: 'pointer', fontWeight: selectedPair === p ? 600 : 400 }}>
                  {p}
                </button>
              ))}
            </div>
            {research[selectedPair] ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
                  <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Current Price</div><div style={cardVal}>${research[selectedPair].currentPrice?.toFixed(2)}</div></div>
                  <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Avg Price (400d)</div><div style={cardVal}>${research[selectedPair].avgPrice?.toFixed(2)}</div></div>
                  <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Volatility</div><div style={{ ...cardVal, color: '#f59e0b' }}>{research[selectedPair].volatility?.toFixed(1)}%</div></div>
                  <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Support</div><div style={{ ...cardVal, color: '#4ade80', fontSize: 22 }}>${research[selectedPair].supportLevel?.toFixed(2)}</div></div>
                  <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Resistance</div><div style={{ ...cardVal, color: '#f87171', fontSize: 22 }}>${research[selectedPair].resistanceLevel?.toFixed(2)}</div></div>
                  <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>24h Avg Volume</div><div style={{ ...cardVal, fontSize: 20, color: '#60a5fa' }}>${research[selectedPair].avgVolume24h ? `${(research[selectedPair].avgVolume24h / 1000000).toFixed(1)}M` : '\u2014'}</div></div>
                </div>

                {/* Mini Chart */}
                <div style={{ ...card, marginBottom: 20 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#e2e8f0' }}>Price History (Last 30 Days)</h3>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 150 }}>
                    {research[selectedPair].priceHistory?.map((price, i) => {
                      const prices = research[selectedPair].priceHistory;
                      const min = Math.min(...prices);
                      const max = Math.max(...prices);
                      const range = max - min || 1;
                      const h = ((price - min) / range) * 130 + 10;
                      return <div key={i} style={{ flex: 1, height: h, background: price > research[selectedPair].avgPrice ? '#4ade80' : '#f87171', borderRadius: '2px 2px 0 0', opacity: 0.7 }} title={`$${price.toFixed(2)}`} />;
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 11, marginTop: 4 }}><span>30d ago</span><span>Now</span></div>
                </div>

                <div style={card}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>AI Research Summary</h3>
                  <div style={{ color: '#cbd5e1', lineHeight: 1.8 }}>
                    <p>Strategy: <strong>{research[selectedPair].volatility > 5 ? 'Trend Following' : research[selectedPair].volatility > 2 ? 'Breakout Trading' : 'Mean Reversion'}</strong></p>
                    <p>Entry Zone: ${research[selectedPair].supportLevel?.toFixed(2)} - ${research[selectedPair].resistanceLevel?.toFixed(2)}</p>
                    <p>Data Points: {research[selectedPair].dataPoints} days analyzed</p>
                    <p>Updated: {formatTime(research[selectedPair].timestamp)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: '#64748b', textAlign: 'center', padding: 60 }}>Researching {selectedPair} - analyzing 400 days...</div>
            )}
          </>
        )}

        {activeTab === 'config' && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#e2e8f0' }}>System Config</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Max Drawdown</div><div style={cardVal}>15%</div><div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Hard stop</div></div>
              <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Max Position Size</div><div style={cardVal}>30%</div><div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Per trade</div></div>
              <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Leverage</div><div style={{ ...cardVal, color: '#f59e0b' }}>3x</div><div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Flash loans + AAVE</div></div>
              <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Min Confidence</div><div style={cardVal}>65%</div><div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>AI threshold to trade</div></div>
              <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Research Depth</div><div style={cardVal}>400 days</div><div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Per pair</div></div>
              <div style={card}><div style={{ fontSize: 14, color: '#94a3b8' }}>Check Interval</div><div style={cardVal}>2 min</div><div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Market scan</div></div>
            </div>
            <div style={{ ...card, marginTop: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#e2e8f0' }}>Trading Rules</h3>
              <ul style={{ color: '#cbd5e1', lineHeight: 2.2, paddingLeft: 20 }}>
                <li>AI researches 400 days per pair before first trade</li>
                <li>Fully autonomous - no manual approval for trades</li>
                <li>3x leverage via flash loans (no CEX margin API)</li>
                <li>TP at 2.5x ATR / SL at 0.5x ATR</li>
                <li>Max 48h position hold</li>
                <li>Telegram alerts for all closures & errors</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
