// MREM v3 — Exposure Index v3
// 10-factor composite score 1.0–10.0

const config = require('../config');

const HISTORY_SIZE = 20;
const history = [];

const FACTORS = [
    { name: 'WiFi Network Density', key: 'wifiNetworks', weight: 0.15, max: 15 },
    { name: 'Open WiFi Networks', key: 'wifiOpen', weight: 0.15, max: 10 },
    { name: 'WEP Networks', key: 'wifiWep', weight: 0.08, max: 5 },
    { name: 'BLE Device Count', key: 'bleCount', weight: 0.10, max: 20 },
    { name: 'BLE Connectable Devices', key: 'bleConnectable', weight: 0.08, max: 10 },
    { name: 'NRF Channel Activity', key: 'nrfIndex', weight: 0.12, max: 10 },
    { name: 'Active NRF Channels', key: 'nrfChannelCount', weight: 0.05, max: 128 },
    { name: 'Live Network Hosts', key: 'nmapHosts', weight: 0.10, max: 30 },
    { name: 'Risky Open Ports', key: 'riskyPorts', weight: 0.12, max: 10 },
    { name: 'Signal Proximity', key: 'proximity', weight: 0.05, max: 1 },
];

/**
 * Compute Exposure Index from current scan state
 * @param {object} state { wifi, ble, nmap, nrf }
 * @returns { score, zone, trend, factors, history }
 */
function compute(state = {}) {
    const { wifi = [], ble = [], nmap = [], nrf = {} } = state;

    const factors = {};

    factors.wifiNetworks = Math.min(wifi.length, 15);
    factors.wifiOpen = wifi.filter(n => !n.security || n.security === 'none').length * 2;
    factors.wifiWep = wifi.filter(n => n.security && n.security.toUpperCase().includes('WEP')).length * 1.5;
    factors.bleCount = Math.floor(ble.length / 2);
    factors.bleConnectable = ble.filter(d => d.connectable).length;
    factors.nrfIndex = nrf.rf_index || 0;
    factors.nrfChannelCount = (nrf.top_channels || []).length;
    factors.nmapHosts = Math.floor(nmap.length / 3);
    factors.riskyPorts = nmap.reduce((sum, h) => sum + (h.risky_ports || 0), 0) * 2;
    factors.proximity = (
        wifi.some(n => n.signal_level && n.signal_level > -50) ||
        ble.some(d => d.rssi && d.rssi > -50)
    ) ? 1 : 0;

    // Weighted raw score (0–10 per factor × weight)
    let rawScore = 0;
    const factorDetails = FACTORS.map(f => {
        const value = factors[f.key] || 0;
        const normalized = Math.min(value / f.max, 1) * 10;
        const contribution = normalized * f.weight;
        rawScore += contribution;
        return { name: f.name, key: f.key, value, normalized: +normalized.toFixed(2), contribution: +contribution.toFixed(2), weight: f.weight };
    });

    // Clamp to 1.0–10.0
    const score = Math.max(1.0, Math.min(10.0, +rawScore.toFixed(2)));

    history.push(score);
    if (history.length > HISTORY_SIZE) history.shift();

    const rollingAvg = history.reduce((a, b) => a + b, 0) / history.length;
    let trend = '→';
    if (score > rollingAvg + 0.5) trend = '↑';
    if (score < rollingAvg - 0.5) trend = '↓';

    const zone = getZone(score);

    return { score, zone, trend, factors: factorDetails, history: [...history] };
}

function getZone(score) {
    for (const z of config.exposureZones) {
        if (score >= z.min && score <= z.max) return z;
    }
    return config.exposureZones[config.exposureZones.length - 1];
}

module.exports = { compute };
