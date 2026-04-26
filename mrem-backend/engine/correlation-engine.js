// MREM v3 — Correlation Engine v3 (Gemini Powered)
// Uses Google GenAI to analyze the entire RF state and find complex relationships

const { GoogleGenAI, Type } = require('@google/genai');
const { callGeminiWithRetry, getCircuitBreakerStatus } = require('./ai-retry-handler');
let broadcast = null;

// Initialize Gemini (will silently disable if no API key is provided)
const apiKey = "AIzaSyDQ2LBOhNWtfcVnwDQZNpsz3q-Qc7LFwuw";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// State management
const findingMap = new Map();
const MAX_FINDINGS = 200;
let isAnalyzing = false;
let lastAnalysisMs = 0;
const COOLDOWN_MS = 25000; // Only call Gemini once every 25 seconds

function setBroadcast(fn) { broadcast = fn; }

function getFindings() {
    return [...findingMap.values()]
        .sort((a, b) => b.ts - a.ts)
        .slice(0, MAX_FINDINGS);
}

function clearFindings() {
    findingMap.clear();
    if (broadcast) broadcast({ type: 'correlation_update', data: [] });
}

function stableKey(ruleType, description) {
    return `${ruleType}::${description}`.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Inserts AI findings into the map and broadcasts */
function ingestAiFindings(aiCorrelations) {
    let isNew = false;
    for (const c of aiCorrelations) {
        if (!c.ruleType || !c.description) continue;
        const key = stableKey(c.ruleType, c.description);

        // De-duplicate
        if (!findingMap.has(key)) {
            findingMap.set(key, {
                id: key + Date.now(),
                ruleType: c.ruleType.toUpperCase().replace(/\s+/g, '_'),
                severity: c.severity || 'Notable',
                description: c.description,
                devices: c.devices || [],
                ts: Date.now(),
            });
            isNew = true;
        }
    }

    // Prune
    if (findingMap.size > MAX_FINDINGS) {
        const sorted = [...findingMap.entries()].sort((a, b) => b[1].ts - a[1].ts);
        findingMap.clear();
        sorted.slice(0, MAX_FINDINGS).forEach(([k, v]) => findingMap.set(k, v));
    }

    if (isNew && broadcast) {
        broadcast({ type: 'correlation_update', data: getFindings() });
    }
}

// ─── Gemini LLM Analysis ──────────────────────────────────────────────────────

async function analyze(state = {}) {
    // If no API key, or currently analyzing, or too soon, skip
    if (!ai || isAnalyzing || (Date.now() - lastAnalysisMs) < COOLDOWN_MS) {
        return getFindings();
    }

    // Check circuit breaker status
    const cbStatus = getCircuitBreakerStatus();
    if (cbStatus.state === 'OPEN') {
        console.warn('[Correlation] Circuit breaker OPEN - skipping analysis');
        return getFindings();
    }

    // Pre-process and shrink the state so we don't blow up the context window
    const wifiSummary = (state.wifi || []).slice(0, 30).map(n =>
        `${n.ssid} (${n.bssid}) - Ch:${n.channel} RSSI:${n.rssi || n.signal_level} Sec:${n.security || 'Open'} Vendor:${n.vendor || '?'}`
    );
    const bleSummary = (state.ble || []).slice(0, 30).map(d =>
        `${d.localName || d.advertisement?.localName || 'Unknown'} (${d.id}) - RSSI:${d.rssi} Vendor:${d.vendor || '?'}`
    );
    const nmapSummary = (state.nmap || []).map(h =>
        `${h.ip} (${h.mac || '?'}) - Host:${h.hostname || '?'} OS:${h.os_match || '?'} Vendor:${h.vendor || '?'} Ports:[${h.ports?.map(p => p.port).join(',')}]`
    );
    const arpSummary = (state.arp || []).slice(0, 20).map(a =>
        `${a.ip} (${a.mac}) - Vendor:${a.vendor || '?'}`
    );
    const nrfChannels = (state.nrf?.top_channels || []).slice(0, 5).map(c => c.channel || c).join(', ');

    const promptText = `
Analyze the following live RF and network data snapshot to identify cross-protocol correlations.
Look for:
1. Shared names/SSIDs between BLE devices and WiFi APs (e.g. Pixel phone BLE and Pixel hotspot).
2. Clustered devices from the same vendor across protocols (e.g., 3 Apple devices close by).
3. Physical presence confirmations (e.g., strong BLE signal appearing alongside a new ARP device).
4. Anomalous IoT devices operating on the subnets.
5. Nmap vulnerabilities mapped to physical MAC addresses.

WiFi APs:
${wifiSummary.length ? wifiSummary.join('\n') : '0 visible'}

BLE Devices:
${bleSummary.length ? bleSummary.join('\n') : '0 visible'}

Nmap Hosts:
${nmapSummary.length ? nmapSummary.join('\n') : '0 scanned'}

ARP Cache:
${arpSummary.length ? arpSummary.join('\n') : '0 cached'}

NRF Active Channels (Physical RF Energy): ${nrfChannels || 'None'}
`;

    try {
        isAnalyzing = true;
        console.log('[Correlation] Requesting Gemini cross-protocol analysis...');

        // Use retry handler
        const response = await callGeminiWithRetry(async () => {
            return await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: [{ role: 'user', parts: [{ text: promptText }] }],
                config: {
                    systemInstruction: "You are a cyber-physical intelligence engine. Analyze the RF/Network state carefully. Identify hidden connections between disparate devices (e.g., an Apple WiFi AP and an Apple BLE device likely belong to the same person; identical SSIDs; strange vendors). Output ONLY a structured JSON object with a 'correlations' array. If you find no definitive connections, return { \"correlations\": [] }. Avoid obvious generic facts.",
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            correlations: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        ruleType: { type: Type.STRING, description: "E.g., VENDOR_CLUSTER, NAME_MATCH, ANOMALY" },
                                        severity: { type: Type.STRING, description: "Must be 'Info', 'Notable', or 'Significant'" },
                                        description: { type: Type.STRING, description: "Detailed explanation of the correlation found" },
                                        devices: {
                                            type: Type.ARRAY,
                                            items: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    protocol: { type: Type.STRING, description: "wifi, ble, nmap, arp, nrf" },
                                                    id: { type: Type.STRING, description: "MAC, IP, BSSID, or Channel" }
                                                }
                                            }
                                        }
                                    },
                                    required: ["ruleType", "severity", "description", "devices"]
                                }
                            }
                        },
                        required: ["correlations"]
                    }
                }
            });
        }, {
            maxRetries: 5,
            initialDelay: 3000,
            maxDelay: 60000
        });

        if (response.text) {
            const parsed = JSON.parse(response.text);
            if (parsed && Array.isArray(parsed.correlations)) {
                console.log(`[Correlation] Gemini returned ${parsed.correlations.length} insights.`);
                ingestAiFindings(parsed.correlations);
            }
        }
    } catch (e) {
        console.error('[Correlation] Gemini API Error:', e.message);
        // Don't throw - just log and continue with existing findings
    } finally {
        isAnalyzing = false;
        lastAnalysisMs = Date.now();
    }

    return getFindings();
}

module.exports = { analyze, getFindings, setBroadcast, clearFindings };
