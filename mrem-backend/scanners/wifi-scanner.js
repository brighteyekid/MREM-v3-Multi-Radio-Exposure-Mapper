// MREM v3 — WiFi Scanner
// OS WiFi scan with OUI vendor lookup and signal trending

const wifi = require('node-wifi');
const signalHistory = require('../engine/signal-history');
const registry = require('../engine/device-registry');
const alertEngine = require('../engine/alert-engine');
let ouiDb = null;

wifi.init({ iface: null });

function loadOui(db) { ouiDb = db; }

function lookupVendor(mac) {
    if (!ouiDb || !mac) return null;
    const oui = mac.replace(/[:\-]/g, '').toUpperCase().slice(0, 6);
    return ouiDb[oui] || null;
}

async function scan() {
    try {
        const networks = await wifi.scan();
        const now = Date.now();
        const enriched = networks.map(net => {
            const bssid = (net.bssid || net.mac || '').toLowerCase();
            const vendor = lookupVendor(bssid);
            const security = net.security || net.encryption || '';
            const rssi = net.signal_level || net.quality || 0;

            if (rssi) signalHistory.record(bssid, rssi);

            const { device, isNew } = registry.upsertDevice('wifi', bssid, {
                display_name: net.ssid,
                vendor,
                last_rssi: rssi,
                metadata_json: { ...net, bssid, vendor },
            });

            if (isNew) alertEngine.checkOpenNetwork({ ...net, bssid, security });

            return {
                ...net,
                bssid,
                vendor,
                trend: signalHistory.getTrend(bssid),
                sparkline: signalHistory.getSparkline(bssid),
                firstSeen: device.first_seen,
                appearanceCount: device.appearance_count,
                security,
                ts: now,
            };
        });
        return enriched;
    } catch (e) {
        console.error('[WiFiScanner] Error:', e.message);
        return [];
    }
}

module.exports = { scan, loadOui };
