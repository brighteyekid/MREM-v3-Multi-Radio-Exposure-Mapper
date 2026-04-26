#!/usr/bin/env node
// Generates a static OUI vendor lookup file from the IEEE registry
// Saves to mrem-backend/data/oui.json as { "AABBCC": "Vendor Name" }
// Run once: node scripts/generate-oui.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const readline = require('readline');

const URL = 'https://standards-oui.ieee.org/oui/oui.txt';
const OUT = path.resolve(__dirname, '../data/oui.json');

console.log('Downloading OUI database from IEEE...');

https.get(URL, (res) => {
    if (res.statusCode !== 200) {
        throw new Error(`Status Code: ${res.statusCode}`);
    }

    const rl = readline.createInterface({ input: res });
    const map = {};

    rl.on('line', (line) => {
        const m = line.match(/^([0-9A-F]{6})\s+\(base 16\)\s+(.+)$/i);
        if (m) {
            map[m[1].toUpperCase()] = m[2].trim();
        }
    });

    rl.on('close', () => {
        fs.writeFileSync(OUT, JSON.stringify(map, null, 2));
        console.log(`OUI database saved: ${Object.keys(map).length} entries → ${OUT}`);
    });
}).on('error', (e) => {
    console.error('Failed to download OUI:', e.message);
    console.log('Creating minimal seed OUI file instead...');
    const seed = {
        "FCFCE0": "Apple, Inc.", "DC2B2A": "Apple, Inc.", "3C22FB": "Apple, Inc.",
        "A4C3F0": "Samsung Electronics", "B0D5CC": "Samsung Electronics",
        "00265A": "Google, Inc.", "3C5AB4": "Google, Inc.",
        "B827EB": "Raspberry Pi Foundation", "DC:A6:32": "Raspberry Pi Foundation",
        "0050F2": "Microsoft Corporation", "7085C2": "Microsoft Corporation",
        "00090F": "Cisco Systems", "000C29": "VMware, Inc.",
        "E4F14C": "TP-Link Technologies", "50D4F7": "TP-Link Technologies",
        "001A2B": "Cisco-Linksys", "001E2A": "TP-Link Technologies",
        "C80E14": "HUAWEI TECHNOLOGIES", "483B38": "HUAWEI TECHNOLOGIES",
        "B47C9C": "Intel Corporate", "8C85C1": "Intel Corporate",
        "34F39A": "ASUS", "B06EBF": "ASUS",
        "D8476B": "Amazon Technologies", "FC65DE": "Amazon Technologies",
        "18FE34": "Espressif Inc.", "24D7EB": "Espressif Inc.", "A020A6": "Espressif Inc.",
    };
    fs.writeFileSync(OUT, JSON.stringify(seed));
    console.log(`Seed OUI file written with ${Object.keys(seed).length} entries`);
});
