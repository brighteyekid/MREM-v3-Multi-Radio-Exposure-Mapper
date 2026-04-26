// MREM v3 — Signal History & RSSI Trending
// Maintains in-memory ring buffers and computes trend direction per device

const BUFFER_SIZE = 60;

// Map of identifier → { rssi: [], trends: [] }
const buffers = new Map();

function record(identifier, rssi) {
    if (!buffers.has(identifier)) buffers.set(identifier, { rssi: [] });
    const buf = buffers.get(identifier);
    buf.rssi.push({ ts: Date.now(), rssi });
    if (buf.rssi.length > BUFFER_SIZE) buf.rssi.shift();
}

/**
 * Returns trend direction: 'approaching' | 'receding' | 'stationary'
 * Uses last 5 readings. RSSI is negative — higher (closer to 0) = stronger.
 */
function getTrend(identifier) {
    const buf = buffers.get(identifier);
    if (!buf || buf.rssi.length < 3) return 'stationary';
    const readings = buf.rssi.slice(-5).map(r => r.rssi);
    const delta = readings[readings.length - 1] - readings[0];
    if (delta > 3) return 'approaching';   // getting stronger
    if (delta < -3) return 'receding';     // getting weaker
    return 'stationary';
}

function getSparkline(identifier, count = 20) {
    const buf = buffers.get(identifier);
    if (!buf) return [];
    return buf.rssi.slice(-count).map(r => r.rssi);
}

function getAll() {
    const result = {};
    for (const [id, buf] of buffers) {
        result[id] = { trend: getTrend(id), sparkline: getSparkline(id) };
    }
    return result;
}

module.exports = { record, getTrend, getSparkline, getAll };
