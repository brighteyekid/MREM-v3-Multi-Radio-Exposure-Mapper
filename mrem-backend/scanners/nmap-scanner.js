// MREM v3 — Nmap Scanner
// Host discovery, OS fingerprinting, service version detection, CVE risk scoring
// Privilege strategy:
//   - pingSweep: no root needed (-sn)
//   - osDetect:  needs raw sockets → prefix with 'sudo nmap'
//   - fullScan:  -sV works without root; add sudo if available for better results

const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const portRiskAnalyzer = require('../engine/port-risk-analyzer');

let cveDb = [];
let ouiDb = null;
let broadcast = null;
let sudoAvailable = null; // cached

function loadOui(db) { ouiDb = db; }
function setBroadcast(fn) { broadcast = fn; }

function loadCve() {
    try {
        const p = path.resolve(__dirname, '../data/cve_quick_ref.json');
        cveDb = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) { cveDb = []; }
}

function lookupVendor(mac) {
    if (!ouiDb || !mac) return null;
    const oui = mac.replace(/[:\-]/g, '').toUpperCase().slice(0, 6);
    return ouiDb[oui] || null;
}

/** Check if running as root */
function isRoot() {
    return process.getuid && process.getuid() === 0;
}

/** Check if passwordless sudo is available for nmap */
async function checkSudo() {
    if (sudoAvailable !== null) return sudoAvailable;
    return new Promise(resolve => {
        exec('sudo -n nmap --version 2>/dev/null', { timeout: 3000 }, (err) => {
            sudoAvailable = !err;
            if (sudoAvailable) {
                console.log('[Nmap] Passwordless sudo available — OS detection and full scans enabled');
            } else {
                console.warn('[Nmap] No passwordless sudo — OS detection disabled. Run setup-caps.sh or start server with sudo.');
            }
            resolve(sudoAvailable);
        });
    });
}

/** Build nmap command with sudo prefix if needed for privileged operations */
async function buildCmd(target, args, needsRoot = false) {
    if (needsRoot) {
        if (isRoot()) {
            return `nmap ${args} -oX - ${target}`;
        }
        const hasSudo = await checkSudo();
        if (hasSudo) {
            return `sudo -n nmap ${args} -oX - ${target}`;
        }
        // Fallback: try anyway, let nmap report its own error
        console.warn('[Nmap] WARNING: OS/version scan may fail without root. Run: sudo node server.js OR run scripts/setup-caps.sh');
        return `nmap ${args} -oX - ${target}`;
    }
    return `nmap ${args} -oX - ${target}`;
}

function runNmap(cmd, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        console.log('[Nmap] Running:', cmd);
        exec(cmd, { timeout: timeoutMs }, (err, stdout, stderr) => {
            if (err && !stdout) {
                // Attach stderr for better diagnostic
                const msg = (err.message || '') + (stderr ? '\n' + stderr : '');
                return reject(new Error(msg));
            }
            resolve(stdout || '');
        });
    });
}

function detectSubnet() {
    const ifaces = os.networkInterfaces();
    // Prioritize wlan/eth over virtual/docker interfaces
    const names = Object.keys(ifaces).sort((a, b) => {
        const isVirtA = a.startsWith('docker') || a.startsWith('veth') || a.startsWith('br-');
        const isVirtB = b.startsWith('docker') || b.startsWith('veth') || b.startsWith('br-');
        if (isVirtA !== isVirtB) return isVirtA ? 1 : -1;
        return 0;
    });

    for (const name of names) {
        for (const addr of ifaces[name]) {
            if (addr.family === 'IPv4' && !addr.internal) {
                return addr.cidr; // Scans the real subnet (e.g. SRMIST's /16)
            }
        }
    }
    return '192.168.1.0/24';
}

function calcRiskScore(services = [], ports = [], hostContext = {}) {
    // Use dynamic port risk analyzer
    const portInfos = ports.map(p => ({
        port: p.port,
        protocol: p.protocol,
        service: p.service,
        version: p.version || p.product,
        state: 'open'
    }));

    const analysis = portRiskAnalyzer.analyzeHostPorts(portInfos, hostContext);
    
    // Legacy format for compatibility
    const riskyPorts = analysis.summary.criticalServices.length;
    const reasons = [];
    
    // Add high-risk port reasons
    analysis.portAnalyses
        .filter(a => a.adjustedRisk >= 6)
        .forEach(a => {
            reasons.push(`Port ${a.port} (${a.service}) - Risk: ${a.adjustedRisk}/10 - ${a.reason}`);
            if (a.riskFactors.length > 0) {
                reasons.push(`  └─ ${a.riskFactors.join(', ')}`);
            }
        });

    // Add CVE-based risks
    for (const svc of services) {
        for (const ref of cveDb) {
            if (ref.version_pattern && svc.version && svc.version.includes(ref.version_pattern)) {
                reasons.push(`${svc.service} ${svc.version} — ${ref.cve}`);
            }
            if (!ref.version_pattern && ref.service && svc.service && svc.service.toLowerCase().includes(ref.service.toLowerCase())) {
                reasons.push(`${svc.service} — ${ref.description}`);
            }
        }
    }

    return { 
        score: analysis.summary.maximumRisk,
        averageRisk: analysis.summary.averageRisk,
        reasons, 
        riskyPorts,
        portAnalyses: analysis.portAnalyses,
        severityCounts: analysis.summary.severityCounts
    };
}

function parseNmapXml(xml) {
    const hosts = [];
    const hostBlocks = xml.match(/<host[\s\S]*?<\/host>/g) || [];
    for (const block of hostBlocks) {
        const ipMatch = block.match(/addrtype="ipv4" addr="([^"]+)"/);
        const macMatch = block.match(/addrtype="mac" addr="([^"]+)"(?:[^>]*vendor="([^"]*)")?/);
        const hostnameMatch = block.match(/<hostname name="([^"]+)"/);
        const osMatch = block.match(/<osmatch name="([^"]+)" accuracy="([^"]+)"/);
        const statusMatch = block.match(/status state="([^"]+)"/);
        if (!ipMatch) continue;

        const portMatches = [...block.matchAll(/<port protocol="([^"]+)" portid="([^"]+)"[\s\S]*?<state state="([^"]+)"[\s\S]*?(?:<service name="([^"]*)"(?:[^>]*product="([^"]*)")?(?:[^>]*version="([^"]*)")?)?/g)];
        const ports = portMatches
            .filter(m => m[3] === 'open')
            .map(m => ({ protocol: m[1], port: +m[2], service: m[4] || '', product: m[5] || '', version: m[6] || '' }));

        const mac = macMatch ? macMatch[1].toLowerCase() : null;
        const vendor = (macMatch && macMatch[2]) ? macMatch[2] : lookupVendor(mac);
        
        // Build host context for risk analysis
        const hostContext = {
            hostOS: osMatch ? osMatch[1] : null,
            isInternal: true, // Assume internal for now
            hasFirewall: false, // Unknown
            networkType: 'unknown'
        };
        
        const risk = calcRiskScore(
            ports.map(p => ({ service: p.service, version: p.version })), 
            ports,
            hostContext
        );

        hosts.push({
            ip: ipMatch[1], mac, vendor,
            hostname: hostnameMatch ? hostnameMatch[1] : null,
            os_match: osMatch ? osMatch[1] : null,
            os_confidence: osMatch ? +osMatch[2] : 0,
            status: statusMatch ? statusMatch[1] : 'up',
            ports, 
            risk_score: risk.score,
            average_risk: risk.averageRisk,
            risk_reasons: risk.reasons, 
            risky_ports: risk.riskyPorts,
            port_analyses: risk.portAnalyses,
            severity_counts: risk.severityCounts,
            ts: Date.now(),
        });
    }
    return hosts;
}

/** Ping sweep — no root needed */
async function pingSweep(target = 'auto') {
    const subnet = target === 'auto' ? detectSubnet() : target;
    try {
        // Ultra-fast flags: -T5, --max-retries 1, --host-timeout 500ms to handle /16 (65k hosts) safely
        const cmd = await buildCmd(subnet, '-sn -T5 --max-retries 1 --host-timeout 500ms', false);
        const xml = await runNmap(cmd);
        return parseNmapXml(xml);
    } catch (e) {
        console.error('[Nmap] Ping sweep failed:', e.message.split('\n')[0]);
        return [];
    }
}

/** OS fingerprint — needs raw sockets (root or sudo) */
async function osDetect(ip) {
    try {
        const cmd = await buildCmd(ip, '-O --osscan-limit -T4', true);
        const xml = await runNmap(cmd);
        return parseNmapXml(xml);
    } catch (e) {
        const msg = e.message || '';
        if (msg.includes('root') || msg.includes('privileges')) {
            console.error('[Nmap] OS detect needs root. Run: sudo node server.js  OR  bash scripts/setup-caps.sh');
        } else {
            console.error('[Nmap] OS detect failed:', msg.split('\n')[0]);
        }
        return [];
    }
}

/** Full port + version scan */
async function fullScan(ip) {
    try {
        // -sV works unprivileged for TCP connect; add sudo for SYN scan
        const cmd = await buildCmd(ip, '-sV --version-light -T4 -p1-1024', true);
        const xml = await runNmap(cmd);
        return parseNmapXml(xml);
    } catch (e) {
        console.error('[Nmap] Full scan failed:', e.message.split('\n')[0]);
        return [];
    }
}

module.exports = { pingSweep, osDetect, fullScan, detectSubnet, loadOui, setBroadcast, loadCve };
