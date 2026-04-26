// MREM v3 — Network Interface Monitor
// Reads /proc/net/dev (Linux) or netstat for real-time byte/packet counters

const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');

let prevStats = {};

function parseLinuxNetDev() {
    try {
        const raw = fs.readFileSync('/proc/net/dev', 'utf8');
        const lines = raw.split('\n').slice(2).filter(Boolean);
        const stats = {};
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const iface = parts[0].replace(':', '');
            stats[iface] = {
                rxBytes: +parts[1],
                rxPackets: +parts[2],
                rxErrors: +parts[3],
                rxDrop: +parts[4],
                txBytes: +parts[9],
                txPackets: +parts[10],
                txErrors: +parts[11],
                txDrop: +parts[12],
            };
        }
        return stats;
    } catch {
        return {};
    }
}

function computeRates(current, previous, intervalMs = 2000) {
    const rates = {};
    const factor = 1000 / intervalMs;
    for (const [iface, cur] of Object.entries(current)) {
        const prev = previous[iface] || cur;
        rates[iface] = {
            iface,
            rxBytesPerSec: Math.max(0, Math.round((cur.rxBytes - prev.rxBytes) * factor)),
            txBytesPerSec: Math.max(0, Math.round((cur.txBytes - prev.txBytes) * factor)),
            rxPacketsPerSec: Math.max(0, Math.round((cur.rxPackets - prev.rxPackets) * factor)),
            txPacketsPerSec: Math.max(0, Math.round((cur.txPackets - prev.txPackets) * factor)),
            errorRate: cur.rxErrors + cur.txErrors,
            droppedPackets: cur.rxDrop + cur.txDrop,
        };
    }
    return rates;
}

async function read() {
    const platform = os.platform();
    let current = {};

    if (platform === 'linux') {
        current = parseLinuxNetDev();
    } else {
        // Fallback: use os.networkInterfaces() for basic info (no counters)
        const ifaces = os.networkInterfaces();
        for (const [name, addrs] of Object.entries(ifaces)) {
            if (addrs.some(a => !a.internal)) {
                current[name] = { rxBytes: 0, rxPackets: 0, rxErrors: 0, rxDrop: 0, txBytes: 0, txPackets: 0, txErrors: 0, txDrop: 0 };
            }
        }
    }

    const rates = computeRates(current, prevStats);
    prevStats = current;
    return Object.values(rates).filter(r => r.iface !== 'lo');
}

module.exports = { read };
