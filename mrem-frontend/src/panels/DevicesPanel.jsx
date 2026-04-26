import { useState } from 'react';
import { useAppState } from '../context/WsContext';
import { TrendArrow, Sparkline, EmptyState, relTime } from '../components/ui';

export default function DevicesPanel() {
    const { wifi, ble, nmap, arp } = useAppState();
    const [search, setSearch] = useState('');
    const [filterProto, setProto] = useState('all');

    // Merge all devices into unified list
    const all = [
        ...wifi.map(n => ({ protocol: 'wifi', id: n.bssid, name: n.ssid || '[hidden]', vendor: n.vendor, firstSeen: n.firstSeen, lastSeen: n.ts, count: n.appearanceCount, rssi: n.signal_level, trend: n.trend, sparkline: n.sparkline })),
        ...ble.map(d => ({ protocol: 'ble', id: d.id, name: d.localName || '[unnamed]', vendor: d.vendor, firstSeen: d.firstSeen, lastSeen: d.ts, count: d.appearanceCount, rssi: d.rssi, trend: d.trend, sparkline: d.sparkline })),
        ...nmap.map(h => ({ protocol: 'nmap', id: h.ip, name: h.hostname || h.ip, vendor: h.vendor, firstSeen: null, lastSeen: h.ts, count: 1, rssi: null, trend: null, sparkline: null })),
        ...arp.map(a => ({ protocol: 'arp', id: a.ip, name: a.ip, vendor: a.vendor, firstSeen: null, lastSeen: a.ts, count: 1, rssi: null, trend: null, sparkline: null })),
    ];

    const PROTO_COLOR = { wifi: 'var(--accent)', ble: 'var(--purple)', nmap: 'var(--success)', arp: 'var(--warning)' };

    const filtered = all.filter(d => {
        if (filterProto !== 'all' && d.protocol !== filterProto) return false;
        if (!search) return true;
        return (d.name || '').toLowerCase().includes(search.toLowerCase()) ||
            (d.id || '').toLowerCase().includes(search.toLowerCase());
    });

    return (
        <div>
            <div className="card p-4">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className="section-header" style={{ marginBottom: 0 }}>Device Registry ({all.length} total)</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input className="input" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 160 }} />
                        <select className="input" value={filterProto} onChange={e => setProto(e.target.value)}>
                            <option value="all">All Protocols</option>
                            <option value="wifi">WiFi</option>
                            <option value="ble">BLE</option>
                            <option value="nmap">Nmap</option>
                            <option value="arp">ARP</option>
                        </select>
                    </div>
                </div>

                {filtered.length === 0 ? <EmptyState message="No devices found" /> : (
                    <table className="data-table">
                        <thead>
                            <tr><th>Protocol</th><th>Name / ID</th><th>Vendor</th><th>First Seen</th><th>Last Seen</th><th>Times</th><th>RSSI</th><th>Trend</th><th>Sparkline</th></tr>
                        </thead>
                        <tbody>
                            {filtered.map((d, i) => (
                                <tr key={d.id + d.protocol + i}>
                                    <td>
                                        <span style={{
                                            fontSize: 9, fontWeight: 700, padding: '1px 5px',
                                            background: PROTO_COLOR[d.protocol] + '22',
                                            color: PROTO_COLOR[d.protocol], borderRadius: 2,
                                            fontFamily: 'var(--mono)', textTransform: 'uppercase',
                                        }}>{d.protocol}</span>
                                    </td>
                                    <td style={{ maxWidth: 160 }}>
                                        <div style={{ fontWeight: 500, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{d.id}</div>
                                    </td>
                                    <td style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 120 }}>{d.vendor || '—'}</td>
                                    <td style={{ fontSize: 11, color: 'var(--text-3)' }}>{relTime(d.firstSeen)}</td>
                                    <td style={{ fontSize: 11, color: 'var(--text-3)' }}>{relTime(d.lastSeen)}</td>
                                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{d.count ?? '—'}</td>
                                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{d.rssi != null ? `${d.rssi}` : '—'}</td>
                                    <td>{d.trend ? <TrendArrow trend={d.trend} /> : '—'}</td>
                                    <td>{d.sparkline?.length > 1 ? <Sparkline data={d.sparkline} width={50} height={16} /> : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
