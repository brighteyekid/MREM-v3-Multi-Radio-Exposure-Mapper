// MREM v3 — Main Server
// Express + WebSocket entry point. Wires all modules, schedules scans, handles all WS commands.

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const config = require('./config');
const registry = require('./engine/device-registry');
const sigHist = require('./engine/signal-history');
const sessions = require('./engine/session-manager');
const alertEng = require('./engine/alert-engine');
const exposure = require('./engine/exposure-index');
const corrEng = require('./engine/correlation-engine');
const chanAnal = require('./engine/channel-analyzer');

const serial = require('./serial-bridge');
const wifiScan = require('./scanners/wifi-scanner');
const bleScan = require('./scanners/ble-scanner');
const nmapScan = require('./scanners/nmap-scanner');
const arpScan = require('./scanners/arp-scanner');
const dnsRecon = require('./scanners/dns-recon');
const netifMon = require('./scanners/netif-monitor');
const sysinfoMon = require('./scanners/sysinfo-monitor');
const reporter = require('./reports/report-generator');
const presenceEng = require('./engine/presence-engine');
const floorPlan = require('./engine/rfcam-floor-plan');
const redteamChat = require('./engine/redteam-chat');
const attackVectors = require('./engine/attack-vectors');

// ─── App State ───────────────────────────────────────────────────────────────
const state = {
    wifi: [],
    ble: [],
    nmap: [],
    arp: [],
    dns: [],
    probes: [],
    nrf: { raw: [], top_channels: [], rf_index: 0, mode: 'fast', bins: new Array(128).fill(0) },
    exposure: {},
    correlations: [],
    sysinfo: {},
    netif: [],
    startedAt: Date.now(),
};

let probeProcess = null;
let ouiDb = {};
let scanTimers = {};

// ─── OUI Database ─────────────────────────────────────────────────────────────
function loadOuiDb() {
    try {
        const ouiPath = path.resolve(__dirname, config.paths.oui);
        if (fs.existsSync(ouiPath)) {
            ouiDb = JSON.parse(fs.readFileSync(ouiPath, 'utf8'));
            console.log(`[OUI] Loaded ${Object.keys(ouiDb).length} vendor entries`);
        } else {
            console.warn('[OUI] oui.json not found — vendor lookup disabled');
        }
    } catch (e) {
        console.warn('[OUI] Failed to load oui.json:', e.message);
    }
    wifiScan.loadOui(ouiDb);
    bleScan.loadOui(ouiDb);
    nmapScan.loadOui(ouiDb);
    arpScan.loadOui(ouiDb);
}

// ─── Express Setup ────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// REST API for status checks (bootsplash)
app.get('/api/status', (req, res) => {
    const bleState = bleScan.getState();
    res.json({
        arduino: serial.isConnected(),
        arduinoPort: serial.getPort(),
        wifi: true,
        ble: bleState === 'poweredOn',
        bleState,
        nmap: true,
        arp: true,
        probeMode: probeProcess !== null,
        isRoot: process.getuid ? process.getuid() === 0 : false,
        version: '3.0.0',
        uptime: Math.floor((Date.now() - state.startedAt) / 1000),
    });
});

app.get('/api/sessions', (req, res) => res.json(sessions.listSessions()));
app.get('/api/session/:id', (req, res) => {
    const s = sessions.getSession(req.params.id);
    s ? res.json(s) : res.status(404).json({ error: 'Not found' });
});
app.get('/api/devices', (req, res) => res.json(registry.getAllDevices()));
app.get('/api/alerts', (req, res) => res.json(registry.getAlerts(req.query.unacked === '1')));
app.get('/api/ports', async (req, res) => res.json(await serial.listPorts()));
app.get('/api/state', (req, res) => res.json(state));

// CSV Downloads
app.get('/api/export/wifi', (req, res) => {
    const csv = reporter.exportWifi(state.wifi);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="wifi.csv"');
    res.send(csv);
});
app.get('/api/export/ble', (req, res) => {
    const csv = reporter.exportBle(state.ble);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ble.csv"');
    res.send(csv);
});
app.get('/api/export/hosts', (req, res) => {
    const csv = reporter.exportHosts(state.nmap);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="hosts.csv"');
    res.send(csv);
});
app.get('/api/export/channels', (req, res) => {
    const csv = reporter.exportChannels(state.nrf.bins);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="channels.csv"');
    res.send(csv);
});
app.post('/api/export/pdf', async (req, res) => {
    try {
        const pdfPath = await reporter.generatePdf({
            wifi: state.wifi, ble: state.ble, nmap: state.nmap,
            nrf: state.nrf, exposureData: state.exposure,
            correlations: state.correlations,
        }, req.body || {});
        res.download(pdfPath, 'mrem-report.pdf', () => fs.unlinkSync(pdfPath));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── RF Camera REST Endpoints ────────────────────────────────────────────────
app.get('/api/rfcam/status', (req, res) => res.json(presenceEng.getStatus()));
app.get('/api/rfcam/baseline', (req, res) => {
    const p = path.resolve(__dirname, 'data/rfcam_baseline.json');
    if (fs.existsSync(p)) res.json(JSON.parse(fs.readFileSync(p, 'utf8')));
    else res.status(404).json({ error: 'No baseline yet' });
});
app.get('/api/rfcam/floorplan', (req, res) => res.json(floorPlan.toJSON()));
app.post('/api/rfcam/floorplan', (req, res) => {
    Object.assign(floorPlan, req.body);
    floorPlan.save();
    res.json({ ok: true });
});
app.get('/api/rfcam/frame', (req, res) => {
    const f = presenceEng.getFrame();
    f ? res.json(f) : res.status(204).end();
});
app.post('/api/rfcam/calibrate', (req, res) => {
    presenceEng.startCalibration(30000);
    res.json({ ok: true, message: 'Calibration started — 30s countdown' });
});
app.post('/api/rfcam/reset', (req, res) => {
    const p = path.resolve(__dirname, 'data/rfcam_baseline.json');
    const fp = path.resolve(__dirname, 'data/rfcam_floorplan.json');
    if (fs.existsSync(p)) fs.unlinkSync(p);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    res.json({ ok: true });
});

// ─── Red Team AI Chatbot Endpoints ───────────────────────────────────────────
app.post('/api/redteam/chat', async (req, res) => {
    try {
        const { message, networkState, sessionId } = req.body;
        if (!message) return res.status(400).json({ error: 'Message required' });
        
        const result = await redteamChat.chat(message, networkState || state, sessionId);
        res.json(result);
    } catch (e) {
        console.error('[RedTeam] Chat error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/redteam/clear', (req, res) => {
    redteamChat.clearHistory();
    res.json({ ok: true });
});

app.get('/api/redteam/history', (req, res) => {
    const sessionId = req.query.session;
    res.json({ history: redteamChat.getHistory(sessionId) });
});

app.get('/api/redteam/sessions', (req, res) => {
    res.json({ sessions: redteamChat.getSessions() });
});

app.post('/api/redteam/attack-vectors', async (req, res) => {
    try {
        const { networkState } = req.body;
        const vectors = await attackVectors.generateAttackVectors(networkState || state);
        res.json({ attackVectors: vectors });
    } catch (e) {
        console.error('[RedTeam] Attack vector generation error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── WebSocket ────────────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Set();

function broadcast(msgObj) {
    const payload = JSON.stringify(msgObj);
    for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
}

function log(level, source, message) {
    broadcast({ type: 'log', level, source, message });
    console.log(`[${level.toUpperCase()}][${source}] ${message}`);
}

alertEng.setBroadcast(broadcast);
corrEng.setBroadcast(broadcast);
nmapScan.setBroadcast(broadcast);

wss.on('connection', (ws) => {
    clients.add(ws);
    // Send current state to new client
    ws.send(JSON.stringify({ type: 'wifi_update', data: state.wifi }));
    ws.send(JSON.stringify({ type: 'ble_update', data: state.ble }));
    ws.send(JSON.stringify({ type: 'nmap_update', data: state.nmap }));
    ws.send(JSON.stringify({ type: 'arp_update', data: state.arp }));
    ws.send(JSON.stringify({ type: 'nrf_update', data: state.nrf }));
    ws.send(JSON.stringify({ type: 'exposure_update', data: state.exposure }));
    ws.send(JSON.stringify({ type: 'correlation_update', data: state.correlations }));
    ws.send(JSON.stringify({ type: 'sysinfo_update', data: state.sysinfo }));
    ws.send(JSON.stringify({ type: 'system_status', data: getSystemStatus() }));
    ws.send(JSON.stringify({ type: 'log', level: 'info', source: 'system', message: 'New client connected' }));

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw);
            if (msg.type === 'command') handleCommand(msg, ws);
        } catch { }
    });

    ws.on('close', () => clients.delete(ws));
});

function getSystemStatus() {
    const bleState = bleScan.getState();
    return {
        arduino: serial.isConnected(),
        arduinoPort: serial.getPort(),
        wifi: true,
        ble: bleState === 'poweredOn',
        bleState,                         // 'poweredOn' | 'unauthorized' | 'unsupported' | 'unknown'
        nmap: true,
        arp: true,
        probeMode: probeProcess !== null,
    };
}

async function handleCommand(msg, ws) {
    const { cmd, args = {} } = msg;

    switch (cmd) {
        case 'scan_wifi': doWifiScan(); break;
        case 'scan_ble': doBLEScan(); break;
        case 'run_arp': doArpScan(); break;
        case 'run_nmap': doNmapScan(args.target, args.mode || 'ping'); break;
        case 'run_dns': doDNS(args.ip); break;
        case 'start_probing': startProbing(); break;
        case 'stop_probing': stopProbing(); break;
        case 'export_csv': broadcast({ type: 'log', level: 'info', source: 'system', message: 'Use /api/export/* endpoints for CSV downloads' }); break;
        case 'export_pdf': broadcast({ type: 'log', level: 'info', source: 'system', message: 'POST to /api/export/pdf' }); break;
        case 'save_session': {
            const id = sessions.saveSession({ ...state, startedAt: state.startedAt }, args.notes || '');
            broadcast({ type: 'session_complete', data: { session_id: id, summary: `Session ${id} saved` } });
            log('info', 'session', `Session ${id} saved`);
            break;
        }
        case 'replay_session': {
            const s = sessions.getSession(args.session_id);
            if (s) broadcast({ type: 'replay_data', data: s });
            break;
        }
        case 'arduino': {
            const sent = serial.send(args.payload || {});
            if (!sent) log('warning', 'arduino', 'Arduino not connected');
            break;
        }
        case 'add_watchlist': {
            if (args.mac) {
                config.thresholds.watchlist = [...(config.thresholds.watchlist || []), args.mac.toLowerCase()];
                registry.setWatchlist(args.mac.toLowerCase(), true);
                broadcast({ type: 'log', level: 'info', source: 'system', message: `MAC ${args.mac} added to watchlist` });
            }
            break;
        }
        case 'ack_alert': registry.ackAlert(args.alert_id); break;
        case 'clear_correlations':
            corrEng.clearFindings();
            state.correlations = [];
            broadcast({ type: 'correlation_update', data: [] });
            log('info', 'correlation', 'Findings cleared');
            break;
        case 'set_threshold': alertEng.updateThreshold(args.metric, args.value); break;
        // ── RF Camera Commands
        case 'start_rfcam':
            presenceEng.start(state.wifi);
            broadcast({ type: 'rfcam_status', data: presenceEng.getStatus() });
            log('info', 'rfcam', 'RF Camera started');
            break;
        case 'stop_rfcam':
            presenceEng.stop();
            broadcast({ type: 'rfcam_status', data: presenceEng.getStatus() });
            log('info', 'rfcam', 'RF Camera stopped');
            break;
        case 'start_rfcam_calibration':
            presenceEng.startCalibration(30000);
            break;
        case 'save_floorplan':
            if (args.floorplan_json) { Object.assign(floorPlan, args.floorplan_json); floorPlan.save(); }
            break;
        case 'set_rfcam_sensitivity':
            presenceEng.setThreshold(args.multiplier);
            break;
        case 'set_rfcam_pathLossN':
            presenceEng.setPathLossN(args.n);
            break;
        default:
            ws.send(JSON.stringify({ type: 'log', level: 'warning', source: 'system', message: `Unknown command: ${cmd}` }));
    }
}

// ─── Scan Functions ───────────────────────────────────────────────────────────
async function doWifiScan() {
    log('info', 'wifi', 'WiFi scan started');
    try {
        const results = await wifiScan.scan();
        state.wifi = results;
        broadcast({ type: 'wifi_update', data: results });
        updateExposure();
        log('info', 'wifi', `Found ${results.length} networks`);
    } catch (e) {
        log('error', 'wifi', e.message);
    }
}

async function doBLEScan() {
    log('info', 'ble', 'BLE scan started');
    try {
        const results = await bleScan.scan(config.ble.scanDuration);
        state.ble = results;
        broadcast({ type: 'ble_update', data: results });
        // Feed BLE data to presence engine
        results.forEach(d => presenceEng.updateBle(d));
        updateExposure();
        log('info', 'ble', `Found ${results.length} BLE devices`);
    } catch (e) {
        log('error', 'ble', e.message);
    }
}

async function doNmapScan(target, mode = 'ping') {
    log('info', 'nmap', `Nmap ${mode} scan started on ${target || 'auto'}`);
    try {
        let results;
        const t = target === 'auto' || !target ? nmapScan.detectSubnet() : target;
        if (mode === 'ping') results = await nmapScan.pingSweep(t);
        else if (mode === 'os') results = await nmapScan.osDetect(t);
        else results = await nmapScan.fullScan(t);

        state.nmap = results;
        broadcast({ type: 'nmap_update', data: results });
        updateExposure();

        // Kick off reverse DNS on found hosts
        for (const host of results) {
            dnsRecon.reverseLookup(host.ip).then(r => {
                if (r.hostname) {
                    broadcast({ type: 'dns_update', data: r });
                    state.dns.push(r);
                }
            });
        }
        log('info', 'nmap', `Found ${results.length} hosts`);
    } catch (e) {
        log('error', 'nmap', e.message);
    }
}

async function doArpScan() {
    try {
        const results = await arpScan.scan();
        state.arp = results;
        broadcast({ type: 'arp_update', data: results });
        log('info', 'arp', `ARP table: ${results.length} entries`);
    } catch (e) {
        log('error', 'arp', e.message);
    }
}

async function doDNS(ip) {
    if (!ip) return;
    try {
        const result = await dnsRecon.reverseLookup(ip);
        broadcast({ type: 'dns_update', data: result });
    } catch (e) {
        log('error', 'dns', e.message);
    }
}

function updateExposure() {
    const result = exposure.compute(state);
    state.exposure = result;
    broadcast({ type: 'exposure_update', data: result });
    alertEng.checkExposureIndex(result.score);

    // Run async AI correlations
    corrEng.analyze({ ...state, probes: state.probes }).then(findings => {
        state.correlations = findings;
        // Broadcasts are handled internally by corrEng
    }).catch(e => console.error('[Server] Correlation error:', e.message));

    // Channel analysis
    const chanResult = chanAnal.analyze(state.nrf.bins, state.wifi);
    broadcast({ type: 'channel_analysis', data: chanResult });
}

// Feed NRF data to presence engine
serial.on('data', (data) => {
    if (data.type === 'scan' || data.type === 'nrf') presenceEng.updateNrf(data);
});

// ─── Arduino Serial ───────────────────────────────────────────────────────────
registry.on('device_new', (device) => {
    broadcast({ type: 'device_new', data: device });
    alertEng.checkNewDevice(device);
});
registry.on('device_return', (device) => {
    broadcast({ type: 'device_return', data: device });
});
registry.on('watchlist_hit', (device) => {
    alertEng.checkWatchlistHit(device);
});

serial.on('data', (data) => {
    if (!data.type) return;
    if (data.type === 'scan' || data.type === 'nrf') {
        const nrfData = {
            ...data,
            mode: data.mode || state.nrf.mode,
            bins: data.bins || state.nrf.bins,
        };
        state.nrf = nrfData;
        broadcast({ type: 'nrf_update', data: nrfData });
        updateExposure();
    }
    if (data.type === 'oled') {
        broadcast({ type: 'oled_update', data });
    }
    if (data.type === 'pong') {
        log('info', 'arduino', 'Pong received from Arduino');
    }
});

serial.on('connect', (port) => {
    log('info', 'arduino', `Connected to Arduino at ${port}`);
    broadcast({ type: 'system_status', data: getSystemStatus() });
});

serial.on('disconnect', () => {
    log('warning', 'arduino', 'Arduino disconnected');
    alertEng.checkArduinoDisconnected();
    broadcast({ type: 'system_status', data: getSystemStatus() });
});

serial.on('not_found', () => {
    log('warning', 'arduino', 'Arduino not found — connect USB to enable RF hardware');
    broadcast({ type: 'system_status', data: getSystemStatus() });
});

// ─── Probe Sniffer ────────────────────────────────────────────────────────────
function startProbing() {
    if (probeProcess) return;
    const py = spawn('python3', [path.join(__dirname, 'scanners/probe-sniffer.py'), 'wlan0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    py.stdout.on('data', (raw) => {
        String(raw).split('\n').filter(Boolean).forEach(line => {
            try {
                const probe = JSON.parse(line);
                if (probe.type === 'probe') {
                    state.probes.push(probe);
                    broadcast({ type: 'probe_update', data: probe });
                } else {
                    log(probe.type === 'error' ? 'error' : 'info', 'probe', probe.message || line);
                }
            } catch { }
        });
    });
    py.on('exit', () => {
        probeProcess = null;
        broadcast({ type: 'system_status', data: getSystemStatus() });
    });
    probeProcess = py;
    broadcast({ type: 'system_status', data: getSystemStatus() });
    log('info', 'probe', 'Probe sniffer started');
}

function stopProbing() {
    if (probeProcess) { probeProcess.kill(); probeProcess = null; }
    broadcast({ type: 'system_status', data: getSystemStatus() });
    log('info', 'probe', 'Probe sniffer stopped');
}

// ─── Scheduled Scan Loop ──────────────────────────────────────────────────────
function startScheduledScans() {
    const c = config.scanIntervals;
    if (c.wifi) scanTimers.wifi = setInterval(doWifiScan, c.wifi);
    if (c.ble) scanTimers.ble = setInterval(doBLEScan, c.ble);
    if (c.nmap) scanTimers.nmap = setInterval(() => doNmapScan('auto', 'ping'), c.nmap);
    if (c.arp) scanTimers.arp = setInterval(doArpScan, c.arp);
    if (c.netif) scanTimers.netif = setInterval(async () => {
        const data = await netifMon.read();
        state.netif = data;
        broadcast({ type: 'netif_update', data });
    }, c.netif);
    if (c.sysinfo) scanTimers.sysinfo = setInterval(async () => {
        const data = await sysinfoMon.read();
        state.sysinfo = data;
        broadcast({ type: 'sysinfo_update', data });
    }, c.sysinfo);
}

// ─── Startup ──────────────────────────────────────────────────────────────────
async function startup() {
    console.log('\n╔══════════════════════════════════╗');
    console.log('║  MREM v3 ─ Multi-Radio Exposure  ║');
    console.log('║  Mapper — Starting up...         ║');
    console.log('╚══════════════════════════════════╝\n');

    // Privilege guidance
    const isRoot = process.getuid ? process.getuid() === 0 : false;
    if (isRoot) {
        console.log('[Server] Running as root — BLE scanning and Nmap OS detection are fully enabled ✓');
    } else {
        console.log('[Server] Running as user (not root)');
        console.log('[Server] For BLE + Nmap OS detection, choose one fix:');
        console.log('[Server]   1. sudo node server.js');
        console.log('[Server]   2. sudo bash scripts/setup-caps.sh   (grants caps permanently, then: node server.js)');
        console.log('[Server] WiFi and ARP scans work without root.\n');
    }

    // Init DB
    registry.init();
    nmapScan.loadCve();
    loadOuiDb();

    // Start HTTP + WS server
    server.listen(config.server.port, config.server.host, () => {
        console.log(`[Server] Listening at http://${config.server.host}:${config.server.port}`);
    });

    // Connect Arduino (non-blocking)
    serial.autoConnect(config.serial).catch(() => { });

    // Initial scans on startup
    setTimeout(doWifiScan, 2000);
    setTimeout(doBLEScan, 3000);
    setTimeout(doArpScan, 4000);
    setTimeout(() => doNmapScan('auto', 'ping'), 6000);

    // Scheduled loops
    startScheduledScans();

    // Wire presence engine events → WebSocket
    presenceEng.on('frame', (frame) => broadcast({ type: 'presence_update', data: frame }));
    presenceEng.on('calibrating', (data) => broadcast({ type: 'rfcam_calibrating', data }));
    presenceEng.on('calibrated', (data) => broadcast({ type: 'rfcam_calibrated', data }));

    console.log('[Server] All modules initialized. Dashboard: http://localhost:3000');
}

startup();
