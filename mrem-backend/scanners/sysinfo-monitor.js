// MREM v3 — System Info Monitor
// CPU, RAM, temperature, battery via systeminformation npm

let si;
try {
    si = require('systeminformation');
} catch {
    si = null;
}

async function read() {
    if (!si) return fallback();

    try {
        const [cpu, mem, temp, battery, osInfo, time] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.cpuTemperature(),
            si.battery(),
            si.osInfo(),
            si.time(),
        ]);

        return {
            cpuPercent: +(cpu.currentLoad || 0).toFixed(1),
            cpuCores: (cpu.cpus || []).map(c => +(c.load || 0).toFixed(1)),
            memTotal: mem.total,
            memFree: mem.free,
            memUsedPct: +((1 - mem.free / mem.total) * 100).toFixed(1),
            tempC: temp.main || null,
            batteryPct: battery.percent || null,
            batteryCharging: battery.isCharging || null,
            platform: osInfo.platform,
            distro: osInfo.distro,
            uptimeSec: time.uptime || 0,
            hostname: require('os').hostname(),
            ts: Date.now(),
        };
    } catch (e) {
        return fallback();
    }
}

function fallback() {
    const os = require('os');
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    return {
        cpuPercent: null,
        cpuCores: [],
        memTotal: totalMem,
        memFree: freeMem,
        memUsedPct: +((1 - freeMem / totalMem) * 100).toFixed(1),
        tempC: readLinuxTemp(),
        batteryPct: null,
        batteryCharging: null,
        platform: os.platform(),
        distro: '',
        uptimeSec: os.uptime(),
        hostname: os.hostname(),
        ts: Date.now(),
    };
}

function readLinuxTemp() {
    try {
        const fs = require('fs');
        const val = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8').trim();
        return +(+val / 1000).toFixed(1);
    } catch { return null; }
}

module.exports = { read };
