import { useEffect, useRef } from 'react';

/** Returns signal strength bars (4 bars) based on dBm */
export function SignalBar({ rssi }) {
    const s = rssi || -100;
    const level = s > -50 ? 4 : s > -65 ? 3 : s > -75 ? 2 : s > -85 ? 1 : 0;
    return (
        <div className="signal-bar" title={`${rssi} dBm`}>
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="bar" style={{
                    height: `${i * 3 + 4}px`,
                    background: i <= level ? 'var(--success)' : 'var(--border)',
                }} />
            ))}
        </div>
    );
}

/** Trend arrow */
export function TrendArrow({ trend }) {
    if (trend === 'approaching') return <span className="trend-up" title="Approaching">↑</span>;
    if (trend === 'receding') return <span className="trend-down" title="Receding">↓</span>;
    return <span className="trend-flat" title="Stationary">→</span>;
}

/** Inline SVG sparkline for RSSI history */
export function Sparkline({ data = [], width = 60, height = 20, color = 'var(--accent)' }) {
    if (!data || data.length < 2) return <span style={{ color: 'var(--text-3)', fontSize: 10 }}>—</span>;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');
    return (
        <svg width={width} height={height} style={{ display: 'block' }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
    );
}

/** Colored risk badge */
export function RiskBadge({ score, reasons = [] }) {
    const cls = score >= 8 ? 'badge-danger' : score >= 5 ? 'badge-warning' : score >= 2 ? 'badge-gray' : 'badge-success';
    const label = score >= 8 ? 'HIGH' : score >= 5 ? 'MED' : score >= 2 ? 'LOW' : 'CLEAN';
    return (
        <span className={`badge ${cls}`} title={reasons.join('\n') || 'No known risks'}>
            {label} {score > 0 ? score.toFixed(1) : ''}
        </span>
    );
}

/** Security type badge */
export function SecurityBadge({ security }) {
    const s = (security || '').toUpperCase();
    if (!s || s === 'NONE') return <span className="badge badge-danger">OPEN</span>;
    if (s.includes('WEP')) return <span className="badge badge-warning">WEP</span>;
    if (s.includes('WPA3')) return <span className="badge badge-success">WPA3</span>;
    if (s.includes('WPA2')) return <span className="badge badge-info">WPA2</span>;
    if (s.includes('WPA')) return <span className="badge badge-info">WPA</span>;
    return <span className="badge badge-gray">{s}</span>;
}

/** Section card wrapper */
export function Section({ title, children, action }) {
    return (
        <div className="card p-4 mb-3">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="section-header" style={{ marginBottom: 0 }}>{title}</div>
                {action}
            </div>
            <div style={{ marginTop: 12 }}>{children}</div>
        </div>
    );
}

/** Empty state */
export function EmptyState({ message }) {
    return (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)', fontSize: 12 }}>
            {message}
        </div>
    );
}

/** Mini KV pair */
export function KV({ label, value, mono }) {
    return (
        <div className="detail-kv">
            <div className="k">{label}</div>
            <div className={`v${mono ? ' mono' : ''}`}>{value ?? '—'}</div>
        </div>
    );
}

/** Port badge with color coding */
export function PortBadge({ port, service }) {
    const p = Number(port);
    const cls = p === 22 ? 'port-ssh' : p === 80 || p === 443 ? 'port-http' : p === 23 ? 'port-telnet' : p === 21 ? 'port-ftp' : p === 1883 ? 'port-mqtt' : p === 5900 ? 'port-vnc' : p === 445 || p === 139 ? 'port-smb' : 'port-other';
    return <span className={`badge ${cls}`} style={{ marginRight: 3 }}>{port}{service ? `/${service}` : ''}</span>;
}

/** Auto-scroll log line */
export function LogTerminal({ lines = [] }) {
    const ref = useRef(null);
    useEffect(() => {
        if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    }, [lines]);
    return (
        <div ref={ref} style={{
            background: '#0D0D0D', borderRadius: 4,
            height: 280, overflowY: 'auto',
            padding: '10px 12px', fontFamily: 'var(--mono)',
            fontSize: 11, lineHeight: 1.7,
        }}>
            {lines.length === 0 && <div style={{ color: '#555' }}>Waiting for messages...</div>}
            {lines.map((l, i) => (
                <div key={i} style={{ color: l.level === 'error' ? '#EF4444' : l.level === 'warning' ? '#F59E0B' : l.source === 'arduino' ? '#A78BFA' : '#9CA3AF' }}>
                    <span style={{ color: '#555', marginRight: 8 }}>{new Date(l.ts || Date.now()).toISOString().slice(11, 19)}</span>
                    <span style={{ color: '#6B7280', marginRight: 8 }}>[{(l.source || 'sys').toUpperCase()}]</span>
                    {l.message}
                </div>
            ))}
        </div>
    );
}

/** Relative time string */
export function relTime(ts) {
    if (!ts) return '—';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
}
