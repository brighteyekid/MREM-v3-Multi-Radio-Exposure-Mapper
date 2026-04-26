import { useState } from 'react';
import { useWs } from '../context/WsContext';

export default function SettingsPanel() {
    const { send } = useWs();
    const [intervals, setIntervals] = useState({ wifi: 15, ble: 10, nmap: 300, arp: 15 });

    return (
        <div>
            <div className="card p-4 mb-3">
                <div className="section-header">Scan Intervals</div>
                {[
                    { key: 'wifi', label: 'WiFi scan every', unit: 's', min: 5, max: 120 },
                    { key: 'ble', label: 'BLE scan every', unit: 's', min: 5, max: 60 },
                    { key: 'nmap', label: 'Nmap sweep every', unit: 's', min: 60, max: 3600 },
                    { key: 'arp', label: 'ARP read every', unit: 's', min: 5, max: 120 },
                ].map(({ key, label, unit, min, max }) => (
                    <div key={key} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span>{label}</span>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{intervals[key]}{unit}</span>
                        </div>
                        <input type="range" min={min} max={max} value={intervals[key]}
                            onChange={e => setIntervals(i => ({ ...i, [key]: +e.target.value }))}
                            style={{ width: '100%', accentColor: 'var(--accent)' }} />
                    </div>
                ))}
            </div>

            <div className="card p-4 mb-3">
                <div className="section-header">Scanner Options</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                        <span>BLE scan duration</span>
                        <input type="number" className="input" defaultValue={8} min={2} max={30} style={{ width: 80 }} /> <span style={{ fontSize: 11, color: 'var(--text-3)' }}>seconds</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                        <span>Nmap scan depth</span>
                        <select className="input" defaultValue="ping">
                            <option value="ping">Ping Sweep (fast)</option>
                            <option value="os">OS Detection (medium)</option>
                            <option value="full">Full Port Scan (slow)</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                        <span>Probe request capture (monitor mode)</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-sm btn-primary" onClick={() => send('start_probing')}>Enable</button>
                            <button className="btn btn-sm btn-danger" onClick={() => send('stop_probing')}>Disable</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card p-4 mb-3">
                <div className="section-header">Serial / Arduino</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
                    Auto-detection is active. Arduino is found by VID:2341, manufacturer string, or CH340/FTDI chipset.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input input-mono" placeholder="/dev/ttyACM0 (leave empty for auto)" style={{ flex: 1 }} />
                    <button className="btn btn-sm">Force Connect</button>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>Baud rate: 115200 (fixed)</div>
            </div>

            <div className="card p-4">
                <div className="section-header">Display</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                        { label: 'Toast notifications', key: 'toasts' },
                        { label: 'Sound alerts', key: 'sound' },
                    ].map(({ label }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                            <span>{label}</span>
                            <input type="checkbox" defaultChecked style={{ accentColor: 'var(--accent)' }} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
