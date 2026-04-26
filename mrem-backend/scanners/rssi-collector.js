// MREM RF Camera Addon — RSSI Collector
// Fast RSSI polling loop for presence detection.
// Reads current RSSI from OS APIs at 2-5s intervals (faster than the main 30s WiFi scan)
// Emits 'rssi_poll' events with { bssid, ssid, rssi, timestamp } arrays.

const { exec } = require('child_process');
const { EventEmitter } = require('events');
const os = require('os');

const emitter = new EventEmitter();
let pollInterval = null;
let pollRateHz = 0;
let lastPollMs = 0;
let pollCount = 0;
const platform = process.platform;

// ─── OS-specific poll commands ────────────────────────────────────────────────

function detectInterface() {
    const ifaces = os.networkInterfaces();
    for (const [name] of Object.entries(ifaces)) {
        if (/^wl|^wlan|^wifi|^ath/i.test(name)) return name;
    }
    return 'wlan0';
}

const iface = detectInterface();

function parseLinux(stdout) {
    const results = [];
    const lines = stdout.split('\n');
    // /proc/net/wireless format: iface | status | quality | level | noise
    for (const line of lines) {
        if (!line.includes(':')) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) continue;
        const rssi = parseFloat(parts[3]); // dBm level field
        if (isNaN(rssi)) continue;
        results.push({ bssid: null, ssid: 'connected', rssi: rssi < 0 ? rssi : rssi - 256, timestamp: Date.now() });
    }
    return results;
    return results;
}

function parseIwlist(stdout) {
    const results = [];
    const blocks = stdout.split(/Cell \d+ -/);
    for (const block of blocks) {
        const bssidM = block.match(/Address:\s+([0-9A-Fa-f:]{17})/);
        const ssidM = block.match(/ESSID:"([^"]*)"/);
        const rssiM = block.match(/Signal level=(-?\d+)/);
        if (!bssidM || !rssiM) continue;
        results.push({
            bssid: bssidM[1].toLowerCase(),
            ssid: ssidM ? ssidM[1] : '',
            rssi: parseInt(rssiM[1]),
            timestamp: Date.now(),
        });
    }
    // Try single connected fallback
    if (results.length === 0 && stdout.includes('wlan0')) {
        return parseLinux(stdout);
    }
    return results;
}

function parseLinuxDump(stdout) {
    const results = [];
    const lines = stdout.split('\n');
    let currentBssid = null;
    let currentSsid = '';

    for (const line of lines) {
        const bssMatch = line.match(/^BSS\s+([0-9a-fA-F:]+)/);
        if (bssMatch) {
            currentBssid = bssMatch[1].toLowerCase();
            currentSsid = '';
        } else if (currentBssid) {
            const sigMatch = line.match(/^\s*signal:\s*(-?\d+)/);
            if (sigMatch) {
                results.push({
                    bssid: currentBssid,
                    ssid: currentSsid,
                    rssi: parseInt(sigMatch[1], 10),
                    timestamp: Date.now()
                });
                currentBssid = null; // Wait for next BSS
            } else {
                const ssidMatch = line.match(/^\s*SSID:\s*(.*)$/);
                if (ssidMatch && ssidMatch[1]) {
                    currentSsid = ssidMatch[1].trim();
                }
            }
        }
    }
    // Try iwlist parsing if dump had no BSS blocks
    if (results.length === 0 && stdout.includes('Cell')) {
        return parseIwlist(stdout);
    }
    return results;
}

function parseMac(stdout) {
    const results = [];
    const m = stdout.match(/agrCtlRSSI:\s+(-?\d+)/);
    const bssidM = stdout.match(/BSSID:\s+([0-9a-fA-F:]+)/);
    const ssidM = stdout.match(/SSID:\s+(.+)/);
    if (m) {
        results.push({
            bssid: bssidM ? bssidM[1].toLowerCase() : null,
            ssid: ssidM ? ssidM[1].trim() : '',
            rssi: parseInt(m[1]),
            timestamp: Date.now(),
        });
    }
    return results;
}

function parseWindows(stdout) {
    const results = [];
    const blocks = stdout.split('SSID');
    for (const block of blocks) {
        const ssidM = block.match(/^\s+:\s+(.+)/m);
        const bssidM = block.match(/BSSID\s+1\s+:\s+([0-9a-fA-F:]+)/);
        const rssiM = block.match(/Signal\s+:\s+(\d+)%/);
        if (!rssiM) continue;
        // Convert Windows % to approximate dBm: dBm = (pct / 2) - 100
        const rssi = Math.round((parseInt(rssiM[1]) / 2) - 100);
        results.push({
            bssid: bssidM ? bssidM[1].toLowerCase() : null,
            ssid: ssidM ? ssidM[1].trim() : '',
            rssi,
            timestamp: Date.now(),
        });
    }
    return results;
}

// ─── Poll function ────────────────────────────────────────────────────────────

function poll() {
    let cmd;
    if (platform === 'linux') {
        // 'iw dev <iface> scan dump' doesn't trigger an active scan, just reads the kernel's cached RSSI table
        cmd = `iw dev ${iface} scan dump 2>/dev/null || iwlist ${iface} scanning 2>/dev/null`;
    } else if (platform === 'darwin') {
        cmd = '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I';
    } else if (platform === 'win32') {
        cmd = 'netsh wlan show networks mode=Bssid';
    } else {
        return; // unsupported
    }

    exec(cmd, { timeout: 8000 }, (err, stdout) => {
        if (err && !stdout) return;

        let readings = [];
        if (platform === 'linux') {
            readings = parseLinuxDump(stdout);
        } else if (platform === 'darwin') {
            readings = parseMac(stdout);
        } else if (platform === 'win32') {
            readings = parseWindows(stdout);
        }

        if (readings.length > 0) {
            const now = Date.now();
            const delta = now - lastPollMs;
            if (delta > 0) pollRateHz = Math.round((1000 / delta) * 10) / 10;
            lastPollMs = now;
            pollCount++;
            emitter.emit('rssi_poll', readings);
        }
    });
}

// ─── Public API ───────────────────────────────────────────────────────────────

function start(intervalMs = 2000) {
    if (pollInterval) return;
    console.log(`[RSSICollector] Starting on ${platform} iface=${iface} every ${intervalMs}ms`);
    poll(); // immediate first poll
    pollInterval = setInterval(poll, intervalMs);
}

function stop() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

function getPollRate() { return pollRateHz; }
function getPollCount() { return pollCount; }

function on(event, fn) { emitter.on(event, fn); }

module.exports = { start, stop, on, getPollRate, getPollCount };
