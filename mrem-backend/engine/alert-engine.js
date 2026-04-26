// MREM v3 — Alert Engine
// Monitors thresholds and fires alerts to WebSocket broadcast

const config = require('../config');
const registry = require('./device-registry');

let broadcast = null;
let thresholds = { ...config.thresholds };

function setBroadcast(fn) { broadcast = fn; }

function updateThreshold(metric, value) {
    thresholds[metric] = value;
}

function fire(alertType, severity, source, description) {
    registry.logAlert(alertType, severity, source, description);
    if (broadcast) {
        broadcast({
            type: 'alert',
            data: { type: alertType, severity, source, description, ts: Date.now() }
        });
    }
    console.log(`[Alert][${severity}] ${source}: ${description}`);
}

function checkExposureIndex(value) {
    if (value >= (thresholds.exposureIndex || 7.5)) {
        fire('EXPOSURE_HIGH', 'critical', 'system', `Exposure Index reached ${value.toFixed(1)} — threshold is ${thresholds.exposureIndex}`);
    }
}

function checkNewDevice(device) {
    if (thresholds.newUnknownDevice) {
        fire('NEW_DEVICE', 'warning', device.protocol, `New device detected: ${device.display_name || device.identifier} (${device.vendor || 'unknown vendor'})`);
    }
}

function checkOpenNetwork(network) {
    if (thresholds.openNetworkAlert && (!network.security || network.security === 'none' || network.security === '')) {
        fire('OPEN_WIFI', 'warning', 'wifi', `Open WiFi network detected: ${network.ssid || network.bssid}`);
    }
}

function checkNrfSpike(currentHitRate, baselineHitRate) {
    if (baselineHitRate > 0) {
        const pct = ((currentHitRate - baselineHitRate) / baselineHitRate) * 100;
        if (pct >= (thresholds.nrfSpikePercent || 50)) {
            fire('NRF_SPIKE', 'warning', 'nrf', `NRF24 channel activity spiked ${pct.toFixed(0)}% above baseline`);
        }
    }
}

function checkArduinoDisconnected() {
    fire('ARDUINO_DISCONNECTED', 'critical', 'system', 'Arduino disconnected from serial port');
}

function checkWatchlistHit(device) {
    fire('WATCHLIST_HIT', 'critical', device.protocol, `Watchlisted device appeared: ${device.identifier}`);
}

function checkBleCountSpike(count, windowMs = 60000) {
    if (count >= (thresholds.bleCountPerMinute || 10)) {
        fire('BLE_SURGE', 'warning', 'ble', `${count} BLE devices detected in last ${windowMs / 1000}s`);
    }
}

module.exports = {
    setBroadcast, updateThreshold,
    checkExposureIndex, checkNewDevice, checkOpenNetwork,
    checkNrfSpike, checkArduinoDisconnected, checkWatchlistHit, checkBleCountSpike,
    fire
};
