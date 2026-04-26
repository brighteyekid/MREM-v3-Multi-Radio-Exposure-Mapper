import { useAppState, useWs } from '../context/WsContext';
import { Section, EmptyState } from '../components/ui';

const MODES = ['burst', 'fast', 'normal', 'deep', 'heatmap'];

export default function NrfPanel() {
    const { nrf, channelAnalysis, systemStatus } = useAppState();
    const { send } = useWs();
    const bins = nrf.bins || new Array(128).fill(0);
    const maxHit = Math.max(1, ...bins);
    const topChannels = nrf.top_channels || [];
    const analysis = channelAnalysis || {};

    // WiFi channel NRF band ranges for overlay
    const wifiBands = { 1: [0, 13], 6: [25, 38], 11: [50, 63] };
    // BLE adv channels: NRF 1, 25, 79
    const bleBands = new Set([1, 25, 79]);

    function sendArduino(payload) {
        send('arduino', { args: { payload } });
    }

    function cellColor(hits) {
        if (!hits) return 'var(--border-2)';
        const ratio = hits / maxHit;
        if (ratio < 0.2) return '#EFF6FF';
        if (ratio < 0.4) return '#BFDBFE';
        if (ratio < 0.6) return '#60A5FA';
        if (ratio < 0.8) return '#3B82F6';
        return '#6B21A8';
    }

    function isBand(ch, [start, end]) { return ch >= start && ch <= end; }

    return (
        <div>
            {/* Arduino Status */}
            <div className="card p-4 mb-3">
                <div className="section-header">Arduino / NRF24L01</div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: systemStatus.arduino ? 'var(--success)' : 'var(--danger)' }} />
                        <span style={{ fontSize: 12 }}>{systemStatus.arduino ? `Connected (${systemStatus.arduinoPort || 'serial'})` : 'Not connected'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Mode: <strong style={{ fontFamily: 'var(--mono)' }}>{nrf.mode || 'fast'}</strong></div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>RF Index: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--purple)' }}>{(nrf.rf_index || 0).toFixed(2)}</strong></div>
                </div>

                {/* Mode selector */}
                <div style={{ marginBottom: 12 }}>
                    <div className="label mb-2">Sweep Mode</div>
                    <div className="btn-group">
                        {MODES.map(m => (
                            <button key={m} className={`btn btn-sm ${nrf.mode === m ? 'active' : ''}`}
                                onClick={() => sendArduino({ cmd: 'set_mode', mode: m })}>
                                {m}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Arduino command buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-sm" onClick={() => sendArduino({ cmd: 'ping' })}>Ping</button>
                    <button className="btn btn-sm" onClick={() => sendArduino({ cmd: 'reset' })}>Reset</button>
                </div>
            </div>

            {/* 128-Channel Grid */}
            <div className="card p-4 mb-3">
                <div className="section-header">128-Channel RF Grid (2.401–2.528 GHz)</div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 11 }}>
                    {Object.entries(wifiBands).map(([ch]) => (
                        <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 12, height: 12, border: '1.5px solid rgba(26,86,219,.6)', borderRadius: 1 }} />
                            <span style={{ color: 'var(--text-2)' }}>WiFi Ch {ch}</span>
                        </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 12, height: 12, border: '1.5px solid rgba(107,33,168,.8)', borderRadius: 1 }} />
                        <span style={{ color: 'var(--text-2)' }}>BLE Adv</span>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16,1fr)', gap: 2 }}>
                    {bins.map((hits, ch) => {
                        const inWifi = Object.values(wifiBands).some(r => isBand(ch, r));
                        const inBle = bleBands.has(ch);
                        return (
                            <div key={ch} title={`Ch ${ch} | ${2401 + ch} MHz | hits: ${hits}`} style={{
                                aspectRatio: '1', borderRadius: 1,
                                background: cellColor(hits),
                                outline: inBle ? '1.5px solid rgba(107,33,168,.8)' : inWifi ? '1.5px solid rgba(26,86,219,.5)' : 'none',
                                cursor: 'default', transition: 'background .3s',
                            }} />
                        );
                    })}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center' }}>
                    {['none', 'low', 'med', 'high', 'peak'].map((l, i) => (
                        <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-3)' }}>
                            <div style={{ width: 10, height: 10, background: ['var(--border-2)', '#EFF6FF', '#BFDBFE', '#60A5FA', '#6B21A8'][i], borderRadius: 1 }} />
                            {l}
                        </div>
                    ))}
                </div>
            </div>

            {/* Top Channels */}
            {topChannels.length > 0 && (
                <div className="card p-4 mb-3">
                    <div className="section-header">Top Active Channels</div>
                    {topChannels.slice(0, 5).map((c, i) => {
                        const pct = maxHit > 0 ? (c.hits / maxHit) * 100 : 0;
                        return (
                            <div key={i} style={{ marginBottom: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--purple)' }}>Ch {c.channel} ({2401 + c.channel} MHz)</span>
                                    <span style={{ fontFamily: 'var(--mono)' }}>{c.hits} hits</span>
                                </div>
                                <div style={{ height: 6, background: 'var(--border-2)', borderRadius: 3 }}>
                                    <div style={{ height: '100%', background: 'var(--purple)', borderRadius: 3, width: `${pct}%`, transition: 'width .4s' }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Channel Analysis Text */}
            {analysis.textFindings?.length > 0 && (
                <div className="card p-4 mb-3">
                    <div className="section-header">Interference Analysis</div>
                    {analysis.textFindings.map((f, i) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--text-2)', padding: '6px 0', borderBottom: '1px solid var(--border-2)' }}>{f}</div>
                    ))}
                </div>
            )}

            {/* OLED Preview */}
            <div className="card p-4">
                <div className="section-header">OLED Preview</div>
                <div style={{
                    background: '#000', color: '#fff', fontFamily: 'var(--mono)',
                    fontSize: 12, padding: '8px 10px', borderRadius: 2,
                    width: 256, border: '2px solid #333', lineHeight: 1.8,
                    minHeight: 48,
                }}>
                    {nrf.oled_line1 || 'MREM v3'}<br />
                    {nrf.oled_line2 || `RF:${(nrf.rf_index || 0).toFixed(2)} Ch:${topChannels[0]?.channel ?? '--'}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>128×32 OLED preview — synced with Arduino screen</div>
            </div>
        </div>
    );
}
