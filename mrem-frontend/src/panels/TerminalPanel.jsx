import { useState, useRef } from 'react';
import { useAppState, useWs } from '../context/WsContext';
import { LogTerminal } from '../components/ui';

const CMD_GROUPS = [
    {
        label: 'Scanner Commands',
        cmds: [
            { label: 'WiFi Scan', cmd: 'scan_wifi' },
            { label: 'BLE Scan', cmd: 'scan_ble' },
            { label: 'Nmap Ping Sweep', cmd: 'run_nmap', args: { target: 'auto', mode: 'ping' } },
            { label: 'Nmap OS Detect', cmd: 'run_nmap', args: { target: 'auto', mode: 'os' } },
            { label: 'ARP Scan', cmd: 'run_arp' },
        ],
    },
    {
        label: 'Arduino Commands',
        cmds: [
            { label: 'Ping Arduino', cmd: 'arduino', args: { payload: { cmd: 'ping' } } },
            { label: 'Reset Arduino', cmd: 'arduino', args: { payload: { cmd: 'reset' } } },
            { label: 'Mode: Burst', cmd: 'arduino', args: { payload: { cmd: 'set_mode', mode: 'burst' } } },
            { label: 'Mode: Heatmap', cmd: 'arduino', args: { payload: { cmd: 'set_mode', mode: 'heatmap' } } },
        ],
    },
    {
        label: 'Session Commands',
        cmds: [
            { label: 'Save Session', cmd: 'save_session', args: { notes: '' } },
            { label: 'Start Probing', cmd: 'start_probing' },
            { label: 'Stop Probing', cmd: 'stop_probing' },
        ],
    },
];

export default function TerminalPanel() {
    const { send } = useWs();
    const [logs, setLogs] = useState([]);
    const [input, setInput] = useState('');
    const [history, setHistory] = useState([]);
    const [histIdx, setHistIdx] = useState(-1);
    const [paused, setPaused] = useState(false);

    function addLog(level, source, message) {
        setLogs(ls => [...ls, { level, source, message, ts: Date.now() }].slice(-500));
    }

    function runCmd(cmd, args = {}) {
        send(cmd, args.args ? { args: args.args } : {});
        addLog('info', 'terminal', `→ ${cmd} ${JSON.stringify(args)}`);
    }

    function handleInput(e) {
        if (e.key === 'Enter') {
            const val = input.trim();
            if (!val) return;
            try {
                const parsed = JSON.parse(val);
                send(parsed.cmd || 'command', parsed);
                addLog('info', 'terminal', `→ ${val}`);
            } catch {
                addLog('error', 'terminal', 'Invalid JSON command');
            }
            setHistory(h => [val, ...h].slice(0, 50));
            setHistIdx(-1);
            setInput('');
        }
        if (e.key === 'ArrowUp') {
            const idx = Math.min(histIdx + 1, history.length - 1);
            setHistIdx(idx);
            if (history[idx]) setInput(history[idx]);
        }
        if (e.key === 'ArrowDown') {
            const idx = Math.max(histIdx - 1, -1);
            setHistIdx(idx);
            setInput(idx >= 0 ? (history[idx] || '') : '');
        }
    }

    return (
        <div>
            <div className="card p-4 mb-3">
                <div className="section-header">Command Console</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>↑↓ recall history · Enter to send JSON command</span>
                    <button className="btn btn-sm" onClick={() => setPaused(p => !p)}>{paused ? '▶ Resume' : '⏸ Pause'} Scroll</button>
                </div>
                <LogTerminal lines={paused ? [] : logs} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input className="input input-mono" style={{ flex: 1, fontSize: 12 }}
                        placeholder='{"cmd":"scan_wifi"}'
                        value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleInput} />
                    <button className="btn btn-primary btn-sm" onClick={() => handleInput({ key: 'Enter' })}>Send</button>
                    <button className="btn btn-sm" onClick={() => setLogs([])}>Clear</button>
                </div>
            </div>

            {CMD_GROUPS.map(g => (
                <div key={g.label} className="card p-4 mb-3">
                    <div className="section-header">{g.label}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {g.cmds.map(c => (
                            <button key={c.label} className="btn btn-sm" onClick={() => runCmd(c.cmd, c)}>{c.label}</button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
