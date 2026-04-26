import { useState } from 'react';
import { useAppState, useWs } from '../context/WsContext';
import { SignalBar, SecurityBadge, TrendArrow, Sparkline, EmptyState, Section, KV, relTime } from '../components/ui';

export default function WifiPanel() {
    const { wifi } = useAppState();
    const { send } = useWs();
    const [expanded, setExpanded] = useState(null);
    const [search, setSearch] = useState('');

    const filtered = wifi.filter(n =>
        !search || (n.ssid || '').toLowerCase().includes(search.toLowerCase()) ||
        (n.bssid || '').toLowerCase().includes(search.toLowerCase())
    );

    // Channel distribution
    const chDist = {};
    filtered.forEach(n => { const ch = n.channel; if (ch) chDist[ch] = (chDist[ch] || 0) + 1; });
    const maxCh = Math.max(1, ...Object.values(chDist));

    return (
        <div>
            <div className="card p-4 mb-3">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className="section-header" style={{ marginBottom: 0 }}>WiFi Networks ({wifi.length})</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input className="input" placeholder="Search SSID / BSSID…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 200 }} />
                        <button className="btn btn-primary btn-sm" onClick={() => send('scan_wifi')}>Scan</button>
                    </div>
                </div>

                {/* Channel distribution */}
                {Object.keys(chDist).length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                        <div className="label mb-2">Channel Distribution</div>
                        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 36 }}>
                            {[...Array(14)].map((_, i) => {
                                const ch = i + 1; const count = chDist[ch] || 0;
                                return (
                                    <div key={ch} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                        <div style={{ height: 28, display: 'flex', alignItems: 'flex-end' }}>
                                            <div style={{
                                                width: '100%', minWidth: 8,
                                                height: count ? `${(count / maxCh) * 100}%` : 3,
                                                background: count ? 'var(--accent)' : 'var(--border-2)',
                                                borderRadius: 2, minHeight: 3, transition: 'height .3s',
                                            }} title={`Ch ${ch}: ${count} networks`} />
                                        </div>
                                        <span style={{ fontSize: 8, color: 'var(--text-3)' }}>{ch}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {filtered.length === 0 ? <EmptyState message="No WiFi networks found — click Scan" /> : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Signal</th><th>SSID</th><th>BSSID</th><th>Ch</th>
                                <th>Security</th><th>Quality</th><th>Vendor</th><th>Seen</th><th>Trend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((n, i) => {
                                const key = n.bssid || i;
                                const isOpen = expanded === key;
                                const isRisky = !n.security || n.security === 'none' || (n.security || '').toUpperCase().includes('WEP');
                                return [
                                    <tr key={key} className={isRisky ? 'row-risky' : ''} onClick={() => setExpanded(isOpen ? null : key)}>
                                        <td><SignalBar rssi={n.signal_level} /></td>
                                        <td style={{ fontWeight: 500, maxWidth: 160 }}>{n.ssid || <span style={{ color: 'var(--text-3)' }}>[hidden]</span>}</td>
                                        <td className="mono" style={{ fontSize: 11 }}>{n.bssid}</td>
                                        <td>{n.channel}</td>
                                        <td><SecurityBadge security={n.security} /></td>
                                        <td>{n.quality != null ? `${n.quality}%` : '—'}</td>
                                        <td style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 120 }}>{n.vendor || '—'}</td>
                                        <td style={{ fontSize: 11, color: 'var(--text-3)' }}>{relTime(n.firstSeen)}</td>
                                        <td><TrendArrow trend={n.trend} /></td>
                                    </tr>,
                                    isOpen && (
                                        <tr key={`${key}-detail`}>
                                            <td colSpan={9} style={{ padding: 0 }}>
                                                <div className="expand-detail">
                                                    <div className="detail-grid">
                                                        <KV label="BSSID" value={n.bssid} mono />
                                                        <KV label="Frequency" value={n.frequency ? `${n.frequency} MHz` : '—'} />
                                                        <KV label="Signal" value={`${n.signal_level} dBm`} mono />
                                                        <KV label="Quality" value={n.quality ? `${n.quality}%` : '—'} />
                                                        <KV label="Vendor" value={n.vendor} />
                                                        <KV label="Times Seen" value={n.appearanceCount} />
                                                        <KV label="First Seen" value={relTime(n.firstSeen)} />
                                                    </div>
                                                    {n.sparkline?.length > 1 && (
                                                        <div style={{ marginTop: 10 }}>
                                                            <div className="label mb-2">RSSI History</div>
                                                            <Sparkline data={n.sparkline} width={200} height={32} />
                                                        </div>
                                                    )}
                                                    <button className="btn btn-sm mt-3" onClick={() => send('add_watchlist', { args: { mac: n.bssid } })}>+ Add to Watchlist</button>
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
