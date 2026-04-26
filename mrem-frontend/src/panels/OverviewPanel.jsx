import { useAppState, useWs } from '../context/WsContext';
import { Section, Sparkline, EmptyState, relTime } from '../components/ui';

const zoneStyle = (zone) => ({
    color: zone?.color || 'var(--text-1)',
});

export default function OverviewPanel() {
    const { wifi, ble, nmap, nrf, exposure, activityFeed } = useAppState();
    const { send } = useWs();
    const ei = exposure || {};
    const score = ei.score ?? 0;
    const zone = ei.zone || { label: 'MINIMAL', color: 'var(--success)' };
    const factors = ei.factors || [];
    const history = ei.history || [];

    return (
        <div>
            {/* Exposure Index Card */}
            <div className="card p-4 mb-3">
                <div className="section-header">Exposure Index</div>
                <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                            <span style={{
                                fontFamily: 'var(--mono)', fontSize: 80, fontWeight: 700,
                                lineHeight: 1, ...zoneStyle(zone),
                            }}>{score.toFixed(1)}</span>
                            <span style={{ fontSize: 24, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{ei.trend}</span>
                        </div>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            marginTop: 6, padding: '3px 10px',
                            borderLeft: `3px solid ${zone.color}`,
                        }}>
                            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: zone.color }}>{zone.label}</span>
                        </div>
                        {/* Sparkline */}
                        {history.length > 1 && (
                            <div style={{ marginTop: 12 }}>
                                <Sparkline data={history} width={160} height={28} color={zone.color} />
                                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Last {history.length} values</div>
                            </div>
                        )}
                    </div>

                    {/* Factor table */}
                    <div style={{ flex: 1 }}>
                        {factors.map(f => (
                            <div key={f.key} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                                    <span style={{ color: 'var(--text-2)' }}>{f.name}</span>
                                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-1)' }}>{f.contribution.toFixed(2)}</span>
                                </div>
                                <div style={{ height: 3, background: 'var(--border-2)', borderRadius: 2 }}>
                                    <div style={{
                                        height: '100%', borderRadius: 2,
                                        background: 'var(--accent)',
                                        width: `${Math.min(100, f.normalized * 10)}%`,
                                        transition: 'width .4s',
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
                {[
                    {
                        label: 'WiFi Networks', val: wifi.length,
                        sub: (() => { const open = wifi.filter(n => !n.security || n.security === 'none').length; return open > 0 ? `${open} open` : 'all secured'; })(),
                        subColor: wifi.filter(n => !n.security || n.security === 'none').length > 0 ? 'var(--warning)' : 'var(--text-3)',
                    },
                    {
                        label: 'BLE Devices', val: ble.length,
                        sub: `${ble.filter(d => d.connectable).length} connectable`,
                        subColor: 'var(--text-3)',
                    },
                    {
                        label: 'Network Hosts', val: nmap.length,
                        sub: (() => { const max = Math.max(0, ...nmap.map(h => h.risk_score || 0)); return max > 0 ? `risk ${max.toFixed(0)}` : 'no risk'; })(),
                        subColor: nmap.some(h => h.risk_score > 6) ? 'var(--danger)' : 'var(--text-3)',
                    },
                    {
                        label: '2.4GHz Channels', val: (nrf.top_channels || []).length,
                        sub: `RF index ${(nrf.rf_index || 0).toFixed(1)}`,
                        subColor: 'var(--purple)',
                    },
                ].map(card => (
                    <div key={card.label} className="card p-4">
                        <div className="label mb-2">{card.label}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{card.val}</div>
                        <div style={{ fontSize: 11, marginTop: 6, color: card.subColor }}>{card.sub}</div>
                    </div>
                ))}
            </div>

            {/* Scan Buttons */}
            <div className="card p-3 mb-3">
                <div className="section-header">Quick Scan</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => { send('scan_wifi'); send('scan_ble'); send('run_nmap', { args: { target: 'auto', mode: 'ping' } }); send('run_arp'); }}>⚡ Full Scan</button>
                    <button className="btn" onClick={() => send('scan_wifi')}>▾ WiFi</button>
                    <button className="btn" onClick={() => send('scan_ble')}>◉ BLE</button>
                    <button className="btn" onClick={() => send('run_nmap', { args: { target: 'auto', mode: 'ping' } })}>⊡ Nmap</button>
                    <button className="btn" onClick={() => send('run_arp')}>↔ ARP</button>
                    <button className="btn" onClick={() => send('arduino', { args: { payload: { cmd: 'ping' } } })}>◈ Ping Arduino</button>
                    <button className="btn" onClick={() => send('save_session', { args: { notes: '' } })}>💾 Save Session</button>
                </div>
            </div>

            {/* Activity Feed */}
            <div className="card p-4">
                <div className="section-header">Recent Activity</div>
                {activityFeed.length === 0 ? (
                    <EmptyState message="No activity yet — run a scan to start" />
                ) : activityFeed.map(item => (
                    <div key={item.id} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        padding: '7px 0', borderBottom: '1px solid var(--border-2)',
                        fontSize: 12,
                    }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color || 'var(--text-3)', marginTop: 4, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', marginRight: 8 }}>{item.source}</span>
                            {item.message}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{relTime(item.ts)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
