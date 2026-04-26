import { useAppState, useWs } from '../context/WsContext';
import { EmptyState, relTime } from '../components/ui';

const SEVERITY_COLOR = { Info: 'var(--accent)', Notable: 'var(--warning)', Significant: 'var(--danger)' };
const SEVERITY_BADGE = { Info: 'badge-info', Notable: 'badge-warning', Significant: 'badge-danger' };

export default function CorrelationPanel() {
    const { correlations } = useAppState();
    const { send } = useWs();

    return (
        <div>
            <div className="card p-4">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="section-header">
                    <span>Cross-Protocol Correlation Findings ({correlations.length})</span>
                    {correlations.length > 0 && (
                        <button className="btn btn-sm" onClick={() => send('clear_correlations')}>
                            Clear All
                        </button>
                    )}
                </div>

                {correlations.length === 0 ? (
                    <EmptyState message="No correlations found yet — run WiFi, BLE, and Nmap scans to enable cross-protocol analysis." />
                ) : correlations.map(f => (
                    <div key={f.id} style={{
                        borderLeft: `3px solid ${SEVERITY_COLOR[f.severity] || 'var(--border)'}`,
                        padding: '12px 14px', marginBottom: 10,
                        background: 'var(--bg)', borderRadius: '0 4px 4px 0',
                        border: '1px solid var(--border)', borderLeft: `3px solid ${SEVERITY_COLOR[f.severity] || 'var(--border)'}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span className="badge badge-gray" style={{ fontFamily: 'var(--mono)' }}>{f.ruleType}</span>
                            <span className={`badge ${SEVERITY_BADGE[f.severity] || 'badge-gray'}`}>{f.severity}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>{relTime(f.ts)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.5 }}>{f.description}</div>
                        {f.devices?.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {f.devices.map((d, i) => (
                                    <span key={i} style={{
                                        fontSize: 10, fontFamily: 'var(--mono)',
                                        padding: '1px 6px', background: 'var(--surface)',
                                        border: '1px solid var(--border)', borderRadius: 2,
                                    }}>{d.protocol}: {d.id}</span>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
