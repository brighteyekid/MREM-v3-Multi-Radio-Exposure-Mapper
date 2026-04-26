// MREM v3 — Channel Analyzer
// NRF24 channel data × WiFi channel assignments = RF congestion map

const config = require('../config');

/**
 * Produce the 128-bin frequency chart with WiFi and BLE overlays
 * @param {Array} nrfBins  Array of 128 hit counts (index = NRF channel)
 * @param {Array} wifiNetworks  Current WiFi scan results
 * @returns { bins, overlays, textFindings }
 */
function analyze(nrfBins = [], wifiNetworks = []) {
    const bins = Array.isArray(nrfBins) && nrfBins.length === 128
        ? nrfBins
        : new Array(128).fill(0);

    const totalHits = bins.reduce((a, b) => a + b, 0);

    // WiFi channel energy bands
    const wifiOverlays = [];
    const wifiChannelMap = config.channelMap.wifi;
    for (const [ch, range] of Object.entries(wifiChannelMap)) {
        const bandHits = bins.slice(range.nrfStart, range.nrfEnd + 1).reduce((a, b) => a + b, 0);
        const count = wifiNetworks.filter(n => n.channel == ch).length;
        wifiOverlays.push({
            label: range.label,
            wifiChannel: +ch,
            nrfStart: range.nrfStart,
            nrfEnd: range.nrfEnd,
            hits: bandHits,
            pct: totalHits > 0 ? +(bandHits / totalHits * 100).toFixed(1) : 0,
            networkCount: count,
        });
    }

    // BLE advertising channel overlays
    const bleOverlays = [];
    for (const [bleAddrCh, info] of Object.entries(config.channelMap.ble)) {
        const nrfCh = info.nrfChannel;
        bleOverlays.push({
            label: info.label,
            bleChannel: +bleAddrCh,
            nrfChannel: nrfCh,
            hits: bins[nrfCh] || 0,
            freq: info.freq,
        });
    }

    // Text findings
    const textFindings = [];
    for (const ov of wifiOverlays) {
        if (ov.hits > 0) {
            textFindings.push(`${ov.label} accounts for ${ov.pct}% of total NRF energy — ${ov.networkCount} WiFi network(s) on that channel.`);
        }
    }
    const activeBleChs = bleOverlays.filter(b => b.hits > 0);
    if (activeBleChs.length > 0) {
        textFindings.push(`BLE advertising detected on NRF channels: ${activeBleChs.map(b => b.nrfChannel).join(', ')} (${activeBleChs.map(b => b.label).join(', ')}).`);
    }

    return { bins, overlays: { wifi: wifiOverlays, ble: bleOverlays }, textFindings };
}

module.exports = { analyze };
