import { useEffect, useState } from 'react';
import styles from './Bootsplash.module.css';

const CHECKS = [
    { key: 'backend', label: 'Connecting to backend...', field: null },
    { key: 'arduino', label: 'Checking Arduino serial...', field: 'arduino' },
    { key: 'wifi', label: 'WiFi scanner...', field: 'wifi' },
    { key: 'ble', label: 'BLE scanner...', field: 'ble' },
    { key: 'nmap', label: 'Nmap engine...', field: 'nmap' },
    { key: 'rf', label: 'RF monitor...', field: 'arduino' },
    { key: 'db', label: 'Loading history database...', field: null },
    { key: 'reg', label: 'Building device registry...', field: null },
    { key: 'rfcam', label: 'RF Camera engine...', field: null },
];

export default function Bootsplash({ onDone }) {
    const [lines, setLines] = useState([]);
    const [wiping, setWiping] = useState(false);

    useEffect(() => {
        let status = {};
        async function fetchStatus() {
            try {
                const r = await fetch('/api/status');
                status = await r.json();
            } catch { status = {}; }
        }

        async function runChecks() {
            await fetchStatus();
            for (let i = 0; i < CHECKS.length; i++) {
                await delay(200);
                const check = CHECKS[i];
                let ok = true, warn = false, result = 'READY';

                if (check.key === 'backend') {
                    ok = !!status;
                    result = ok ? 'ONLINE' : 'OFFLINE';
                    if (!ok) warn = true;
                } else if (check.key === 'arduino') {
                    ok = status?.arduino;
                    result = ok ? `FOUND (${status.arduinoPort || 'serial'})` : 'WAITING — connect USB';
                    warn = !ok;
                } else if (check.key === 'ble') {
                    const bleState = status?.bleState || 'unknown';
                    ok = bleState === 'poweredOn';
                    if (bleState === 'unauthorized') {
                        result = 'UNAUTHORIZED — run: sudo node server.js';
                        warn = true;
                    } else if (bleState === 'unsupported') {
                        result = 'NO ADAPTER';
                        warn = true;
                    } else if (ok) {
                        result = 'READY';
                    } else {
                        result = `STATE: ${bleState}`;
                        warn = true;
                    }
                } else if (check.key === 'rf') {
                    ok = status?.arduino;
                    result = ok ? 'ACTIVE' : 'WAITING';
                    warn = !ok;
                } else if (check.field) {
                    ok = !!status[check.field];
                    result = ok ? 'READY' : 'UNAVAILABLE';
                    warn = !ok;
                } else if (check.key === 'rfcam') {
                    try {
                        const r = await fetch('/api/rfcam/status');
                        const rfStatus = await r.json();
                        ok = rfStatus.calibrated;
                        result = ok ? `READY · ${rfStatus.ap_count} APs in baseline` : 'CALIBRATION NEEDED';
                        warn = !ok;
                    } catch {
                        result = 'ENGINE STARTING';
                        warn = true;
                    }
                } else {
                    result = 'OK';
                }

                setLines(ls => [...ls, { label: check.label, result, ok, warn }]);
            }

            await delay(600);
            setWiping(true);
            await delay(500);
            onDone();
        }

        runChecks();
    }, [onDone]);

    return (
        <div className={`${styles.splash} ${wiping ? styles.wipe : ''}`}>
            <div className={styles.logo}>
                <div className={styles.title}>MREM</div>
                <div className={styles.tagline}>MULTI-RADIO EXPOSURE MAPPER</div>
                <div className={styles.version}>v3.0</div>
            </div>
            <div className={styles.checks}>
                {lines.map((l, i) => (
                    <div key={i} className={styles.checkLine}
                        style={{ animationDelay: `${i * 0.05}s` }}>
                        <span>→ {l.label}</span>
                        <span className={l.warn ? styles.warn : l.ok ? styles.ok : styles.wait}>
                            [{l.result}]
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

const delay = ms => new Promise(r => setTimeout(r, ms));
