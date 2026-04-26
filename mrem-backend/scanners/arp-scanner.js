// MREM v3 — ARP Table Scanner (Passive)
// Reads OS ARP cache: arp -a or /proc/net/arp

const { exec } = require('child_process');
const os = require('os');
const registry = require('../engine/device-registry');
let ouiDb = null;

function loadOui(db) { ouiDb = db; }

function lookupVendor(mac) {
    if (!ouiDb || !mac) return null;
    const oui = mac.replace(/[:\-]/g, '').toUpperCase().slice(0, 6);
    return ouiDb[oui] || null;
}

async function readLinuxArp() {
    return new Promise((resolve) => {
        const fs = require('fs');
        try {
            const raw = fs.readFileSync('/proc/net/arp', 'utf8');
            const lines = raw.split('\n').slice(1).filter(Boolean);
            const entries = [];
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 4) continue;
                const ip = parts[0];
                const mac = parts[3];
                if (!mac || mac === '00:00:00:00:00:00') continue;
                entries.push({ ip, mac: mac.toLowerCase(), iface: parts[5] || '' });
            }
            resolve(entries);
        } catch (e) {
            resolve([]);
        }
    });
}

async function readArpCommand() {
    return new Promise((resolve) => {
        exec('arp -a', { timeout: 5000 }, (err, stdout) => {
            if (err) return resolve([]);
            const lines = stdout.split('\n').filter(Boolean);
            const entries = [];
            for (const line of lines) {
                const ipMatch = line.match(/\((\d+\.\d+\.\d+\.\d+)\)/);
                const macMatch = line.match(/([0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2})/i);
                if (ipMatch && macMatch) {
                    entries.push({ ip: ipMatch[1], mac: macMatch[1].toLowerCase(), iface: '' });
                }
            }
            resolve(entries);
        });
    });
}

async function scan() {
    const platform = os.platform();
    let raw = [];

    if (platform === 'linux') {
        raw = await readLinuxArp();
        if (!raw.length) raw = await readArpCommand();
    } else {
        raw = await readArpCommand();
    }

    const enriched = raw.map(entry => {
        const vendor = lookupVendor(entry.mac);
        registry.upsertDevice('arp', `${entry.ip}:${entry.mac}`, {
            display_name: entry.ip,
            vendor,
            metadata_json: entry,
        });
        return { ...entry, vendor, ts: Date.now() };
    });

    return enriched;
}

module.exports = { scan, loadOui };
