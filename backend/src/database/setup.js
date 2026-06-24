import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

export async function setupDatabase() {
  const SQL = await initSqlJs();
  
  const dbPath = path.join(__dirname, '../../../data/atlas.db');
  const dataDir = path.dirname(dbPath);
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      pair TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry_price REAL NOT NULL,
      exit_price REAL,
      position_size REAL NOT NULL,
      leverage INTEGER DEFAULT 1,
      pnl REAL,
      strategy TEXT,
      confidence REAL,
      entry_time INTEGER NOT NULL,
      exit_time INTEGER,
      close_reason TEXT,
      status TEXT DEFAULT 'open'
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS pair_research (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair TEXT NOT NULL,
      base_price REAL,
      avg_price REAL,
      volatility REAL,
      support_level REAL,
      resistance_level REAL,
      avg_volume REAL,
      data_points INTEGER,
      strategy TEXT,
      confidence REAL,
      researched_at INTEGER NOT NULL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS system_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      message TEXT,
      data TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  
  // Save
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  
  console.log('[Database] Initialized successfully');
  return db;
}

export function getDb() {
  return db;
}

export function saveTrade(trade) {
  if (!db) return;
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO trades (id, pair, direction, entry_price, exit_price, position_size, leverage, pnl, strategy, confidence, entry_time, exit_time, close_reason, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run([
    trade.id,
    trade.pair,
    trade.direction,
    trade.entryPrice,
    trade.exitPrice || null,
    trade.positionSize || 0,
    trade.leverage || 1,
    trade.pnl || null,
    trade.strategy || '',
    trade.confidence || 0,
    trade.entryTime,
    trade.closeTime || null,
    trade.closeReason || null,
    trade.status || 'open'
  ]);
  
  stmt.free();
  
  const dbPath = path.join(__dirname, '../../../data/atlas.db');
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

export function getTrades(limit = 50) {
  if (!db) return [];
  const stmt = db.prepare('SELECT * FROM trades ORDER BY entry_time DESC LIMIT ?');
  stmt.bind([limit]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export function getActivePositions() {
  if (!db) return [];
  const stmt = db.prepare("SELECT * FROM trades WHERE status = 'open'");
  stmt.bind([]);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export function saveEvent(type, message, data = null) {
  if (!db) return;
  db.run('INSERT INTO system_events (type, message, data, created_at) VALUES (?, ?, ?, ?)', [
    type, message, data ? JSON.stringify(data) : null, Date.now()
  ]);
}
