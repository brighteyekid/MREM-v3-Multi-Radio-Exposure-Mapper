import { useState, useEffect, useCallback } from 'react';
import { useWs, useAppState } from './context/WsContext';
import { showToast } from './components/ToastContainer';

import TopBar from './components/TopBar';
import Sidebar, { NAV_ITEMS } from './components/Sidebar';
import StatusBar from './components/StatusBar';
import Bootsplash from './components/Bootsplash';
import ToastContainer from './components/ToastContainer';

import OverviewPanel from './panels/OverviewPanel';
import WifiPanel from './panels/WifiPanel';
import BlePanel from './panels/BlePanel';
import NrfPanel from './panels/NrfPanel';
import NetworkPanel from './panels/NetworkPanel';
import CorrelationPanel from './panels/CorrelationPanel';
import RfCameraPanel from './panels/RfCameraPanel';
import RedTeamPanel from './panels/RedTeamPanel';
import DevicesPanel from './panels/DevicesPanel';
import HistoryPanel from './panels/HistoryPanel';
import AlertsPanel from './panels/AlertsPanel';
import TerminalPanel from './panels/TerminalPanel';
import SettingsPanel from './panels/SettingsPanel';
import ReportPanel from './panels/ReportPanel';

const PANEL_MAP = {
  overview: OverviewPanel,
  wifi: WifiPanel,
  ble: BlePanel,
  nrf: NrfPanel,
  network: NetworkPanel,
  correlation: CorrelationPanel,
  rfcamera: RfCameraPanel,
  redteam: RedTeamPanel,
  devices: DevicesPanel,
  history: HistoryPanel,
  alerts: AlertsPanel,
  terminal: TerminalPanel,
  settings: SettingsPanel,
  report: ReportPanel,
};

export default function App() {
  const { state, connected, send, exitReplay } = useWs();
  const [booted, setBooted] = useState(false);
  const [showBoot, setShowBoot] = useState(true);
  const [panel, setPanel] = useState('overview');
  const [showKb, setShowKb] = useState(false);

  const alertCount = (state.alerts || []).filter(a => !a.acknowledged).length;

  // Toast new alerts
  useEffect(() => {
    const unacked = (state.alerts || []).filter(a => !a.acknowledged);
    if (unacked.length > 0) {
      const last = unacked[0];
      showToast(last.source || 'SYSTEM', last.description, last.severity);
    }
  }, [state.alerts?.length]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const panels = Object.keys(PANEL_MAP);
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (panels[idx]) setPanel(panels[idx]);
      }
      if (e.key === '0') setPanel(panels[9] || panels[0]);
      switch (e.key) {
        case 's': case 'S': send('scan_wifi'); send('scan_ble'); send('run_nmap'); send('run_arp'); break;
        case 'w': case 'W': send('scan_wifi'); break;
        case 'b': case 'B': send('scan_ble'); break;
        case 'n': case 'N': send('run_nmap', { args: { target: 'auto', mode: 'ping' } }); break;
        case 'r': case 'R': send('arduino', { args: { payload: { cmd: 'ping' } } }); break;
        case 'e': case 'E': setPanel('report'); break;
        case 't': case 'T': setPanel('terminal'); break;
        case 'h': case 'H': setPanel('history'); break;
        case '?': setShowKb(true); break;
        case 'Escape': setShowKb(false); exitReplay(); break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send, exitReplay]);

  const handleBootDone = useCallback(() => {
    setBooted(true);
    setTimeout(() => setShowBoot(false), 500);
  }, []);

  const retriggerBoot = useCallback(() => {
    setShowBoot(true);
    setBooted(false);
  }, []);

  const ActivePanel = PANEL_MAP[panel] || OverviewPanel;

  return (
    <>
      {/* Bootsplash */}
      {showBoot && <Bootsplash onDone={handleBootDone} />}

      {/* Replay Banner */}
      {state.replayMode && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9000,
          background: 'var(--warning)', color: '#fff',
          padding: '8px 20px', fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>▶ REPLAY MODE — Viewing session from {state.replaySession?.started_at ? new Date(state.replaySession.started_at).toLocaleString() : '—'}</span>
          <button className="btn btn-sm" onClick={exitReplay} style={{ background: '#fff', color: 'var(--warning)' }}>Exit (Esc)</button>
        </div>
      )}

      {/* Main Layout */}
      <div style={{
        display: 'grid',
        gridTemplateRows: 'var(--topbar-h) 1fr var(--statusbar-h)',
        gridTemplateColumns: 'var(--sidebar-w) 1fr',
        height: '100vh',
        overflow: 'hidden',
        visibility: booted ? 'visible' : 'hidden',
        marginTop: state.replayMode ? '36px' : 0,
      }}>
        <TopBar onLogoClick={retriggerBoot} />
        <Sidebar active={panel} onChange={setPanel} alertCount={alertCount} />

        <main style={{ overflow: 'auto', padding: 20, background: 'var(--bg)' }}>
          <ActivePanel />
        </main>

        <StatusBar connected={connected} />
      </div>

      {/* Keyboard Help */}
      {showKb && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9500,
        }} onClick={() => setShowKb(false)}>
          <div className="card p-4" style={{ minWidth: 340 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Keyboard Shortcuts</div>
            {[
              ['1–0', 'Jump to panels 1–10'],
              ['S', 'Full scan (all protocols)'],
              ['W', 'WiFi scan'],
              ['B', 'BLE scan'],
              ['N', 'Nmap ping sweep'],
              ['R', 'Ping Arduino'],
              ['E', 'Open Report panel'],
              ['T', 'Open Terminal'],
              ['H', 'Open History'],
              ['?', 'Show this help'],
              ['Esc', 'Close overlays / exit replay'],
            ].map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', gap: 16, alignItems: 'baseline', marginBottom: 8, fontSize: 12 }}>
                <span style={{
                  fontFamily: 'var(--mono)', background: 'var(--bg)',
                  border: '1px solid var(--border)', padding: '1px 6px',
                  borderRadius: 2, fontSize: 11, minWidth: 28, textAlign: 'center',
                }}>{key}</span>
                <span style={{ color: 'var(--text-2)' }}>{desc}</span>
              </div>
            ))}
            <button className="btn btn-sm mt-3" onClick={() => setShowKb(false)}>Close</button>
          </div>
        </div>
      )}

      <ToastContainer />
    </>
  );
}
