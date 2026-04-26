import { useState } from 'react';
import { useAppState, useWs } from '../context/WsContext';
import { RiskBadge, PortBadge, EmptyState, KV, relTime } from '../components/ui';

export default function NetworkPanel() {
    const { nmap, arp, dns } = useAppState();
    const { send } = useWs();
    const [expanded, setExpanded] = useState(null);
    const [target, setTarget] = useState('');
    const [mode, setMode] = useState('ping');

    const runNmap = () => send('run_nmap', { args: { target: target || 'auto', mode } });

    return (
        <div>
            {/* Nmap Section */}
            <div className="card p-4 mb-3">
                <div className="section-header">Nmap Host Discovery</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <input className="input" placeholder="Target (auto-detect if empty)" value={target}
                        onChange={e => setTarget(e.target.value)} style={{ width: 220 }} />
                    <div className="btn-group">
                        {['ping', 'os', 'full'].map(m => (
                            <button key={m} className={`btn btn-sm ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
                                {m === 'ping' ? 'Ping Sweep' : m === 'os' ? 'OS Detect' : 'Full Scan'}
                            </button>
                        ))}
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={runNmap}>Run Scan</button>
                </div>

                {nmap.length === 0 ? <EmptyState message="No hosts found yet — run a ping sweep" /> : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>IP</th><th>Hostname</th><th>MAC</th><th>Vendor</th>
                                <th>OS</th><th>Open Ports</th><th>Risk</th>
                            </tr>
                        </thead>
                        <tbody>
                            {nmap.map((h, i) => {
                                const key = h.ip || i;
                                const isOpen = expanded === key;
                                const risk = h.risk_score || 0;
                                return [
                                    <tr key={key}
                                        className={risk >= 8 ? 'row-critical' : risk >= 5 ? 'row-risky' : ''}
                                        onClick={() => setExpanded(isOpen ? null : key)}>
                                        <td className="mono" style={{ fontWeight: 500 }}>{h.ip}</td>
                                        <td style={{ fontSize: 11, maxWidth: 140 }}>{h.hostname || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                                        <td className="mono" style={{ fontSize: 10 }}>{h.mac || '—'}</td>
                                        <td style={{ fontSize: 11, maxWidth: 100 }}>{h.vendor || '—'}</td>
                                        <td style={{ fontSize: 11, maxWidth: 120 }}>{h.os_match ? `${h.os_match.slice(0, 20)}…` : '—'}</td>
                                        <td>
                                            {(h.ports || []).slice(0, 5).map(p => (
                                                <PortBadge key={p.port} port={p.port} service={p.service} />
                                            ))}
                                        </td>
                                        <td><RiskBadge score={h.risk_score || 0} reasons={h.risk_reasons || []} /></td>
                                    </tr>,
                                    isOpen && (
                                        <tr key={`${key}-d`}>
                                            <td colSpan={7} style={{ padding: 0 }}>
                                                <div className="expand-detail">
                                                    <div className="detail-grid">
                                                        <KV label="IP Address" value={h.ip} mono />
                                                        <KV label="MAC" value={h.mac} mono />
                                                        <KV label="Hostname" value={h.hostname} />
                                                        <KV label="Vendor" value={h.vendor} />
                                                        <KV label="OS Match" value={h.os_match} />
                                                        <KV label="OS Confidence" value={h.os_confidence ? `${h.os_confidence}%` : '—'} />
                                                        <KV label="Risk Score" value={h.risk_score} />
                                                    </div>
                                                    {h.risk_reasons?.length > 0 && (
                                                        <div style={{ marginTop: 8 }}>
                                                            <div className="label mb-2">Risk Factors</div>
                                                            {h.risk_reasons.map((r, i) => (
                                                                <div key={i} style={{ fontSize: 11, color: 'var(--danger)', margin: '2px 0' }}>▸ {r}</div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {h.ports?.length > 0 && (
                                                        <div style={{ marginTop: 8 }}>
                                                            <div className="label mb-2">Open Ports</div>
                                                            {h.ports.map(p => (
                                                                <div key={p.port} style={{ fontSize: 11, fontFamily: 'var(--mono)', margin: '2px 0' }}>
                                                                    {p.port}/{p.protocol} — {p.service} {p.version}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                                                        <button className="btn btn-sm" onClick={() => send('run_nmap', { args: { target: h.ip, mode: 'os' } })}>OS Detect</button>
                                                        <button className="btn btn-sm" onClick={() => send('run_nmap', { args: { target: h.ip, mode: 'full' } })}>Full Scan</button>
                                                        <button className="btn btn-sm" onClick={() => send('run_dns', { args: { ip: h.ip } })}>Resolve DNS</button>
                                                        <button className="btn btn-sm" onClick={() => send('add_watchlist', { args: { mac: h.mac } })}>+ Watchlist</button>
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

            {/* ARP Table */}
            <div className="card p-4 mb-3">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className="section-header" style={{ marginBottom: 0 }}>ARP Table ({arp.length} entries)</div>
                    <button className="btn btn-sm" onClick={() => send('run_arp')}>Refresh</button>
                </div>
                {arp.length === 0 ? <EmptyState message="ARP cache empty" /> : (
                    <table className="data-table">
                        <thead><tr><th>IP</th><th>MAC</th><th>Vendor</th><th>Interface</th><th>In Nmap?</th></tr></thead>
                        <tbody>
                            {arp.map((a, i) => {
                                const inNmap = nmap.some(h => h.ip === a.ip || h.mac === a.mac);
                                return (
                                    <tr key={i}>
                                        <td className="mono">{a.ip}</td>
                                        <td className="mono" style={{ fontSize: 11 }}>{a.mac}</td>
                                        <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.vendor || '—'}</td>
                                        <td style={{ fontSize: 11 }}>{a.iface || '—'}</td>
                                        <td>{inNmap ? <span className="badge badge-success">YES</span> : <span className="badge badge-gray">no</span>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* DNS Findings */}
            <div className="card p-4">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className="section-header" style={{ marginBottom: 0 }}>DNS Findings ({dns.length})</div>
                </div>
                {dns.length === 0 ? <EmptyState message="No DNS results yet — scan hosts first" /> : (
                    <table className="data-table">
                        <thead><tr><th>IP</th><th>Hostname (PTR)</th><th>Device Type</th></tr></thead>
                        <tbody>
                            {dns.map((d, i) => (
                                <tr key={i}>
                                    <td className="mono">{d.ip}</td>
                                    <td style={{ fontSize: 11 }}>{d.hostname || <span style={{ color: 'var(--text-3)' }}>unresolved</span>}</td>
                                    <td>{d.deviceType ? <span className="badge badge-info">{d.deviceType}</span> : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
