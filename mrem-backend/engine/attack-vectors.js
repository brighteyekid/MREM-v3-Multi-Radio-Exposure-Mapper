// MREM v3 — Attack Vector Analysis Engine
// Generates specific attack scenarios based on network reconnaissance data

const { GoogleGenAI, Type } = require('@google/genai');
const { callGeminiWithRetry } = require('./ai-retry-handler');

const apiKey = process.env.GEMINI_API_KEY || "AIzaSyDQ2LBOhNWtfcVnwDQZNpsz3q-Qc7LFwuw";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

let isAnalyzing = false;

const ATTACK_SYSTEM_PROMPT = `You are an offensive security expert specializing in wireless network penetration testing. Your role is to:

1. Identify specific attack vectors based on reconnaissance data
2. Provide step-by-step exploitation techniques
3. List required tools and commands
4. Estimate difficulty and detection risk
5. Suggest countermeasures for defenders

Output structured attack scenarios with:
- Attack name and category
- Target devices/networks
- Prerequisites and tools needed
- Step-by-step execution
- Success indicators
- Detection likelihood
- Defensive countermeasures

Be technical, precise, and assume authorized testing. Focus on practical, executable attacks.`;

/**
 * Analyze network state and generate attack vectors
 * @param {object} networkState - Current scan data
 * @returns {Promise<Array>} Array of attack vector objects with confidence scores
 */
async function generateAttackVectors(networkState = {}) {
    if (!ai || isAnalyzing) {
        return [];
    }

    const { wifi = [], ble = [], nmap = [], arp = [], nrf = {}, exposure = {} } = networkState;

    // Build attack surface summary
    const context = buildAttackContext(networkState);

    const promptText = `
Analyze this network reconnaissance data and generate 5-8 specific, executable attack vectors.

${context}

For each attack vector, provide:
1. Attack name and type
2. Specific target (device/network identifier)
3. Difficulty level (Easy/Medium/Hard)
4. Detection risk (Low/Medium/High)
5. Required tools
6. Step-by-step execution
7. Success indicators
8. Defensive countermeasures

Focus on the most impactful attacks based on the actual vulnerabilities present.
`;

    try {
        isAnalyzing = true;
        console.log('[AttackVectors] Generating attack scenarios...');

        const response = await callGeminiWithRetry(async () => {
            return await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: [{ role: 'user', parts: [{ text: promptText }] }],
                config: {
                    systemInstruction: ATTACK_SYSTEM_PROMPT,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            attackVectors: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING, description: "Attack name" },
                                        category: { type: Type.STRING, description: "WiFi, BLE, Network, RF, or Multi-Protocol" },
                                        target: { type: Type.STRING, description: "Specific target identifier" },
                                        difficulty: { type: Type.STRING, description: "Easy, Medium, or Hard" },
                                        detectionRisk: { type: Type.STRING, description: "Low, Medium, or High" },
                                        impact: { type: Type.STRING, description: "Low, Medium, High, or Critical" },
                                        tools: {
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING }
                                        },
                                        steps: {
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING }
                                        },
                                        successIndicators: {
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING }
                                        },
                                        countermeasures: {
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING }
                                        },
                                        prerequisites: { type: Type.STRING },
                                        estimatedTime: { type: Type.STRING }
                                    },
                                    required: ["name", "category", "target", "difficulty", "detectionRisk", "impact", "tools", "steps"]
                                }
                            }
                        },
                        required: ["attackVectors"]
                    }
                }
            });
        }, {
            maxRetries: 5,
            initialDelay: 3000
        });

        if (response.text) {
            const parsed = JSON.parse(response.text);
            if (parsed && Array.isArray(parsed.attackVectors)) {
                console.log(`[AttackVectors] Generated ${parsed.attackVectors.length} attack scenarios`);
                return parsed.attackVectors;
            }
        }
    } catch (e) {
        console.error('[AttackVectors] Error:', e.message);
    } finally {
        isAnalyzing = false;
    }

    return [];
}

/**
 * Build attack surface context from network state
 */
function buildAttackContext(state) {
    const { wifi = [], ble = [], nmap = [], arp = [], nrf = {}, exposure = {} } = state;

    let context = "=== ATTACK SURFACE ANALYSIS ===\n\n";

    // Exposure metrics
    context += `Overall Exposure: ${exposure.score?.toFixed(1) || 'N/A'} (${exposure.zone?.label || 'UNKNOWN'})\n`;
    context += `Trend: ${exposure.trend || '→'}\n\n`;

    // WiFi vulnerabilities
    const openWifi = wifi.filter(n => !n.security || n.security === 'none' || n.security.toLowerCase().includes('open'));
    const wepWifi = wifi.filter(n => n.security && n.security.toUpperCase().includes('WEP'));
    const wpa2Wifi = wifi.filter(n => n.security && n.security.includes('WPA2') && !n.security.includes('WPA3'));
    
    context += `WiFi Attack Surface:\n`;
    context += `  Total Networks: ${wifi.length}\n`;
    if (openWifi.length > 0) {
        context += `  Open Networks (${openWifi.length}):\n`;
        openWifi.slice(0, 5).forEach(n => {
            context += `    - ${n.ssid} (${n.bssid}) Ch:${n.channel} RSSI:${n.signal_level || n.rssi}\n`;
        });
    }
    if (wepWifi.length > 0) {
        context += `  WEP Networks (${wepWifi.length}) - CRITICAL:\n`;
        wepWifi.forEach(n => {
            context += `    - ${n.ssid} (${n.bssid}) Ch:${n.channel}\n`;
        });
    }
    if (wpa2Wifi.length > 0) {
        context += `  WPA2 Networks (${wpa2Wifi.length}) - Handshake capture possible\n`;
    }
    context += '\n';

    // BLE attack surface
    const connectableBle = ble.filter(d => d.connectable);
    context += `BLE Attack Surface:\n`;
    context += `  Total Devices: ${ble.length}\n`;
    context += `  Connectable: ${connectableBle.length}\n`;
    if (connectableBle.length > 0) {
        context += `  High-value targets:\n`;
        connectableBle.slice(0, 5).forEach(d => {
            const name = d.localName || d.advertisement?.localName || '[Unnamed]';
            context += `    - ${name} (${d.id}) RSSI:${d.rssi}\n`;
        });
    }
    context += '\n';

    // Network hosts
    const riskyHosts = nmap.filter(h => h.risk_score > 5);
    context += `Network Host Vulnerabilities:\n`;
    context += `  Total Hosts: ${nmap.length}\n`;
    context += `  High-risk Hosts: ${riskyHosts.length}\n`;
    if (riskyHosts.length > 0) {
        riskyHosts.forEach(h => {
            const ports = h.ports?.map(p => `${p.port}/${p.protocol}`).join(', ') || 'Unknown';
            context += `    - ${h.ip} (${h.mac || 'N/A'}) Risk:${h.risk_score} Ports:${ports}\n`;
        });
    }
    context += '\n';

    // RF spectrum
    context += `RF Spectrum:\n`;
    context += `  RF Index: ${nrf.rf_index?.toFixed(1) || 'N/A'}\n`;
    context += `  Active Channels: ${(nrf.top_channels || []).length}\n`;
    context += `  Congestion: ${nrf.rf_index > 6 ? 'High (jamming possible)' : 'Normal'}\n`;

    return context;
}

module.exports = { generateAttackVectors };
