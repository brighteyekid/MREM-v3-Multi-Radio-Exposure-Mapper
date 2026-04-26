import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const WsContext = createContext(null);

/** Central app state updated by WebSocket messages */
const INITIAL_STATE = {
    wifi: [], ble: [], nmap: [], arp: [], dns: [],
    nrf: { top_channels: [], bins: new Array(128).fill(0), rf_index: 0, mode: 'fast' },
    exposure: { score: 0, zone: { label: 'MINIMAL', color: '#0A7346' }, trend: '→', factors: [], history: [] },
    correlations: [],
    sysinfo: {},
    netif: [],
    probes: [],
    alerts: [],
    activityFeed: [],
    systemStatus: { arduino: false, wifi: false, ble: false, nmap: false, arp: false, probeMode: false },
    sessions: [],
    replayMode: false,
    replaySession: null,
    scanTimestamps: {},
    rfCamera: { frame: null, calibrating: false, calibrated: false, countdown: 0, status: null },
};

export function WsProvider({ children }) {
    const [state, setState] = useState(INITIAL_STATE);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const reconnTimer = useRef(null);

    const pushActivity = useCallback((type, source, message, color) => {
        setState(s => ({
            ...s,
            activityFeed: [{ id: Date.now() + Math.random(), type, source, message, color, ts: Date.now() }, ...s.activityFeed].slice(0, 20),
        }));
    }, []);

    const connect = useCallback(() => {
        const ws = new WebSocket(`ws://${window.location.hostname}:3000`);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            pushActivity('connect', 'SYSTEM', 'WebSocket connected', '#0A7346');
        };

        ws.onclose = () => {
            setConnected(false);
            reconnTimer.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
            ws.close();
        };

        ws.onmessage = (evt) => {
            try {
                const msg = JSON.parse(evt.data);
                handleMessage(msg);
            } catch { }
        };
    }, []);

    function handleMessage(msg) {
        const { type, data } = msg;
        setState(s => {
            switch (type) {
                case 'wifi_update':
                    return { ...s, wifi: data, scanTimestamps: { ...s.scanTimestamps, wifi: Date.now() } };
                case 'ble_update':
                    return { ...s, ble: data, scanTimestamps: { ...s.scanTimestamps, ble: Date.now() } };
                case 'nmap_update':
                    return { ...s, nmap: data, scanTimestamps: { ...s.scanTimestamps, nmap: Date.now() } };
                case 'arp_update':
                    return { ...s, arp: data, scanTimestamps: { ...s.scanTimestamps, arp: Date.now() } };
                case 'dns_update':
                    return { ...s, dns: [...(s.dns || []).filter(d => d.ip !== data.ip), data] };
                case 'nrf_update':
                    return { ...s, nrf: { ...s.nrf, ...data }, scanTimestamps: { ...s.scanTimestamps, nrf: Date.now() } };
                case 'exposure_update':
                    return { ...s, exposure: data };
                case 'correlation_update':
                    return { ...s, correlations: data };
                case 'sysinfo_update':
                    return { ...s, sysinfo: data };
                case 'netif_update':
                    return { ...s, netif: data };
                case 'system_status':
                    return { ...s, systemStatus: { ...s.systemStatus, ...data } };
                case 'channel_analysis':
                    return { ...s, channelAnalysis: data };
                case 'alert':
                    return { ...s, alerts: [{ ...data, id: Date.now() + Math.random(), acknowledged: false }, ...s.alerts].slice(0, 200) };
                case 'device_new':
                    return { ...s, activityFeed: [{ id: Date.now() + Math.random(), type: 'new_device', source: data.protocol?.toUpperCase(), message: `New: ${data.display_name || data.identifier}`, color: '#1A56DB', ts: Date.now() }, ...s.activityFeed].slice(0, 20) };
                case 'device_return':
                    return { ...s, activityFeed: [{ id: Date.now() + Math.random(), type: 'device_return', source: data.protocol?.toUpperCase(), message: `Returned: ${data.display_name || data.identifier} (absent ${Math.round(data.absent_for_ms / 1000)}s)`, color: '#B45309', ts: Date.now() }, ...s.activityFeed].slice(0, 20) };
                case 'session_complete':
                    return { ...s, activityFeed: [{ id: Date.now() + Math.random(), type: 'session', source: 'SESSION', message: data.summary, color: '#6B21A8', ts: Date.now() }, ...s.activityFeed].slice(0, 20) };
                case 'replay_data':
                    return { ...s, replayMode: true, replaySession: data, ...data.snapshot };
                case 'presence_update':
                    return { ...s, rfCamera: { ...s.rfCamera, frame: data } };
                case 'rfcam_calibrating':
                    return { ...s, rfCamera: { ...s.rfCamera, calibrating: true, countdown: data.seconds_remaining } };
                case 'rfcam_calibrated':
                    return { ...s, rfCamera: { ...s.rfCamera, calibrating: false, calibrated: true, countdown: 0 } };
                case 'rfcam_status':
                    return { ...s, rfCamera: { ...s.rfCamera, status: data } };
                case 'log':
                    if (msg.level === 'info') pushActivity('log', msg.source?.toUpperCase(), msg.message, '#A8A8A3');
                    return s;
                default:
                    return s;
            }
        });
    }

    useEffect(() => {
        connect();
        return () => {
            if (wsRef.current) wsRef.current.close();
            if (reconnTimer.current) clearTimeout(reconnTimer.current);
        };
    }, [connect]);

    const send = useCallback((cmd, args = {}) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'command', cmd, ...args }));
        }
    }, []);

    const exitReplay = useCallback(() => {
        setState(s => ({ ...s, replayMode: false, replaySession: null }));
    }, []);

    const ackAlert = useCallback((id) => {
        setState(s => ({ ...s, alerts: s.alerts.map(a => a.id === id ? { ...a, acknowledged: true } : a) }));
        send('ack_alert', { args: { alert_id: id } });
    }, [send]);

    return (
        <WsContext.Provider value={{ state, connected, send, exitReplay, ackAlert }}>
            {children}
        </WsContext.Provider>
    );
}

export const useWs = () => useContext(WsContext);
export const useAppState = () => useContext(WsContext).state;
