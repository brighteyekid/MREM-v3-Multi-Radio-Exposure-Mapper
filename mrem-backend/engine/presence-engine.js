// MREM RF Camera Addon — Presence Engine
// Fuses WiFi RSSI variance, BLE proximity, and NRF activity into a PresenceFrame.
// Emits 'frame' events at 500ms intervals over the exported EventEmitter.

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const floorPlan = require('./rfcam-floor-plan');
const rssiCollect = require('../scanners/rssi-collector');

const BASELINE_PATH = path.resolve(__dirname, '../data/rfcam_baseline.json');
const FRAME_RATE_MS = 500;

const emitter = new EventEmitter();

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
    rssiHistory: new Map(),   // bssid → number[] (last 30 readings)
    baselineSigma: new Map(),   // bssid → number
    baselineMean: new Map(),   // bssid → number
    bleProximity: new Map(),   // address → { distance_m, rssi, name, trend, last_seen }
    calibrationMode: false,
    calibrationBuf: new Map(),   // bssid → number[] during calibration
    calibrationEnd: 0,
    calibrated: false,
    calibratedAt: null,
    nrfBaseline: 0,
    nrfCurrent: 0,
    active: false,
    frameId: 0,
    lastFrame: null,
    motionThreshMult: 3.0,        // σ × multiplier = motion threshold
    pathLossN: 2.7,        // BLE log-distance path loss exponent
    txPowerDefault: -59,         // dBm at 1m (BLE)
    bleMaxDistM: 15,
};

// ─── Persistence ──────────────────────────────────────────────────────────────

function loadBaseline() {
    try {
        if (fs.existsSync(BASELINE_PATH)) {
            const saved = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
            state.baselineSigma = new Map(Object.entries(saved.sigma || {}));
            state.baselineMean = new Map(Object.entries(saved.mean || {}));
            state.calibrated = true;
            state.calibratedAt = saved.captured_at || null;
            console.log(`[PresenceEngine] Baseline loaded — ${state.baselineSigma.size} APs, calibrated at ${state.calibratedAt}`);
        } else {
            console.log('[PresenceEngine] No baseline found — calibration required');
        }
    } catch (e) {
        console.warn('[PresenceEngine] Failed to load baseline:', e.message);
    }
}

function saveBaseline() {
    const sigma = Object.fromEntries(state.baselineSigma);
    const mean = Object.fromEntries(state.baselineMean);
    const captured_at = new Date().toISOString();
    state.calibratedAt = captured_at;
    fs.writeFileSync(BASELINE_PATH, JSON.stringify({ sigma, mean, captured_at, ap_count: state.baselineSigma.size }, null, 2));
    console.log(`[PresenceEngine] Baseline saved — ${state.baselineSigma.size} APs`);
}

// ─── Math Utilities ───────────────────────────────────────────────────────────

/** Welford's online algorithm for rolling mean + variance */
class WelfordBuffer {
    constructor() { this.n = 0; this.mean = 0; this.M2 = 0; }
    push(x) {
        this.n++;
        const delta = x - this.mean;
        this.mean += delta / this.n;
        const delta2 = x - this.mean;
        this.M2 += delta * delta2;
    }
    sigma() { return this.n < 2 ? 0 : Math.sqrt(this.M2 / (this.n - 1)); }
    reset() { this.n = 0; this.mean = 0; this.M2 = 0; }
}

const welfordMap = new Map(); // bssid → WelfordBuffer (calibration only)

/** Simple RSSI ring buffer — keep last N readings */
function pushRssi(bssid, rssi, maxLen = 30) {
    let arr = state.rssiHistory.get(bssid);
    if (!arr) { arr = []; state.rssiHistory.set(bssid, arr); }
    arr.push(rssi);
    if (arr.length > maxLen) arr.shift();
}

function computeSigma(arr) {
    if (!arr || arr.length < 2) return 0;
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
}

/** BLE log-distance path loss → estimated meters */
function bleDistance(rssi, txPower, n) {
    const ratio = (txPower - rssi) / (10 * n);
    return Math.min(state.bleMaxDistM, Math.pow(10, ratio));
}

/** Exponential moving average for BLE distance smoothing */
const bleDistEMA = new Map(); // address → smoothedDist
function smoothDist(addr, d, alpha = 0.3) {
    const prev = bleDistEMA.get(addr) ?? d;
    const next = alpha * d + (1 - alpha) * prev;
    bleDistEMA.set(addr, next);
    return next;
}

// ─── Calibration ──────────────────────────────────────────────────────────────

function startCalibration(durationMs = 30000) {
    if (state.calibrationMode) return;
    console.log('[PresenceEngine] Calibration started — stay still!');
    state.calibrationMode = true;
    state.calibrationEnd = Date.now() + durationMs;
    state.calibrationBuf = new Map();
    welfordMap.clear();

    const countdownInterval = setInterval(() => {
        const remaining = Math.ceil((state.calibrationEnd - Date.now()) / 1000);
        emitter.emit('calibrating', { seconds_remaining: remaining });
        if (remaining <= 0) clearInterval(countdownInterval);
    }, 1000);

    setTimeout(() => {
        finishCalibration();
        clearInterval(countdownInterval);
    }, durationMs);
}

function finishCalibration() {
    state.calibrationMode = false;
    state.baselineSigma.clear();
    state.baselineMean.clear();

    for (const [bssid, buf] of welfordMap) {
        if (buf.n >= 5) {
            state.baselineSigma.set(bssid, buf.sigma());
            state.baselineMean.set(bssid, buf.mean);
        }
    }

    state.calibrated = true;
    saveBaseline();
    // Reinit floor plan with current WiFi list
    floorPlan.save();

    emitter.emit('calibrated', {
        ap_count: state.baselineSigma.size,
        captured_at: state.calibratedAt,
    });
    console.log(`[PresenceEngine] Calibration complete — ${state.baselineSigma.size} APs on baseline`);
}

// ─── RSSI Updates ─────────────────────────────────────────────────────────────

rssiCollect.on('rssi_poll', (readings) => {
    for (const { bssid, ssid, rssi } of readings) {
        const key = (bssid || ssid || '');
        if (!key) continue;

        if (state.calibrationMode) {
            // Feed Welford buffer during calibration
            if (!welfordMap.has(key)) welfordMap.set(key, new WelfordBuffer());
            welfordMap.get(key).push(rssi);
        } else {
            // Normal operation — update ring buffer
            pushRssi(key, rssi);
        }
    }
});

// ─── BLE Updates ─────────────────────────────────────────────────────────────

/** Called from server.js whenever a BLE device is discovered */
function updateBle(device) {
    const { id, rssi, localName, addressType, trend, sparkline } = device;
    const txPower = device.txPower || state.txPowerDefault;
    const rawDist = bleDistance(rssi, txPower, state.pathLossN);
    const dist = smoothDist(id, rawDist);
    state.bleProximity.set(id, {
        address: id, name: localName || id.slice(-5),
        rssi, distance_m: dist, trend,
        sparkline, last_seen: Date.now(),
    });
}

// ─── NRF Updates ─────────────────────────────────────────────────────────────

function updateNrf(nrfData) {
    const hits = (nrfData.bins || []).reduce((a, b) => a + b, 0);
    if (state.nrfBaseline === 0) state.nrfBaseline = hits;
    state.nrfCurrent = hits;
}

// ─── Motion Detection ─────────────────────────────────────────────────────────

function detectMotion() {
    const motionEvents = [];

    for (const [bssid, arr] of state.rssiHistory) {
        if (arr.length < 5) continue;
        const sigma = computeSigma(arr);
        const baseSig = state.baselineSigma.get(bssid) || 0;
        const thresh = baseSig * state.motionThreshMult;
        const isMotion = state.calibrated && baseSig > 0 && sigma > thresh;

        const apPos = floorPlan.getAPPosition(bssid);
        motionEvents.push({
            bssid, sigma: Math.round(sigma * 100) / 100,
            baseline: Math.round(baseSig * 100) / 100,
            threshold: Math.round(thresh * 100) / 100,
            isMotion,
            canvas_x: apPos?.canvas_x, canvas_y: apPos?.canvas_y,
            ssid: apPos?.ssid || bssid,
        });
    }
    return motionEvents;
}

// ─── Presence Zone Fusion ─────────────────────────────────────────────────────

function fusePresenceZones(motionEvents) {
    const zones = [];
    const activeAps = motionEvents.filter(e => e.isMotion && e.canvas_x != null);
    if (activeAps.length === 0) return zones;

    // Compute centroid of active AP positions towards laptop center
    const cx = floorPlan.laptopX;
    const cy = floorPlan.laptopY;

    // Place zone at midpoint between laptop and each active AP
    for (const ap of activeAps) {
        const mx = (cx + ap.canvas_x) / 2;
        const my = (cy + ap.canvas_y) / 2;
        zones.push({ x: mx, y: my, radius: 60, source: ['wifi'], sigma: ap.sigma, apBssid: ap.bssid });
    }

    // If 2+ APs active, triangulate centroid
    if (activeAps.length >= 2) {
        const tx = activeAps.reduce((s, a) => s + (cx + a.canvas_x) / 2, 0) / activeAps.length;
        const ty = activeAps.reduce((s, a) => s + (cy + a.canvas_y) / 2, 0) / activeAps.length;

        // Check BLE confirmation within zone
        const bleNear = [...state.bleProximity.values()].filter(d =>
            d.distance_m < 5 && Date.now() - d.last_seen < 15000
        );
        const nrfSpike = state.nrfBaseline > 0 && state.nrfCurrent > state.nrfBaseline * 1.2;
        const sources = ['wifi'];
        if (bleNear.length > 0) sources.push('ble');
        if (nrfSpike) sources.push('nrf');

        const confidence = sources.length === 3 ? 'Very High' :
            sources.length === 2 ? 'High' :
                activeAps.length >= 2 ? 'Medium' : 'Low';
        const confidenceFill = { Low: 0.08, Medium: 0.15, High: 0.25, 'Very High': 0.35 }[confidence];

        zones.push({
            x: Math.round(tx), y: Math.round(ty),
            radius: Math.max(50, 80 - activeAps.length * 10),
            confidence, confidenceFill,
            source: sources,
            label: `PRESENCE · ${confidence.toUpperCase()}`,
        });
    }

    return zones;
}

// ─── Activity Level ───────────────────────────────────────────────────────────

function calcActivityLevel(motionEvents, bleCount) {
    const motionCount = motionEvents.filter(e => e.isMotion).length;
    const motionScore = Math.min(60, motionCount * 20);
    const bleScore = Math.min(20, bleCount * 5);
    const nrfDelta = state.nrfBaseline > 0
        ? Math.min(20, Math.max(0, ((state.nrfCurrent - state.nrfBaseline) / state.nrfBaseline) * 100))
        : 0;
    return Math.min(100, Math.round(motionScore + bleScore + nrfDelta + 5)); // +5 ambient floor
}

// ─── Frame Builder ────────────────────────────────────────────────────────────

function buildFrame() {
    const motionEvents = detectMotion();
    const presenceZones = fusePresenceZones(motionEvents);
    const bleDevices = [...state.bleProximity.values()].filter(d => Date.now() - d.last_seen < 30000);
    const activityLevel = calcActivityLevel(motionEvents, bleDevices.length);
    const nrfSpike = state.nrfBaseline > 0 && state.nrfCurrent > state.nrfBaseline * 1.2;

    const frame = {
        frame_id: ++state.frameId,
        ts: Date.now(),
        active: state.active,
        calibrated: state.calibrated,
        calibratedAt: state.calibratedAt,
        calibrationMode: state.calibrationMode,
        activityLevel,
        presenceZones,
        motionEvents,
        bleDevices,
        nrfSpike,
        nrfBaseline: state.nrfBaseline,
        nrfCurrent: state.nrfCurrent,
        laptopX: floorPlan.laptopX,
        laptopY: floorPlan.laptopY,
        floorPlan: floorPlan.toJSON(),
        pollHz: rssiCollect.getPollRate(),
        apCount: state.rssiHistory.size,
        bleCount: bleDevices.length,
    };
    state.lastFrame = frame;
    return frame;
}

// ─── Frame Loop ───────────────────────────────────────────────────────────────

let frameTimer = null;

function start(wifiData = []) {
    if (frameTimer) return;
    state.active = true;
    loadBaseline();

    // Kick off RSSI collector
    rssiCollect.start(2000);

    // Auto layout APs on floor plan if we have WiFi data
    if (wifiData.length > 0) {
        floorPlan.autoLayout(wifiData, 600);
        floorPlan.save();
    }

    frameTimer = setInterval(() => {
        if (!state.active) return;
        const frame = buildFrame();
        emitter.emit('frame', frame);
    }, FRAME_RATE_MS);

    console.log('[PresenceEngine] Started — emitting at 2Hz');
}

function stop() {
    state.active = false;
    rssiCollect.stop();
    if (frameTimer) { clearInterval(frameTimer); frameTimer = null; }
}

function getFrame() { return state.lastFrame; }
function setThreshold(mult) { state.motionThreshMult = parseFloat(mult) || 3.0; }
function setPathLossN(n) { state.pathLossN = parseFloat(n) || 2.7; }
function setTxPower(dbm) { state.txPowerDefault = parseInt(dbm) || -59; }
function isCalibrated() { return state.calibrated; }
function getStatus() {
    return {
        active: state.active, calibrated: state.calibrated,
        calibratedAt: state.calibratedAt, ap_count: state.baselineSigma.size,
        ble_count: state.bleProximity.size, poll_rate_hz: rssiCollect.getPollRate(),
        mode: floorPlan.mode, multiplier: state.motionThreshMult, pathLossN: state.pathLossN,
    };
}

function on(event, fn) { emitter.on(event, fn); }

module.exports = {
    start, stop, on, getFrame, getStatus, isCalibrated,
    startCalibration, setThreshold, setPathLossN, setTxPower,
    updateBle, updateNrf,
};
