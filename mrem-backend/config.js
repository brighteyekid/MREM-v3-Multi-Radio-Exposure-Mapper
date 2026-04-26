// MREM v3 — Central Configuration
// All user-configurable settings. Modify here or override via Settings panel.

module.exports = {
    server: {
        port: 3000,
        host: 'localhost',
    },

    serial: {
        baudRate: 115200,
        autoDetect: true,
        portOverride: null,          // set to e.g. '/dev/ttyACM0' to force a specific port
        connectTimeout: 5000,
        jsonTestTimeout: 500,
    },

    scanIntervals: {
        wifi: 15000,   // ms — WiFi scan every 15 seconds
        ble: 10000,   // ms — BLE scan every 10 seconds
        nmap: 300000,  // ms — Nmap ping sweep every 5 minutes
        arp: 15000,   // ms — ARP table read every 15 seconds
        netif: 2000,    // ms — Network interface counters every 2 seconds
        sysinfo: 5000,   // ms — System resource monitor every 5 seconds
        dns: 30000,   // ms — DNS re-resolution pass every 30 seconds
    },

    ble: {
        scanDuration: 8000, // ms
    },

    nmap: {
        target: 'auto',          // 'auto' = detect subnet, or e.g. '192.168.1.0/24'
        defaultMode: 'ping',     // 'ping' | 'os' | 'full'
        osScanLimit: true,
        versionLightScan: true,
    },

    // Exposure Index alert threshold
    thresholds: {
        exposureIndex: 7.5,
        newUnknownDevice: false, // Disabled: too spammy on massive /16 networks
        openNetworkAlert: true,
        nrfSpikePercent: 50,       // % above baseline to trigger NRF spike alert
        bleCountPerMinute: 10,
        watchlist: [],              // array of MAC addresses (lowercase, colon-separated)
    },

    // Signal history ring buffer sizes
    signalHistory: {
        inMemory: 60,
        inDatabase: 300,
    },

    // Exposure Index — zone boundaries
    exposureZones: [
        { min: 1.0, max: 2.9, label: 'MINIMAL', color: '#0A7346' },
        { min: 3.0, max: 4.9, label: 'LOW', color: '#1A56DB' },
        { min: 5.0, max: 6.9, label: 'MODERATE', color: '#B45309' },
        { min: 7.0, max: 8.4, label: 'HIGH', color: '#C01B1B' },
        { min: 8.5, max: 10.0, label: 'CRITICAL', color: '#7F1D1D' },
    ],

    // NRF channel-to-WiFi/BLE frequency mapping
    channelMap: {
        wifi: {
            1: { nrfStart: 0, nrfEnd: 13, label: 'WiFi Ch 1' },
            6: { nrfStart: 25, nrfEnd: 38, label: 'WiFi Ch 6' },
            11: { nrfStart: 50, nrfEnd: 63, label: 'WiFi Ch 11' },
        },
        ble: {
            37: { nrfChannel: 1, freq: 2402, label: 'BLE Adv 37' },
            38: { nrfChannel: 25, freq: 2426, label: 'BLE Adv 38' },
            39: { nrfChannel: 79, freq: 2480, label: 'BLE Adv 39' },
        },
    },

    paths: {
        db: './data/devices.db',
        sessDb: './data/sessions.db',
        oui: './data/oui.json',
        cve: './data/cve_quick_ref.json',
        reports: './reports/output/',
    },

    reports: {
        defaultTitle: 'MREM Scan Report',
        defaultAuthor: require('os').hostname(),
    },

    display: {
        soundAlerts: false,
        toastNotifications: true,
    },
};
