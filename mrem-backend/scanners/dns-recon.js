const dns = require('dns').promises;
const { isIPv4 } = require('net');

// Expanded taxonomy using regex boundaries to eliminate false positives (e.g., 'cambridge' matching 'cam')
const DEVICE_PATTERNS = {
    camera: /\b(cam|camera|ring|arlo|nest|wyze|blink|hikvision|dahua|axis)\b/i,
    router: /\b(router|gateway|gw|ap|access-point|cisco|juniper|mikrotik|pfsense|opnsense)\b/i,
    firewall: /\b(fw|firewall|asa|fortigate|paloalto|panw|sophos|sonicwall)\b/i,
    printer: /\b(printer|print|hp|canon|epson|brother|lexmark)\b/i,
    iot: /\b(hub|bridge|smartthings|hue|thermostat|alexa|sonos)\b/i,
    workstation: /\b(laptop|macbook|thinkpad|surface|desktop|ws|pc|client)\b/i,
    server: /\b(srv|server|host|node|hypervisor|esxi|vcenter|proxmox)\b/i,
    nas: /\b(nas|san|qnap|synology|truenas|freenas|storage)\b/i,
    db: /\b(db|sql|mysql|postgres|redis|mongo|cassandra|oracle)\b/i,
    dev: /\b(dev|test|stage|stg|uat|qa|build|jenkins|gitlab)\b/i,
    lb: /\b(lb|loadbalancer|haproxy|nginx|f5|netscaler)\b/i,
    ics: /\b(scada|plc|hmi|modbus|siemens|rockwell|allen-bradley)\b/i
};

const cache = new Map();

// Critical for preventing DNS resolver hangs on unreachable/tarpitted nameservers
const withTimeout = (promise, ms) => {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

async function fullRecon(ip, timeoutMs = 2000) {
    if (cache.has(ip)) return cache.get(ip);
    if (!isIPv4(ip)) throw new Error('Invalid IPv4 format');

    const result = { ip, ptr: null, aRecords: [], type: null, isSpoofed: false };

    try {
        const hostnames = await withTimeout(dns.reverse(ip), timeoutMs);
        if (!hostnames || hostnames.length === 0) {
            cache.set(ip, result);
            return result;
        }

        result.ptr = hostnames[0];
        result.type = classifyHostname(result.ptr);

        // Security check: Forward resolve the PTR to verify it maps back to the IP.
        // Identifies stale DNS records, subdomain takeovers, or intentional deceptive PTRs.
        try {
            const aRecords = await withTimeout(dns.resolve4(result.ptr), timeoutMs);
            result.aRecords = aRecords;
            result.isSpoofed = !aRecords.includes(ip);
        } catch (err) {
            result.isSpoofed = true; // Forward resolution failed, indicating a broken/stale record
        }

    } catch (err) {
        // Silently swallow timeouts and NXDOMAIN errors during bulk sweeps
    }

    cache.set(ip, result);
    return result;
}

function classifyHostname(hostname) {
    if (!hostname) return null;
    for (const [type, pattern] of Object.entries(DEVICE_PATTERNS)) {
        if (pattern.test(hostname)) return type;
    }
    return 'unknown';
}

// True concurrency model using a worker pool.
// The previous implementation fired all promises immediately during array construction,
// overwhelming the local resolver before the batching loop even executed.
async function sweepSubnet(baseIp, start = 1, end = 254, concurrency = 50, timeoutMs = 2000) {
    const parts = baseIp.split('.');
    const base = parts.slice(0, 3).join('.');
    let currentIndex = start;
    const results = [];

    const worker = async () => {
        while (currentIndex <= end) {
            const ip = `${base}.${currentIndex++}`;
            const res = await fullRecon(ip, timeoutMs);
            if (res.ptr) results.push(res);
        }
    };

    // Instantiate workers up to the concurrency limit or the number of targets
    const workers = Array.from({ length: Math.min(concurrency, end - start + 1) }, worker);
    await Promise.all(workers);

    return results;
}

// Extract extended records for identified high-value targets
async function queryExtendedRecords(domain) {
    try {
        const [txt, cname, mx] = await Promise.allSettled([
            dns.resolveTxt(domain),
            dns.resolveCname(domain),
            dns.resolveMx(domain)
        ]);
        return {
            txt: txt.status === 'fulfilled' ? txt.value.flat() : [],
            cname: cname.status === 'fulfilled' ? cname.value : [],
            mx: mx.status === 'fulfilled' ? mx.value.map(record => record.exchange) : []
        };
    } catch {
        return { txt: [], cname: [], mx: [] };
    }
}

module.exports = { fullRecon, sweepSubnet, classifyHostname, queryExtendedRecords };