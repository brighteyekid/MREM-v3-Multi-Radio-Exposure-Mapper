// MREM v3 — Session Manager
// Records and replays full scan sessions in SQLite

const { v4: uuidv4 } = require('uuid');
const registry = require('./device-registry');

function saveSession(snapshotData, notes = '') {
    const db = registry.getDb();
    const sessionId = uuidv4();
    const now = Date.now();

    db.prepare(`
    INSERT INTO scan_sessions (session_id, started_at, completed_at, wifi_count, ble_count, nmap_count, exposure_index, snapshot_json, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        sessionId,
        snapshotData.startedAt || now,
        now,
        (snapshotData.wifi || []).length,
        (snapshotData.ble || []).length,
        (snapshotData.nmap || []).length,
        snapshotData.exposureIndex || 0,
        JSON.stringify(snapshotData),
        notes
    );

    return sessionId;
}

function listSessions() {
    const db = registry.getDb();
    return db.prepare('SELECT session_id, started_at, completed_at, wifi_count, ble_count, nmap_count, exposure_index, notes FROM scan_sessions ORDER BY started_at DESC').all();
}

function getSession(sessionId) {
    const db = registry.getDb();
    const row = db.prepare('SELECT * FROM scan_sessions WHERE session_id=?').get(sessionId);
    if (!row) return null;
    return { ...row, snapshot: JSON.parse(row.snapshot_json || '{}') };
}

function annotateSession(sessionId, notes) {
    const db = registry.getDb();
    db.prepare('UPDATE scan_sessions SET notes=? WHERE session_id=?').run(notes, sessionId);
}

module.exports = { saveSession, listSessions, getSession, annotateSession };
