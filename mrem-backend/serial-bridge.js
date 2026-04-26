// MREM v3 — Serial Bridge
// Manages Arduino USB serial with auto-detection (VID, CH340, FTDI, ACM sweep)

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { EventEmitter } = require('events');

const emitter = new EventEmitter();
let port = null;
let parser = null;
let connected = false;
let firmwareUptime = 0;
let selectedPort = null;

async function listPorts() {
    return await SerialPort.list();
}

async function detectArduinoPort(override = null) {
    if (override) return [override];
    const ports = await SerialPort.list();
    const priority = ports.filter(p =>
        p.vendorId === '2341' || p.vendorId === '2a03' ||
        (p.manufacturer && /arduino/i.test(p.manufacturer)) ||
        (p.pnpId && /arduino/i.test(p.pnpId))
    );
    if (priority.length) return priority.map(p => p.path);

    const fallback = ports.filter(p =>
        (p.manufacturer && /(CH340|CH341|FTDI|Silicon)/i.test(p.manufacturer)) ||
        (p.pnpId && /(CH340|CH341|FTDI)/i.test(p.pnpId))
    );
    if (fallback.length) return fallback.map(p => p.path);

    // Sweep ACM/USB ports
    return ports.filter(p => /ttyACM|ttyUSB|COM/i.test(p.path)).map(p => p.path);
}

async function connect(portPath, baudRate = 115200) {
    if (port && port.isOpen) port.close();

    return new Promise((resolve, reject) => {
        port = new SerialPort({ path: portPath, baudRate, autoOpen: false });
        parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

        parser.on('data', (line) => {
            line = line.trim();
            if (!line) return;
            try {
                const data = JSON.parse(line);
                emitter.emit('data', data);
            } catch {
                emitter.emit('raw', line);
            }
        });

        port.on('close', () => {
            connected = false;
            selectedPort = null;
            emitter.emit('disconnect');
        });

        port.on('error', (err) => {
            connected = false;
            emitter.emit('error', err);
        });

        port.open((err) => {
            if (err) return reject(err);
            connected = true;
            selectedPort = portPath;
            emitter.emit('connect', portPath);
            resolve(portPath);
        });
    });
}

async function autoConnect(config = {}) {
    const candidates = await detectArduinoPort(config.portOverride);
    if (!candidates.length) {
        emitter.emit('not_found');
        return null;
    }
    for (const candidate of candidates) {
        try {
            await connect(candidate, config.baudRate || 115200);
            console.log(`[SerialBridge] Connected to Arduino at ${candidate}`);
            return candidate;
        } catch (e) {
            console.warn(`[SerialBridge] Failed on ${candidate}:`, e.message);
        }
    }
    emitter.emit('not_found');
    return null;
}

function send(jsonObj) {
    if (!connected || !port || !port.isOpen) return false;
    try {
        port.write(JSON.stringify(jsonObj) + '\n');
        return true;
    } catch (e) {
        return false;
    }
}

function isConnected() { return connected; }
function getPort() { return selectedPort; }
function on(event, fn) { emitter.on(event, fn); }
function once(event, fn) { emitter.once(event, fn); }

module.exports = { autoConnect, connect, listPorts, detectArduinoPort, send, isConnected, getPort, on, once };
