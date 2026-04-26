import { useEffect, useState } from 'react';
import { useWs } from '../context/WsContext';

export default function TopBar({ onLogoClick }) {
    const { state, connected } = useWs();
    const { systemStatus, sysinfo } = state;
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const dotClass = (active) => `dot ${active ? 'online' : 'offline'}`;

    return (
        <header style={{
            gridColumn: '1/-1',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px',
            background: 'var(--surface)', borderBottom: '1px solid var(--border)',
            height: 'var(--topbar-h)', position: 'relative', zIndex: 100, flexShrink: 0,
        }}>
            {/* Logo */}
            <div onClick={onLogoClick} style={{
                fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15,
                cursor: 'pointer', userSelect: 'none', letterSpacing: '.08em',
                display: 'flex', alignItems: 'baseline', gap: 8,
            }}>
                MREM
                <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-3)', letterSpacing: '.04em' }}>v3.0</span>
            </div>

            {/* Status dots */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {[
                    { key: 'arduino', label: 'ARDUINO', active: systemStatus.arduino },
                    { key: 'wifi', label: 'WIFI', active: true },
                    { key: 'ble', label: 'BLE', active: true },
                    { key: 'nmap', label: 'NMAP', active: true },
                    { key: 'arp', label: 'ARP', active: true },
                ].map(({ key, label, active }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: active ? 'var(--success)' : 'var(--text-3)',
                            transition: 'background .3s',
                        }} />
                        <span style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
                    </div>
                ))}
                <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
                {/* WS indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? 'var(--accent)' : 'var(--danger)' }} />
                    <span style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 500 }}>WS</span>
                </div>
            </div>

            {/* System health + clock */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--text-2)' }}>
                {sysinfo.cpuPercent != null && (
                    <span>CPU&nbsp;<strong>{sysinfo.cpuPercent}%</strong></span>
                )}
                {sysinfo.memUsedPct != null && (
                    <span>RAM&nbsp;<strong>{sysinfo.memUsedPct}%</strong></span>
                )}
                {sysinfo.tempC != null && (
                    <span>TEMP&nbsp;<strong>{sysinfo.tempC}°C</strong></span>
                )}
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)', minWidth: 72, textAlign: 'right' }}>
                    {now.toTimeString().slice(0, 8)}
                </span>
            </div>
        </header>
    );
}
