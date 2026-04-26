import { useState } from 'react';
import { useAppState, useWs } from '../context/WsContext';
import { EmptyState, relTime } from '../components/ui';

const SEV_COLOR = { info: 'var(--accent)', warning: 'var(--warning)', critical: 'var(--danger)' };

export default function AlertsPanel() {
    const { alerts } = useAppState();
    const { send, ackAlert } = useWs();
    const [mac, setMac] = useState('');

    const active = (alerts || []).filter(a => !a.acknowledged);
    const log = (alerts || []).filter(a => a.acknowledged);

    return (
        <div>
            <div className="card p-4 mb-3">
                <div className="section-header">Active Alerts ({active.length})</div>
                {active.length === 0 ? (
                    <EmptyState message="No active alerts" />
                ) : active.map(a => (
                    <div key={a.id} style={{
                        display: 'flex', gap: 12, alignItems: 'flex-start',
                        padding: '10px 0', borderBottom: '1px solid var(--border-2)',
                    }}>
                        <div style={{ width: 3, alignSelf: 'stretch', background: SEV_COLOR[a.severity] || 'var(--text-3)', borderRadius: 2 }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: SEV_COLOR[a.severity] }}>{a.severity}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{a.source}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>{relTime(a.ts)}</span>
                            </div>
                            <div style={{ fontSize: 12 }}>{a.description}</div>
                        </div>
                        <button className="btn btn-sm" onClick={() => ackAlert(a.id)}>Acknowledge</button>
                    </div>
                ))}
            </div>

            <div className="card p-4 mb-3">
                <div className="section-header">Alert Configuration</div>
                {[
                    { label: 'Exposure Index threshold', metric: 'exposureIndex', def: 7.5, min: 1, max: 10, step: 0.1 },
                    { label: 'NRF spike % above baseline', metric: 'nrfSpikePercent', def: 50, min: 10, max: 200, step: 10 },
                    { label: 'BLE surge count/min', metric: 'bleCountPerMinute', def: 10, min: 1, max: 50, step: 1 },
                ].map(({ label, metric, def, min, max, step }) => (
                    <div key={metric} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span>{label}</span>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{def}</span>
                        </div>
                        <input type="range" min={min} max={max} step={step} defaultValue={def}
                            onChange={e => send('set_threshold', { args: { metric, value: +e.target.value } })}
                            style={{ width: '100%', accentColor: 'var(--accent)' }} />
                    </div>
                ))}
            </div>

            <div className="card p-4 mb-3">
                <div className="section-header">MAC Watchlist</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input className="input input-mono" placeholder="aa:bb:cc:dd:ee:ff" value={mac}
                        onChange={e => setMac(e.target.value)} style={{ flex: 1 }} />
                    <button className="btn btn-primary btn-sm" onClick={() => { if (mac) { send('add_watchlist', { args: { mac } }); setMac(''); } }}>
                        + Add
                    </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Watched MACs fire a CRITICAL alert on detection across WiFi, BLE, ARP, and Nmap.</div>
            </div>

            {log.length > 0 && (
                <div className="card p-4">
                    <div className="section-header">Alert Log ({log.length} acknowledged)</div>
                    {log.slice(0, 30).map(a => (
                        <div key={a.id} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border-2)', fontSize: 11, color: 'var(--text-2)' }}>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)', fontSize: 10, flexShrink: 0 }}>{relTime(a.ts)}</span>
                            <span className="mono" style={{ flexShrink: 0 }}>[{a.source}]</span>
                            <span>{a.description}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
