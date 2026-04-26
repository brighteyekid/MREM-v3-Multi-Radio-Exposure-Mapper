import { useAppState } from '../context/WsContext';
import { relTime } from './ui';

export default function StatusBar({ connected }) {
    const { scanTimestamps, nrf } = useAppState();
    const ts = scanTimestamps || {};

    return (
        <footer style={{
            gridColumn: '1/-1',
            background: 'var(--surface)', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', height: 'var(--statusbar-h)',
            fontSize: 11, color: 'var(--text-3)', flexShrink: 0,
        }}>
            <span>
                Last scan:&nbsp;
                WiFi <strong>{relTime(ts.wifi)}</strong>
                &nbsp;·&nbsp;BLE <strong>{relTime(ts.ble)}</strong>
                &nbsp;·&nbsp;Nmap <strong>{relTime(ts.nmap)}</strong>
                &nbsp;·&nbsp;NRF: <strong>{ts.nrf ? 'live' : 'waiting'}</strong>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: connected ? 'var(--success)' : 'var(--danger)' }} />
                {connected ? 'WebSocket connected' : 'Reconnecting...'}
            </span>
        </footer>
    );
}
