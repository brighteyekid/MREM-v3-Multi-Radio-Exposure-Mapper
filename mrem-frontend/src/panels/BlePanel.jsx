import { useState } from 'react';
import { useAppState, useWs } from '../context/WsContext';
import { SignalBar, TrendArrow, Sparkline, EmptyState, KV, relTime } from '../components/ui';

export default function BlePanel() {
    const { ble } = useAppState();
    const { send } = useWs();
    const [expanded, setExpanded] = useState(null);
    const [search, setSearch] = useState('');

    const filtered = ble.filter(d => !search ||
        (d.localName || '').toLowerCase().includes(search.toLowerCase()) ||
        (d.id || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div>
            <div className="card p-4">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className="section-header" style={{ marginBottom: 0 }}>BLE Devices ({ble.length})</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input className="input" placeholder="Search name / addr…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 200 }} />
                        <button className="btn btn-primary btn-sm" onClick={() => send('scan_ble')}>Scan</button>
                    </div>
                </div>

                {filtered.length === 0 ? <EmptyState message="No BLE devices found — click Scan" /> : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th><th>Address</th><th>RSSI</th><th>Trend</th>
                                <th>Type</th><th>Connectable</th><th>Vendor</th><th>Seen</th><th>×</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((d, i) => {
                                const key = d.id || i;
                                const isOpen = expanded === key;
                                const isRandom = d.addressType === 'random';
                                return [
                                    <tr key={key} onClick={() => setExpanded(isOpen ? null : key)}>
                                        <td style={{ fontWeight: 500, maxWidth: 150 }}>
                                            {d.localName || <span style={{ color: 'var(--text-3)', fontSize: 11 }}>[unnamed]</span>}
                                        </td>
                                        <td className="mono" style={{ fontSize: 11 }}>
                                            {isRandom ? (
                                                <span title="BLE random address — changes for privacy">{d.id} <span style={{ color: 'var(--text-3)', fontSize: 10 }}>[random]</span></span>
                                            ) : d.id}
                                        </td>
                                        <td className="mono" style={{ fontSize: 11 }}>{d.rssi} dBm</td>
                                        <td><TrendArrow trend={d.trend} /></td>
                                        <td style={{ fontSize: 11 }}>{d.addressType || '—'}</td>
                                        <td>{d.connectable ? <span className="badge badge-warning">YES</span> : <span className="badge badge-gray">no</span>}</td>
                                        <td style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 120 }}>{d.vendor || '—'}</td>
                                        <td style={{ fontSize: 11, color: 'var(--text-3)' }}>{relTime(d.firstSeen)}</td>
                                        <td style={{ fontSize: 11, color: 'var(--text-3)' }}>{d.appearanceCount || 1}</td>
                                    </tr>,
                                    isOpen && (
                                        <tr key={`${key}-d`}>
                                            <td colSpan={9} style={{ padding: 0 }}>
                                                <div className="expand-detail">
                                                    <div className="detail-grid">
                                                        <KV label="Address" value={d.id} mono />
                                                        <KV label="Address Type" value={d.addressType} />
                                                        <KV label="RSSI" value={`${d.rssi} dBm`} mono />
                                                        <KV label="Connectable" value={d.connectable ? 'Yes' : 'No'} />
                                                        <KV label="Vendor" value={d.vendor} />
                                                        <KV label="Times Seen" value={d.appearanceCount} />
                                                        <KV label="First Seen" value={relTime(d.firstSeen)} />
                                                        <KV label="Services" value={(d.serviceUuids || []).join(', ') || '—'} mono />
                                                    </div>
                                                    {d.sparkline?.length > 1 && (
                                                        <div style={{ marginTop: 10 }}>
                                                            <div className="label mb-2">RSSI History</div>
                                                            <Sparkline data={d.sparkline} width={200} height={32} color="var(--purple)" />
                                                        </div>
                                                    )}
                                                    <div style={{ marginTop: 10 }}>
                                                        <button className="btn btn-sm" onClick={() => send('add_watchlist', { args: { mac: d.id } })}>+ Add to Watchlist</button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ),
                                ].filter(Boolean);
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
