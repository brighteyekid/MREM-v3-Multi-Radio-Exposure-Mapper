import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Box, Cylinder, Html, Environment, ContactShadows, Sphere } from '@react-three/drei';
import * as THREE from 'three';

// ── Physical Constants & Mapping ─────────────────────────────────────────────

const CANVAS_MAPPINGS = {
    // We map the 520px 2D canvas coordinates into a ~100x100 3D floor map
    scale: 0.15,
    offset: 260
};

function to3D(cx, cy) {
    if (cx == null || cy == null) return [0, 0, 0];
    return [
        (cx - CANVAS_MAPPINGS.offset) * CANVAS_MAPPINGS.scale,
        0,
        (cy - CANVAS_MAPPINGS.offset) * CANVAS_MAPPINGS.scale
    ];
}

// ── 3D Actors ────────────────────────────────────────────────────────────────

function ApNode({ ap, motionEvent }) {
    const [x, y, z] = to3D(ap.canvas_x, ap.canvas_y);
    const isMotion = motionEvent?.isMotion;
    const sigma = motionEvent?.sigma || 0;

    // Height based on variance (sigma)
    const baseH = 1;
    const peakH = baseH + Math.min(15, sigma * 2);

    const isStrong = ap.rssi && ap.rssi > -60;

    return (
        <group position={[x, peakH / 2, z]}>
            {/* Clean Architectural AP Pillar */}
            <Cylinder args={[0.8, 0.8, peakH, 16]}>
                <meshStandardMaterial
                    color={isMotion ? "#1A56DB" : "#A8A8A3"}
                    transparent
                    opacity={isMotion ? 0.9 : 0.4}
                />
            </Cylinder>

            {/* Always readable label */}
            <Html position={[0, peakH / 2 + 0.5, 0]} center style={{ pointerEvents: 'none' }}>
                <div style={{
                    color: isMotion ? '#1A56DB' : '#6B6B66',
                    fontSize: '10px',
                    fontFamily: 'var(--mono), monospace',
                    fontWeight: isMotion ? 'bold' : 'normal',
                    whiteSpace: 'nowrap',
                    background: 'rgba(255,255,255,0.85)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: `1px solid ${isMotion ? '#1A56DB' : '#E8E6E1'}`,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                    {ap.ssid || ap.bssid?.slice(-8) || 'Unknown AP'}
                </div>
            </Html>
        </group>
    );
}

function BleDevice({ dev, index }) {
    // Generate stable pseudo-XY based on index
    const angle = (index / 40) * Math.PI * 2;
    const maxZ = CANVAS_MAPPINGS.scale * 260;
    const r = Math.min(maxZ, dev.distance_m * 1.5);

    const [x, z] = [Math.cos(angle) * r, Math.sin(angle) * r];
    const initialY = 1 + (index % 3);

    return (
        <group position={[x, initialY, z]}>
            <Sphere args={[0.4, 16, 16]}>
                <meshStandardMaterial color="#0A7346" />
            </Sphere>
            {/* Label only for top closest to avoid clutter */}
            {index < 12 && (
                <Html position={[0, 0.8, 0]} center style={{ pointerEvents: 'none' }}>
                    <div style={{
                        color: '#0A7346',
                        fontSize: '9px',
                        fontFamily: 'var(--mono), monospace',
                        background: 'rgba(255,255,255,0.9)',
                        padding: '1px 4px',
                        border: '1px solid #0A7346',
                        borderRadius: '3px',
                        whiteSpace: 'nowrap'
                    }}>
                        {dev.name || dev.address?.slice(-5)}
                    </div>
                </Html>
            )}
        </group>
    );
}

// ── The Scene ────────────────────────────────────────────────────────────────

export default function CctvView3D({ frame }) {
    if (!frame) {
        return (
            <div style={{ width: 520, height: 520, background: '#F4F3F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#6B6B66', fontFamily: 'var(--mono), monospace' }}>AWAITING 3D DATA...</span>
            </div>
        );
    }

    const { floorPlan, motionEvents = [], bleDevices = [], presenceZones = [] } = frame;
    const aps = floorPlan ? Object.entries(floorPlan.aps || {}) : [];

    // Limit massive node counts for 3D performance and readability
    const sortedAps = aps.sort((a, b) => (b[1].rssi || -100) - (a[1].rssi || -100)).slice(0, 40);
    const sortedBle = [...bleDevices].sort((a, b) => a.distance_m - b.distance_m).slice(0, 40);

    return (
        <div style={{ width: 520, height: 520, background: '#F4F3F0', position: 'relative' }}>

            {/* Overlay UI */}
            <div style={{ position: 'absolute', top: 12, left: 16, zIndex: 10, pointerEvents: 'none', color: '#6B6B66', fontFamily: 'var(--mono), monospace' }}>
                <div style={{ fontWeight: 600 }}>INTERACTIVE 3D PLAN</div>
                <div style={{ fontSize: 10, marginTop: 4 }}>Drag to rotate • Scroll to zoom</div>
            </div>

            <Canvas camera={{ position: [0, 40, 50], fov: 40 }} gl={{ antialias: true }}>
                <color attach="background" args={['#F4F3F0']} />
                <ambientLight intensity={0.7} />
                <directionalLight position={[10, 30, 20]} intensity={1} castShadow />

                <OrbitControls
                    makeDefault
                    minPolarAngle={0}
                    maxPolarAngle={Math.PI / 2 - 0.1}
                    minDistance={10}
                    maxDistance={100}
                />

                {/* ── Floor / Space ── */}
                <Grid
                    position={[0, -0.01, 0]}
                    args={[100, 100]}
                    cellSize={2}
                    cellThickness={1}
                    cellColor="#E8E6E1"
                    sectionSize={10}
                    sectionThickness={1.5}
                    sectionColor="#D1D0CB"
                    fadeDistance={80}
                />

                {/* ── Core Gateway (You) ── */}
                <group position={[0, 1, 0]}>
                    <Box args={[3, 1, 3]}>
                        <meshStandardMaterial color="#FFFFFF" />
                    </Box>
                    <Html position={[0, 1.5, 0]} center>
                        <div style={{ color: '#1A1A18', fontSize: '10px', fontFamily: 'var(--mono), monospace', background: '#fff', padding: '2px 6px', border: '1px solid #1A1A18' }}>YOU (GATEWAY)</div>
                    </Html>
                </group>

                {/* ── WiFi APs ── */}
                {sortedAps.map(([bssid, ap]) => {
                    const motionE = motionEvents.find(e => e.bssid === bssid);
                    return <ApNode key={bssid} ap={ap} motionEvent={motionE} />;
                })}

                {/* ── BLE Devices ── */}
                {sortedBle.map((dev, i) => (
                    <BleDevice key={dev.address || i} index={i} dev={dev} />
                ))}

                {/* ── Movement Confidence Zones ── */}
                {presenceZones.map((z, i) => {
                    if (!z.confidence) return null;
                    const [zx, , zz] = to3D(z.x, z.y);
                    const R = (z.radius || 60) * CANVAS_MAPPINGS.scale;
                    return (
                        <mesh key={i} position={[zx, 0.01, zz]} rotation={[-Math.PI / 2, 0, 0]}>
                            <circleGeometry args={[R, 64]} />
                            <meshBasicMaterial color="#1A56DB" transparent opacity={0.1} depthWrite={false} />
                        </mesh>
                    );
                })}
            </Canvas>
        </div>
    );
}
