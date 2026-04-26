// MREM v3 — Device Registry
// SQLite-backed device tracking: first/last seen, re-appearance detection, watchlist

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const path = require('path');
const fs = require('fs');

let db;
const watchers = new Map(); // eventName → [callbacks]

function emit(event, data) {
    if (watchers.has(event)) watchers.get(event).forEach(fn => fn(data));
}

function on(event, fn) {
    if (!watchers.has(event)) watchers.set(event, []);
    watchers.get(event).push(fn);
}

function init() {
    const dbPath = path.resolve(__dirname, '..', config.paths.db);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);

    db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      protocol          TEXT NOT NULL,
      identifier        TEXT NOT NULL,
      display_name      TEXT,
      vendor            TEXT,
      device_type       TEXT,
      first_seen        INTEGER NOT NULL,
      last_seen         INTEGER NOT NULL,
      appearance_count  INTEGER DEFAULT 1,
      last_rssi         INTEGER,
      on_watchlist      INTEGER DEFAULT 0,
      metadata_json     TEXT,
      UNIQUE(protocol, identifier)
    );

    CREATE TABLE IF NOT EXISTS rssi_history (
      device_id   INTEGER NOT NULL,
      timestamp   INTEGER NOT NULL,
      rssi        INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rssi_device ON rssi_history(device_id, timestamp);

    CREATE TABLE IF NOT EXISTS scan_sessions (
      session_id    TEXT PRIMARY KEY,
      started_at    INTEGER,
      completed_at  INTEGER,
      wifi_count    INTEGER DEFAULT 0,
      ble_count     INTEGER DEFAULT 0,
      nmap_count    INTEGER DEFAULT 0,
      exposure_index REAL DEFAULT 0,
      snapshot_json TEXT,
      notes         TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      fired_at      INTEGER NOT NULL,
      alert_type    TEXT,
      severity      TEXT,
      source        TEXT,
      description   TEXT,
      acknowledged  INTEGER DEFAULT 0
    );
  `);

    console.log('[DeviceRegistry] Database initialized at', dbPath);
    return db;
}

function getDb() { return db; }

/**
 * Upsert a device record. Detects new devices and re-appearances.
 * @param {string} protocol  wifi | ble | nmap | arp
 * @param {string} identifier  canonical ID (BSSID / BLE MAC / IP:MAC)
 * @param {object} fields  { display_name, vendor, device_type, last_rssi, metadata_json }
 * @returns { device, isNew, isReturn }
 */
function upsertDevice(protocol, identifier, fields = {}) {
    const now = Date.now();
    const existing = db.prepare('SELECT * FROM devices WHERE protocol=? AND identifier=?').get(protocol, identifier);

    if (!existing) {
        const info = db.prepare(`
      INSERT INTO devices (protocol, identifier, display_name, vendor, device_type, first_seen, last_seen, appearance_count, last_rssi, on_watchlist, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?)
    `).run(
            protocol,
            identifier,
            fields.display_name || null,
            fields.vendor || null,
            fields.device_type || null,
            now, now,
            fields.last_rssi || null,
            fields.metadata_json ? JSON.stringify(fields.metadata_json) : null
        );
        const device = db.prepare('SELECT * FROM devices WHERE id=?').get(info.lastInsertRowid);
        emit('device_new', device);
        checkWatchlist(device);
        return { device, isNew: true, isReturn: false };
    } else {
        const gapMs = now - existing.last_seen;
        const isReturn = gapMs > 60000;

        db.prepare(`
      UPDATE devices SET
        display_name = COALESCE(?, display_name),
        vendor = COALESCE(?, vendor),
        device_type = COALESCE(?, device_type),
        last_seen = ?,
        appearance_count = appearance_count + 1,
        last_rssi = COALESCE(?, last_rssi),
        metadata_json = COALESCE(?, metadata_json)
      WHERE id = ?
    `).run(
            fields.display_name || null,
            fields.vendor || null,
            fields.device_type || null,
            now,
            fields.last_rssi || null,
            fields.metadata_json ? JSON.stringify(fields.metadata_json) : null,
            existing.id
        );

        const updated = db.prepare('SELECT * FROM devices WHERE id=?').get(existing.id);
        if (isReturn) emit('device_return', { ...updated, absent_for_ms: gapMs });
        checkWatchlist(updated);
        return { device: updated, isNew: false, isReturn };
    }
}

function checkWatchlist(device) {
    const watchlist = (config.thresholds.watchlist || []).map(m => m.toLowerCase().replace(/-/g, ':'));
    const id = (device.identifier || '').toLowerCase();
    if (watchlist.some(mac => id.includes(mac))) {
        emit('watchlist_hit', device);
    }
}

function setWatchlist(identifier, on) {
    db.prepare('UPDATE devices SET on_watchlist=? WHERE identifier=?').run(on ? 1 : 0, identifier);
}

function getAllDevices(filter = {}) {
    let sql = 'SELECT * FROM devices';
    const args = [];
    const clauses = [];
    if (filter.protocol) { clauses.push('protocol=?'); args.push(filter.protocol); }
    if (filter.since) { clauses.push('last_seen>=?'); args.push(filter.since); }
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY last_seen DESC';
    return db.prepare(sql).all(...args);
}

function getDevice(protocol, identifier) {
    return db.prepare('SELECT * FROM devices WHERE protocol=? AND identifier=?').get(protocol, identifier);
}

function addRssiEntry(deviceId, rssi) {
    db.prepare('INSERT INTO rssi_history (device_id, timestamp, rssi) VALUES (?,?,?)').run(deviceId, Date.now(), rssi);
}

function getRssiHistory(deviceId, limit = 60) {
    return db.prepare('SELECT timestamp, rssi FROM rssi_history WHERE device_id=? ORDER BY timestamp DESC LIMIT ?').all(deviceId, limit);
}

function logAlert(alertType, severity, source, description) {
    db.prepare('INSERT INTO alerts_log (fired_at, alert_type, severity, source, description) VALUES (?,?,?,?,?)').run(Date.now(), alertType, severity, source, description);
}

function getAlerts(onlyUnacked = false) {
    const sql = onlyUnacked
        ? 'SELECT * FROM alerts_log WHERE acknowledged=0 ORDER BY fired_at DESC'
        : 'SELECT * FROM alerts_log ORDER BY fired_at DESC LIMIT 200';
    return db.prepare(sql).all();
}

function ackAlert(id) {
    db.prepare('UPDATE alerts_log SET acknowledged=1 WHERE id=?').run(id);
}

module.exports = { init, getDb, upsertDevice, getAllDevices, getDevice, setWatchlist, addRssiEntry, getRssiHistory, logAlert, getAlerts, ackAlert, on };
