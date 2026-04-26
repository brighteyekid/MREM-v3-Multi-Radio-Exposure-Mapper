import { useEffect, useRef, useState } from 'react';
import { useAppState, useWs } from '../context/WsContext';
import CctvView3D from '../components/CctvView3D';

const CANVAS_SIZE = 520;
const TWO_PI = Math.PI * 2;

export default function RfCameraPanel() {
    const { send } = useWs();
    const { rfCamera = {} } = useAppState();
    const canvasRef = useRef(null);
    const frameRef = useRef(null);
    const rafRef = useRef(null);
    const animTick = useRef(0);
    const [active, setActive] = useState(false);
    const [calibrating, setCalib] = useState(false);
    const [calibCountdown, setCount] = useState(0);
    const [sensitivity, setSens] = useState(3.0);
    const [pathLossN, setPathN] = useState(2.7);
    const [debugOpen, setDebug] = useState(false);
    const [layoutMode, setLayout] = useState('auto');
    const [view3d, setView3d] = useState(false);

    // Sync from WS state
    useEffect(() => {
        if (rfCamera.frame) frameRef.current = rfCamera.frame;
        if (rfCamera.calibrating) { setCalib(true); setCount(rfCamera.countdown ?? 30); }
        if (rfCamera.calibrated) { setCalib(false); setCount(0); }
        if (rfCamera.status) { setActive(rfCamera.status.active ?? false); }
    }, [rfCamera]);

    // Canvas render loop — 30fps
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        function draw() {
            rafRef.current = requestAnimationFrame(draw);
            animTick.current += 0.05;
            const frame = frameRef.current;
            drawFrame(ctx, frame, animTick.current, calibrating, calibCountdown, view3d);
        }
        rafRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(rafRef.current);
    }, [calibrating, calibCountdown, view3d]);

    // ── Canvas Pseudo-3D Math ───────────────────────────────────────────────────

    function toIso(x, y, cx, cy, is3d) {
        if (!is3d) return { ix: x, iy: y };
        const dx = x - cx, dy = y - cy;
        const rx = dx * 0.7071 - dy * 0.7071; // cos(45), sin(45)
        const ry = dx * 0.7071 + dy * 0.7071;
        return { ix: cx + rx, iy: cy + ry * 0.5 + 40 }; // +40 pulls the center down slightly
    }

    // ── Canvas drawing ──────────────────────────────────────────────────────────

    function drawFrame(ctx, frame, tick, isCalib, countdown, is3d) {
        const W = CANVAS_SIZE, H = CANVAS_SIZE;
        const cx = W / 2, cy = H / 2;
        ctx.clearRect(0, 0, W, H);

        ctx.save();
        if (is3d) {
            ctx.translate(cx, cy + 40);
            ctx.scale(1, 0.5);
            ctx.rotate(Math.PI / 4);
            ctx.translate(-cx, -cy);
        }

        // Layer 0 — Floor Grid
        ctx.fillStyle = '#F4F3F0';
        ctx.fillRect(-W, -H, W * 3, H * 3); // Overscan to cover rotation
        ctx.strokeStyle = '#E8E6E1'; ctx.lineWidth = 0.5;
        for (let x = -W; x <= W * 2; x += 40) { ctx.beginPath(); ctx.moveTo(x, -H); ctx.lineTo(x, H * 2); ctx.stroke(); }
        for (let y = -H; y <= H * 2; y += 40) { ctx.beginPath(); ctx.moveTo(-W, y); ctx.lineTo(W * 2, y); ctx.stroke(); }

        if (!frame) {
            ctx.restore();
            drawHud(ctx, null, tick);
            if (isCalib) drawCalibOverlay(ctx, countdown, W, H);
            return;
        }

        // Layer 2 — WiFi motion flat ground glow
        for (const e of frame.motionEvents || []) {
            if (!e.isMotion || e.canvas_x == null) continue;
            const ratio = Math.min(1, e.sigma / Math.max(0.01, e.threshold));
            const mx = (cx + e.canvas_x) / 2, my = (cy + e.canvas_y) / 2;
            const dist = Math.hypot(cx - e.canvas_x, cy - e.canvas_y);
            const grad = ctx.createRadialGradient(mx, my, 0, mx, my, dist / 2);
            grad.addColorStop(0, `rgba(26,86,219,${0.05 + ratio * 0.12})`);
            grad.addColorStop(1, 'rgba(26,86,219,0)');
            ctx.beginPath();
            ctx.ellipse(mx, my, dist / 2.5, dist / 4, Math.atan2(cy - e.canvas_y, cx - e.canvas_x), 0, TWO_PI);
            ctx.fillStyle = grad;
            ctx.fill();
        }

        // Layer 3 — Presence zones (Ground)
        for (const z of frame.presenceZones || []) {
            if (!z.confidence) continue;
            const pulseDelta = Math.sin(tick) * 8;
            const r = (z.radius || 60) + pulseDelta;
            ctx.beginPath(); ctx.arc(z.x, z.y, r, 0, TWO_PI);
            ctx.fillStyle = `rgba(26,86,219,${z.confidenceFill || 0.12})`; ctx.fill();
            ctx.strokeStyle = '#1A56DB'; ctx.lineWidth = 1.5; ctx.stroke();
        }

        ctx.restore(); // Stop flat transformation for vertical 3D elements!

        const fp = frame.floorPlan || {};
        const aps = Object.entries(fp.aps || {});

        // Layer 1 — AP anchors & 3D Pillars
        const apArray = aps.map(([bssid, ap]) => ({ bssid, ap })).sort((a, b) => (b.ap.rssi || -100) - (a.ap.rssi || -100));
        apArray.forEach(({ bssid, ap }, idx) => {
            if (ap.canvas_x == null) return;
            const motion = frame.motionEvents?.find(e => e.bssid === bssid && e.isMotion);
            const sigma = frame.motionEvents?.find(e => e.bssid === bssid)?.sigma || 0;
            const hideLabel = !motion && idx > 15 && !is3d;
            drawAp(ctx, ap, motion, hideLabel, is3d, sigma, cx, cy);
        });

        // Layer 4 — BLE device 3D dots
        const allBleDevs = (frame.bleDevices || []).sort((a, b) => a.distance_m - b.distance_m);
        const bleRadius = CANVAS_SIZE / 2 - 50;

        allBleDevs.slice(0, 40).forEach((dev, i) => {
            const distPx = Math.min(bleRadius, (dev.distance_m / 15) * bleRadius);
            const angle = (i / Math.max(allBleDevs.length > 40 ? 40 : allBleDevs.length, 1)) * TWO_PI - Math.PI / 2;
            const rawX = cx + distPx * Math.cos(angle);
            const rawY = cy + distPx * Math.sin(angle);
            const { ix, iy } = toIso(rawX, rawY, cx, cy, is3d);

            // 3D elevation (float up and down slightly)
            const altitude = is3d ? 20 + Math.sin(tick + i) * 6 : 0;
            const floatY = iy - altitude;

            // Optional drop shadow / anchor line
            if (is3d) {
                ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ix, floatY);
                ctx.strokeStyle = 'rgba(10,115,70,0.3)'; ctx.lineWidth = 1; ctx.stroke();
            }

            ctx.beginPath(); ctx.arc(ix, floatY, 4, 0, TWO_PI);
            ctx.fillStyle = '#0A7346'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();

            if (i < 12) {
                if (!is3d) {
                    ctx.beginPath(); ctx.arc(cx, cy, distPx, 0, TWO_PI);
                    ctx.strokeStyle = 'rgba(10,115,70,0.06)'; ctx.lineWidth = 0.5; ctx.stroke();
                }
                ctx.fillStyle = '#0A7346'; ctx.font = '9px JetBrains Mono, monospace';
                ctx.textAlign = rawX > cx ? 'left' : 'right';
                ctx.fillText(dev.name || dev.address?.slice(-5) || '?', ix + (rawX > cx ? 6 : -6), floatY + 3);
            }

            if (i < 20 && !is3d) {
                if (dev.trend === 'approaching') drawArrow(ctx, ix, iy, cx, cy, 14, '#0A7346');
                else if (dev.trend === 'receding') drawArrow(ctx, ix, iy, cx + (rawX - cx) * 0.7, cy + (rawY - cy) * 0.7, 14, '#C01B1B');
            }
        });

        // Layer 5 & 6 — Anchor & NRF (untransformed HUD layer)
        drawLaptop(ctx, cx, cy, is3d);

        const nrfAlpha = frame.nrfSpike ? 0.4 + Math.sin(tick * 2) * 0.2 : 0.06 + Math.sin(tick * 0.5) * 0.02;
        ctx.beginPath(); ctx.ellipse(cx, cy + (is3d ? 20 : 0), 28, is3d ? 14 : 28, 0, 0, TWO_PI);
        ctx.strokeStyle = `rgba(107,33,168,${nrfAlpha})`; ctx.lineWidth = 3; ctx.stroke();

        drawHud(ctx, frame, tick);
        if (isCalib) drawCalibOverlay(ctx, countdown, W, H);
    }

    function drawAp(ctx, ap, motion, hideLabel, is3d, sigma, cx, cy) {
        const { canvas_x: x, canvas_y: y, ssid } = ap;
        const { ix, iy } = toIso(x, y, cx, cy, is3d);
        const color = motion ? '#1A56DB' : '#A8A8A3';

        // 3D Pillar Extrusion
        const pillarH = is3d ? Math.min(60, sigma * 8) : 0;

        if (is3d && pillarH > 2) {
            ctx.fillStyle = motion ? 'rgba(26,86,219,0.15)' : 'rgba(168,168,163,0.1)';
            ctx.strokeStyle = motion ? 'rgba(26,86,219,0.3)' : 'rgba(168,168,163,0.2)';
            ctx.lineWidth = 1;
            // Floor base
            ctx.beginPath(); ctx.ellipse(ix, iy, 6, 3, 0, 0, TWO_PI); ctx.stroke();
            // Cylinder body
            ctx.beginPath(); ctx.moveTo(ix - 6, iy); ctx.lineTo(ix - 6, iy - pillarH);
            ctx.lineTo(ix + 6, iy - pillarH); ctx.lineTo(ix + 6, iy);
            ctx.fill(); ctx.stroke();
            // Cap
            ctx.beginPath(); ctx.ellipse(ix, iy - pillarH, 6, 3, 0, 0, TWO_PI); ctx.fillStyle = color; ctx.fill();
        }

        // Draw normal top icon at the tip of the pillar
        const ty = iy - pillarH;
        ctx.strokeStyle = color; ctx.lineWidth = 1;
        [6, 10, 14].forEach(r => {
            ctx.beginPath();
            ctx.arc(ix, ty - 4, r, Math.PI * 1.2, Math.PI * 1.8);
            ctx.stroke();
        });
        ctx.beginPath(); ctx.arc(ix, ty + 2, 2, 0, TWO_PI);
        ctx.fillStyle = color; ctx.fill();

        if (!hideLabel) {
            ctx.fillStyle = '#6B6B66'; ctx.font = '8px JetBrains Mono, monospace'; ctx.textAlign = 'center';
            ctx.fillText((ssid || '').slice(0, 12), ix, ty + (is3d ? -15 : 16));
        }
    }

    function drawLaptop(ctx, cx, cy, is3d) {
        const py = cy + (is3d ? 20 : 0);
        ctx.strokeStyle = '#E8E6E1'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - (is3d ? 100 : 200), py); ctx.lineTo(cx + (is3d ? 100 : 200), py); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, py - (is3d ? 50 : 200)); ctx.lineTo(cx, py + (is3d ? 50 : 200)); ctx.stroke();

        ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#6B6B66'; ctx.lineWidth = 1.5;
        ctx.fillRect(cx - 14, py - 10, 28, 18); ctx.strokeRect(cx - 14, py - 10, 28, 18);
        ctx.fillRect(cx - 18, py + 8, 36, 4); ctx.strokeRect(cx - 18, py + 8, 36, 4);
        ctx.fillStyle = '#1A1A18'; ctx.fillRect(cx - 11, py - 7, 22, 13);
        ctx.fillStyle = '#6B6B66'; ctx.font = '8px JetBrains Mono, monospace'; ctx.textAlign = 'center';
        ctx.fillText('YOU', cx, py + 24);
    }

    function drawArrow(ctx, x1, y1, x2, y2, len, color) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + len * Math.cos(angle), y1 + len * Math.sin(angle));
        ctx.stroke();
    }

    function drawHud(ctx, frame, tick) {
        const activity = frame?.activityLevel ?? 0;
        const pollHz = frame?.pollHz ?? 0;
        const apCount = frame?.apCount ?? 0;
        const bleCount = frame?.bleCount ?? 0;
        const calibOk = frame?.calibrated ?? false;

        // Activity number (top-left)
        ctx.fillStyle = 'rgba(250,250,248,0.9)';
        ctx.fillRect(8, 8, 80, 52);
        ctx.fillStyle = '#A8A8A3'; ctx.font = '8px JetBrains Mono, monospace'; ctx.textAlign = 'left';
        ctx.fillText('ACTIVITY', 14, 22);
        const actColor = activity > 60 ? '#C01B1B' : activity > 30 ? '#B45309' : '#1A1A18';
        ctx.fillStyle = actColor;
        ctx.font = 'bold 28px JetBrains Mono, monospace';
        ctx.fillText(String(activity).padStart(3, ' '), 12, 50);

        // Stats bar (bottom-left)
        ctx.fillStyle = 'rgba(250,250,248,0.85)';
        ctx.fillRect(8, CANVAS_SIZE - 24, 220, 20);
        ctx.fillStyle = '#6B6B66'; ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillText(`POLL ${pollHz}Hz · APs ${apCount} · BLE ${bleCount} · NRF ${frame?.nrfSpike ? '🔴' : 'live'}`, 14, CANVAS_SIZE - 10);

        // Calibration status (bottom-right)
        ctx.textAlign = 'right';
        const calLabel = calibOk ? 'CALIBRATED ✓' : '⚠ NOT CALIBRATED';
        const calColor = calibOk ? '#0A7346' : '#B45309';
        ctx.fillStyle = 'rgba(250,250,248,0.85)';
        ctx.fillRect(CANVAS_SIZE - 165, CANVAS_SIZE - 24, 158, 20);
        ctx.fillStyle = calColor; ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillText(calLabel, CANVAS_SIZE - 8, CANVAS_SIZE - 10);
    }

    function drawCalibOverlay(ctx, countdown, W, H) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('STAY STILL — CALIBRATING', W / 2, H / 2 - 28);
        ctx.font = 'bold 48px JetBrains Mono, monospace';
        ctx.fillText(`${countdown}s`, W / 2, H / 2 + 20);
        // Progress bar
        const elapsed = (30 - countdown) / 30;
        ctx.fillStyle = '#555';
        ctx.fillRect(60, H / 2 + 36, W - 120, 6);
        ctx.fillStyle = '#1A56DB';
        ctx.fillRect(60, H / 2 + 36, (W - 120) * elapsed, 6);
    }

    // ── Actions ─────────────────────────────────────────────────────────────────

    const handleStart = () => { send('start_rfcam'); setActive(true); };
    const handleStop = () => { send('stop_rfcam'); setActive(false); };
    const handleCalibrate = () => { send('start_rfcam_calibration'); setCalib(true); setCount(30); };
    const handleSens = (v) => { setSens(v); send('set_rfcam_sensitivity', { args: { multiplier: v } }); };
    const handlePathLoss = (v) => { setPathN(v); send('set_rfcam_pathLossN', { args: { n: v } }); };

    const frame = frameRef.current;
    const motionEvents = frame?.motionEvents || [];
    const bleDevices = frame?.bleDevices || [];
    const status = rfCamera.status || {};

    return (
        <div style={{ display: 'flex', gap: 16 }}>

            {/* Canvas Zone (70%) */}
            <div style={{ flex: '0 0 auto' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    RF CAMERA — PASSIVE PRESENCE MAP
                    <span style={{ color: 'var(--text-3)', fontSize: 10 }}>· uses WiFi RSSI + BLE proximity + NRF activity</span>
                    {/* Info icon */}
                    <span title="Zone accuracy: 1–2m. BLE angle is estimated (ring). Calibration required before use. Detects RF presence, not identity." style={{ cursor: 'help', color: 'var(--accent)' }}>ⓘ</span>
                </div>
                {view3d ? (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                        <CctvView3D frame={frame || rfCamera.frame} />
                    </div>
                ) : (
                    <canvas
                        ref={canvasRef}
                        width={CANVAS_SIZE}
                        height={CANVAS_SIZE}
                        style={{
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            background: '#F4F3F0',
                            display: 'block',
                        }}
                    />
                )}
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                    {active ? '● LIVE — 2Hz sensor fusion' : '○ Stopped — click Start RF Camera'}
                </div>
            </div>

            {/* Control Rail (30%) */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Mode */}
                <div className="card p-3">
                    <div className="section-header">Mode</div>
                    <div className="btn-group" style={{ marginBottom: 10 }}>
                        <button className={`btn btn-sm ${layoutMode === 'auto' ? 'active' : ''}`} onClick={() => setLayout('auto')}>AUTO</button>
                        <button className={`btn btn-sm ${layoutMode === 'manual' ? 'active' : ''}`} onClick={() => setLayout('manual')}>MANUAL</button>
                        <button className={`btn btn-sm ${view3d ? 'active' : ''}`} onClick={() => setView3d(v => !v)}>3D VIEW</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className={`btn btn-sm ${active ? 'btn-danger' : 'btn-primary'}`}
                            onClick={active ? handleStop : handleStart}>
                            {active ? '■ Stop RF Camera' : '▶ Start RF Camera'}
                        </button>
                    </div>
                </div>

                {/* Calibration */}
                <div className="card p-3">
                    <div className="section-header">Calibration</div>
                    {calibrating ? (
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 6 }}>Stay still — calibrating ({calibCountdown}s remaining)</div>
                            <div style={{ height: 4, background: 'var(--border-2)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', background: 'var(--accent)', width: `${((30 - calibCountdown) / 30) * 100}%`, transition: 'width 1s linear' }} />
                            </div>
                        </div>
                    ) : (
                        <div>
                            {frame?.calibrated && (
                                <div style={{ fontSize: 11, color: 'var(--success)', marginBottom: 6 }}>
                                    ✓ Calibrated at {frame?.calibratedAt ? new Date(frame.calibratedAt).toLocaleString() : '—'}
                                </div>
                            )}
                            {!frame?.calibrated && <div style={{ fontSize: 11, color: 'var(--warning)', marginBottom: 6 }}>⚠ Not calibrated — run before demo</div>}
                            <button className="btn btn-sm btn-primary" onClick={handleCalibrate}>
                                {frame?.calibrated ? 'Re-Calibrate (30s)' : 'CALIBRATE NOW (30s)'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Sensitivity */}
                <div className="card p-3">
                    <div className="section-header">Sensitivity</div>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span>Motion Sensitivity (σ ×)</span>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{sensitivity.toFixed(1)}</span>
                        </div>
                        <input type="range" min={1} max={5} step={0.1} value={sensitivity}
                            onChange={e => handleSens(+e.target.value)}
                            style={{ width: '100%', accentColor: 'var(--accent)' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-3)' }}>
                            <span>sensitive</span><span>strict</span>
                        </div>
                    </div>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span>BLE Path Loss n</span>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{pathLossN.toFixed(1)}</span>
                        </div>
                        <input type="range" min={2} max={4} step={0.1} value={pathLossN}
                            onChange={e => handlePathLoss(+e.target.value)}
                            style={{ width: '100%', accentColor: 'var(--accent)' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-3)' }}>
                            <span>open space (2.0)</span><span>cluttered (4.0)</span>
                        </div>
                    </div>
                </div>

                {/* Active APs */}
                <div className="card p-3">
                    <div className="section-header">Active AP Sensors ({motionEvents.length})</div>
                    {motionEvents.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>No APs visible — run WiFi scan first</div>
                    ) : motionEvents.map(e => (
                        <div key={e.bssid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border-2)', fontSize: 11 }}>
                            <span style={{ fontWeight: e.isMotion ? 600 : 400, color: e.isMotion ? 'var(--accent)' : 'var(--text-2)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {e.ssid || e.bssid?.slice(-5)}
                            </span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>σ {e.sigma}</span>
                            <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 2,
                                background: e.isMotion ? 'var(--accent-dim)' : 'var(--border-2)',
                                color: e.isMotion ? 'var(--accent)' : 'var(--text-3)',
                                fontFamily: 'var(--mono)',
                            }}>
                                {e.isMotion ? 'MOTION' : 'STABLE'}
                            </span>
                        </div>
                    ))}
                </div>

                {/* BLE Devices */}
                <div className="card p-3">
                    <div className="section-header">BLE Proximity ({bleDevices.length})</div>
                    {bleDevices.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>No BLE devices in range</div>
                    ) : bleDevices.map(d => (
                        <div key={d.address} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border-2)', fontSize: 11 }}>
                            <span style={{ color: 'var(--success)', fontWeight: 500, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {d.name || d.address?.slice(-8)}
                            </span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-2)' }}>
                                {d.distance_m < 15 ? `~${d.distance_m.toFixed(1)}m` : 'OUT OF RANGE'}
                            </span>
                            <span>{d.trend === 'approaching' ? '↑' : d.trend === 'receding' ? '↓' : '→'}</span>
                        </div>
                    ))}
                </div>

                {/* Recording */}
                <div className="card p-3">
                    <div className="section-header">Recording</div>
                    <button className="btn btn-sm" onClick={() => send('save_session', { args: { notes: 'rfcam_session' } })}>
                        💾 Save Presence Session
                    </button>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>Saved sessions can be replayed in the History panel</div>
                </div>

                {/* Debug */}
                <div className="card p-3">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setDebug(d => !d)}>
                        <div className="section-header" style={{ marginBottom: 0 }}>Debug</div>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{debugOpen ? '▲ hide' : '▼ show'}</span>
                    </div>
                    {debugOpen && (
                        <div style={{ marginTop: 10 }}>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 6 }}>
                                Activity: {frame?.activityLevel ?? '—'} · NRF base:{frame?.nrfBaseline ?? '—'} now:{frame?.nrfCurrent ?? '—'}
                            </div>
                            <div style={{
                                background: '#0D0D0D', borderRadius: 2, padding: 8,
                                fontFamily: 'var(--mono)', fontSize: 10, color: '#9CA3AF',
                                maxHeight: 200, overflowY: 'auto', lineHeight: 1.6,
                            }}>
                                {motionEvents.map(e => (
                                    <div key={e.bssid} style={{ color: e.isMotion ? '#60A5FA' : '#555' }}>
                                        {e.ssid || e.bssid?.slice(-8)} | σ={e.sigma} base={e.baseline} thr={e.threshold} {e.isMotion ? '← MOTION' : ''}
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: 6 }}>
                                <pre style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-3)', overflow: 'auto', maxHeight: 100 }}>
                                    {frame ? JSON.stringify({ presenceZones: frame.presenceZones, bleDevices: frame.bleDevices }, null, 2) : 'No frame yet'}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
