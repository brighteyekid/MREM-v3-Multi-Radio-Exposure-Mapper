// MREM v3 — BLE Scanner
// Noble-based BLE advertisement scanner with sparkline data collection
//
// Privilege requirements (Linux):
//   Noble needs raw socket access. Fix with ONE of:
//   1. Run: sudo node server.js           (simplest)
//   2. Run: bash scripts/setup-caps.sh   (grants cap_net_raw to node, no sudo needed after)
//   3. Set NOBLE_HCI_DEVICE_ID=hci0      (sometimes helps with adapter selection)

const noble = require('@abandonware/noble');
const { EventEmitter } = require('events');
const signalHistory = require('../engine/signal-history');
const registry = require('../engine/device-registry');
let ouiDb = null;

const emitter = new EventEmitter();
const deviceMap = new Map(); // address → device data
let scanning = false;
let bleState = 'unknown';
let capWarningShown = false;

function loadOui(db) { ouiDb = db; }

function lookupVendor(mac) {
    if (!ouiDb || !mac) return null;
    const oui = mac.replace(/[:\-]/g, '').toUpperCase().slice(0, 6);
    return ouiDb[oui] || null;
}

noble.on('stateChange', (state) => {
    bleState = state;
    emitter.emit('stateChange', state);
    if (state === 'poweredOn') {
        console.log('[BLE] Adapter powered on and ready');
        capWarningShown = false;
    } else if (state === 'unauthorized') {
        if (!capWarningShown) {
            capWarningShown = true;
            console.warn('[BLE] ⚠  Adapter state: unauthorized');
            console.warn('[BLE] Fix with either:');
            console.warn('[BLE]   sudo node server.js');
            console.warn('[BLE]   OR run once: bash scripts/setup-caps.sh');
        }
        emitter.emit('ble_unavailable', 'unauthorized');
    } else if (state === 'unsupported') {
        console.warn('[BLE] No Bluetooth adapter found or adapter unsupported');
        emitter.emit('ble_unavailable', 'unsupported');
    }
});

noble.on('discover', (peripheral) => {
    const address = peripheral.address || peripheral.id;
    const rssi = peripheral.rssi;
    const adv = peripheral.advertisement || {};
    const localName = adv.localName || '';
    const serviceUuids = adv.serviceUuids || [];
    const connectable = peripheral.connectable || false;
    const addressType = peripheral.addressType || 'unknown';
    const vendor = lookupVendor(address);

    signalHistory.record(address, rssi);

    const { device, isNew } = registry.upsertDevice('ble', address, {
        display_name: localName || null,
        vendor,
        last_rssi: rssi,
        metadata_json: { address, localName, serviceUuids, connectable, addressType },
    });

    const enriched = {
        id: address,
        localName,
        rssi,
        connectable,
        addressType,
        serviceUuids,
        vendor,
        trend: signalHistory.getTrend(address),
        sparkline: signalHistory.getSparkline(address),
        firstSeen: device.first_seen,
        appearanceCount: device.appearance_count,
        isNew,
        ts: Date.now(),
        advertisement: { localName, serviceUuids },
    };

    deviceMap.set(address, enriched);
    emitter.emit('device', enriched);
});

function isReady() {
    return bleState === 'poweredOn';
}

async function scan(durationMs = 8000) {
    if (scanning) return getAll();

    if (!isReady()) {
        if (bleState === 'unauthorized') {
            console.warn('[BLE] Scan skipped: adapter unauthorized. Run with sudo or run scripts/setup-caps.sh');
        } else if (bleState === 'unsupported') {
            console.warn('[BLE] Scan skipped: no Bluetooth adapter');
        } else {
            console.warn(`[BLE] Scan skipped: adapter not ready (state: ${bleState})`);
        }
        return getAll();
    }

    return new Promise((resolve) => {
        scanning = true;
        noble.startScanning([], true, (err) => {
            if (err) {
                scanning = false;
                console.warn('[BLE] Scan error:', err.message);
                return resolve(getAll());
            }
        });

        setTimeout(() => {
            try { noble.stopScanning(); } catch { }
            scanning = false;
            resolve(getAll());
        }, durationMs);
    });
}

function getAll() {
    return Array.from(deviceMap.values());
}

function getState() { return bleState; }

function on(event, fn) { emitter.on(event, fn); }

module.exports = { scan, getAll, loadOui, on, isReady, getState };
