import { useState, useEffect } from 'react';
import { useWs } from '../context/WsContext';
import { EmptyState, relTime } from '../components/ui';

export default function HistoryPanel() {
    const { send } = useWs();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(false);

    async function loadSessions() {
        setLoading(true);
        try {
            const r = await fetch('/api/sessions');
            setSessions(await r.json());
        } catch { setSessions([]); }
        setLoading(false);
    }

    useEffect(() => { loadSessions(); }, []);

    function replaySession(id) {
        send('replay_session', { args: { session_id: id } });
    }

    // Timeline sparkline from EI values
    const eiValues = sessions.map(s => s.exposure_index || 0);

    return (
        <div>
            <div className="card p-4 mb-3">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className="section-header" style={{ marginBottom: 0 }}>Scan Sessions ({sessions.length})</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm" onClick={loadSessions}>Refresh</button>
                        <button className="btn btn-primary btn-sm" onClick={() => send('save_session', { args: { notes: '' } })}>Save Current</button>
                    </div>
                </div>

                {/* EI Timeline */}
                {eiValues.length > 1 && (
                    <div style={{ marginBottom: 16 }}>
                        <div className="label mb-2">Exposure Index Over Time</div>
                        <div style={{ position: 'relative', height: 48, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <svg width="100%" height="48" preserveAspectRatio="none" viewBox={`0 0 ${eiValues.length} 10`}>
                                <polyline
                                    points={eiValues.map((v, i) => `${i},${10 - v}`).join(' ')}
                                    fill="none" stroke="var(--accent)" strokeWidth="0.3"
                                />
                            </svg>
                            <div style={{ position: 'absolute', bottom: 4, right: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                                EI trend
                            </div>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)', fontSize: 12 }}>Loading sessions...</div>
                ) : sessions.length === 0 ? (
                    <EmptyState message="No sessions saved yet — run scans and click Save Current" />
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr><th>Date</th><th>Duration</th><th>WiFi</th><th>BLE</th><th>Hosts</th><th>EI</th><th>Notes</th><th></th></tr>
                        </thead>
                        <tbody>
                            {sessions.map(s => {
                                const dur = s.completed_at && s.started_at
                                    ? Math.round((s.completed_at - s.started_at) / 1000) + 's'
                                    : '—';
                                const ei = s.exposure_index || 0;
                                const eiColor = ei >= 7 ? 'var(--danger)' : ei >= 5 ? 'var(--warning)' : 'var(--success)';
                                return (
                                    <tr key={s.session_id}>
                                        <td style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{new Date(s.started_at).toLocaleString()}</td>
                                        <td style={{ fontSize: 11 }}>{dur}</td>
                                        <td style={{ fontFamily: 'var(--mono)' }}>{s.wifi_count}</td>
                                        <td style={{ fontFamily: 'var(--mono)' }}>{s.ble_count}</td>
                                        <td style={{ fontFamily: 'var(--mono)' }}>{s.nmap_count}</td>
                                        <td style={{ fontFamily: 'var(--mono)', color: eiColor, fontWeight: 600 }}>{ei.toFixed(1)}</td>
                                        <td style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 120 }}>{s.notes || '—'}</td>
                                        <td><button className="btn btn-sm" onClick={() => replaySession(s.session_id)}>Replay</button></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
