const NAV = [
    { section: 'Monitor' },
    { id: 'overview', icon: '◈', label: 'Overview' },
    { id: 'wifi', icon: '▾', label: 'WiFi' },
    { id: 'ble', icon: '◉', label: 'BLE' },
    { id: 'nrf', icon: '⊞', label: 'RF / NRF' },
    { id: 'network', icon: '⊡', label: 'Network' },
    { section: 'Analysis' },
    { id: 'correlation', icon: '⊕', label: 'Correlation' },
    { id: 'rfcamera', icon: '◎', label: 'RF Camera' },
    { id: 'redteam', icon: '⎔', label: 'Red Team AI' }, // Hexagon/Node
    { id: 'devices', icon: '≡', label: 'Devices' },
    { section: 'Operations' },
    { id: 'history', icon: '◷', label: 'History' },
    { id: 'alerts', icon: '◬', label: 'Alerts' },
    { id: 'terminal', icon: '$', label: 'Terminal' },
    { id: 'settings', icon: '⚙', label: 'Settings' },
    { id: 'report', icon: '⊟', label: 'Report' },
];

export default function Sidebar({ active, onChange, alertCount = 0 }) {
    return (
        <nav style={{
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            overflowY: 'auto',
            display: 'flex', flexDirection: 'column',
            userSelect: 'none',
        }}>
            {NAV.map((item, i) => {
                if (item.section) {
                    return (
                        <div key={i} style={{
                            fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
                            letterSpacing: '.08em', color: 'var(--text-3)',
                            padding: '14px 16px 4px',
                        }}>{item.section}</div>
                    );
                }
                const isActive = active === item.id;
                return (
                    <div key={item.id} onClick={() => onChange(item.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 16px',
                        cursor: 'pointer',
                        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                        fontSize: 13,
                        color: isActive ? 'var(--text-1)' : 'var(--text-2)',
                        fontWeight: isActive ? 600 : 400,
                        background: isActive ? 'var(--bg)' : 'transparent',
                        transition: 'all .12s',
                    }}
                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--bg)'; } }}
                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.background = 'transparent'; } }}
                    >
                        <span style={{ width: 16, textAlign: 'center', fontSize: 13 }}>{item.icon}</span>
                        {item.label}
                        {item.id === 'alerts' && alertCount > 0 && (
                            <span style={{
                                marginLeft: 'auto', background: 'var(--danger)', color: '#fff',
                                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10,
                            }}>{alertCount}</span>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}

export const NAV_ITEMS = NAV.filter(n => n.id).map(n => n.id);
