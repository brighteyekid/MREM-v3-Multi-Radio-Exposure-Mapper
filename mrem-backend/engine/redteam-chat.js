// MREM v3 — Red Team AI Chatbot
// Gemini-powered security analyst that provides penetration testing insights

const { GoogleGenAI } = require('@google/genai');
const { callGeminiWithRetry } = require('./ai-retry-handler');

const apiKey = process.env.GEMINI_API_KEY || "AIzaSyDQ2LBOhNWtfcVnwDQZNpsz3q-Qc7LFwuw";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const conversationHistory = [];
const MAX_HISTORY = 20;
const registry = require('./device-registry');

const SYSTEM_PROMPT = `You are a Red Team security analyst and penetration testing expert working with the MREM (Multi-Radio Exposure Mapper) system. Your role is to:

1. Analyze wireless network security posture from WiFi, BLE, Nmap, and RF data
2. Identify attack vectors and vulnerabilities
3. Suggest exploitation techniques and security improvements
4. Explain risks in clear, actionable terms
5. Provide both offensive (red team) and defensive (blue team) perspectives

You have access to live network reconnaissance data including:
- WiFi networks (SSIDs, security types, signal strength, channels)
- Bluetooth devices (BLE advertisements, RSSI, device types)
- Network hosts (IPs, MACs, open ports, OS fingerprints, services)
- RF spectrum activity (2.4GHz channel congestion)
- Device correlations and patterns

Be direct, technical, and security-focused. Assume the user has authorization to test their own network. Provide specific, actionable advice.`;

/**
 * Send a message to the Red Team AI and get a response
 * @param {string} userMessage - The user's question
 * @param {object} networkState - Current network scan data { wifi, ble, nmap, arp, nrf, exposure, correlations }
 * @param {string} sessionId - Optional session ID for persistence
 * @returns {Promise<object>} { response, confidence, sessionId }
 */
async function chat(userMessage, networkState = {}, sessionId = null) {
    if (!ai) {
        return { response: "Red Team AI is unavailable. Set GEMINI_API_KEY environment variable.", confidence: 0 };
    }

    try {
        // Build context with trend data
        const context = buildNetworkContext(networkState);
        const trendContext = buildTrendContext(networkState);
        
        // Add user message to history
        conversationHistory.push({
            role: 'user',
            parts: [{ text: userMessage }]
        });

        // Keep history manageable
        if (conversationHistory.length > MAX_HISTORY) {
            conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY);
        }

        // Build the full prompt with context and trends
        const fullPrompt = `${context}\n\n${trendContext}\n\nUser Question: ${userMessage}`;

        const response = await callGeminiWithRetry(async () => {
            return await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: [
                    ...conversationHistory.slice(0, -1),
                    { role: 'user', parts: [{ text: fullPrompt }] }
                ],
                config: {
                    systemInstruction: SYSTEM_PROMPT,
                    temperature: 0.7,
                    maxOutputTokens: 2048,
                }
            });
        }, {
            maxRetries: 5,
            initialDelay: 3000
        });

        const aiResponse = response.text || "No response generated.";

        // Add AI response to history
        conversationHistory.push({
            role: 'model',
            parts: [{ text: aiResponse }]
        });

        // Persist to database
        const sid = sessionId || `redteam_${Date.now()}`;
        persistConversation(sid, userMessage, aiResponse, networkState);

        // Calculate confidence based on data availability
        const confidence = calculateConfidence(networkState);

        return { response: aiResponse, confidence, sessionId: sid };

    } catch (error) {
        console.error('[RedTeamChat] Error:', error.message);
        return { response: `Error: ${error.message}`, confidence: 0 };
    }
}

/**
 * Build a concise network context summary for the AI with better formatting
 */
function buildNetworkContext(state) {
    const { wifi = [], ble = [], nmap = [], arp = [], nrf = {}, exposure = {}, correlations = [] } = state;

    let context = "╔═══════════════════════════════════════════════════════════════╗\n";
    context += "║           CURRENT NETWORK RECONNAISSANCE STATE                ║\n";
    context += "╚═══════════════════════════════════════════════════════════════╝\n\n";

    // Exposure Index with visual indicator
    const score = exposure.score?.toFixed(1) || 'N/A';
    const zone = exposure.zone?.label || 'UNKNOWN';
    const trend = exposure.trend || '→';
    context += `┌─ EXPOSURE METRICS\n`;
    context += `│  Index: ${score}/10.0 [${zone}] ${trend}\n`;
    context += `│  Status: ${score < 5 ? 'Acceptable' : score < 7 ? 'Elevated' : 'Critical'}\n`;
    context += `└─\n\n`;

    // WiFi Networks with security classification
    const openWifi = wifi.filter(n => !n.security || n.security === 'none' || n.security.toLowerCase().includes('open'));
    const wepWifi = wifi.filter(n => n.security && n.security.toUpperCase().includes('WEP'));
    
    context += `┌─ WIFI NETWORKS (${wifi.length} total)\n`;
    if (openWifi.length > 0) {
        context += `│  [!] OPEN NETWORKS: ${openWifi.length}\n`;
        openWifi.slice(0, 3).forEach(n => {
            context += `│      • ${n.ssid} (${n.bssid}) Ch:${n.channel} RSSI:${n.signal_level || n.rssi}\n`;
        });
    }
    if (wepWifi.length > 0) {
        context += `│  [!!] WEP NETWORKS: ${wepWifi.length} - CRITICAL VULNERABILITY\n`;
    }
    wifi.slice(0, 10).forEach(n => {
        const sec = n.security || 'Open';
        const rssi = n.signal_level || n.rssi || 'N/A';
        const indicator = !n.security || n.security === 'none' ? '[!]' : n.security.includes('WEP') ? '[!!]' : '   ';
        context += `│  ${indicator} ${n.ssid} | ${sec} | Ch:${n.channel} | ${rssi}dBm | ${n.vendor || '?'}\n`;
    });
    if (wifi.length > 10) context += `│  ... and ${wifi.length - 10} more networks\n`;
    context += `└─\n\n`;

    // BLE Devices
    const connectableBle = ble.filter(d => d.connectable);
    context += `┌─ BLUETOOTH DEVICES (${ble.length} total)\n`;
    context += `│  Connectable: ${connectableBle.length}\n`;
    ble.slice(0, 10).forEach(d => {
        const name = d.localName || d.advertisement?.localName || '[Unnamed]';
        const conn = d.connectable ? '[C]' : '   ';
        context += `│  ${conn} ${name} | ${d.id} | ${d.rssi}dBm | ${d.vendor || '?'}\n`;
    });
    if (ble.length > 10) context += `│  ... and ${ble.length - 10} more devices\n`;
    context += `└─\n\n`;

    // Network Hosts with risk indicators
    const riskyHosts = nmap.filter(h => h.risk_score > 5);
    context += `┌─ NETWORK HOSTS (${nmap.length} total)\n`;
    if (riskyHosts.length > 0) {
        context += `│  [!] HIGH-RISK HOSTS: ${riskyHosts.length}\n`;
    }
    nmap.forEach(h => {
        const ports = h.ports?.map(p => p.port).join(',') || 'None';
        const risk = h.risk_score || 0;
        const indicator = risk > 7 ? '[!!]' : risk > 5 ? '[!]' : '   ';
        context += `│  ${indicator} ${h.ip} | ${h.hostname || 'unknown'} | Ports:${ports} | Risk:${risk}\n`;
    });
    context += `└─\n\n`;

    // RF Spectrum
    const topChannels = nrf.top_channels || [];
    context += `┌─ RF SPECTRUM (2.4GHz)\n`;
    context += `│  RF Index: ${nrf.rf_index?.toFixed(1) || 'N/A'}\n`;
    context += `│  Active Channels: ${topChannels.length}/128\n`;
    if (topChannels.length > 0) {
        context += `│  Hotspots: ${topChannels.slice(0, 5).map(c => `Ch${c.channel}(${c.hits})`).join(', ')}\n`;
    }
    context += `└─\n\n`;

    // Correlations
    if (correlations.length > 0) {
        context += `┌─ SECURITY CORRELATIONS (${correlations.length})\n`;
        correlations.slice(0, 5).forEach(c => {
            const sev = c.severity === 'Significant' ? '[!!]' : c.severity === 'Notable' ? '[!]' : '   ';
            context += `│  ${sev} ${c.ruleType}: ${c.description}\n`;
        });
        if (correlations.length > 5) context += `│  ... and ${correlations.length - 5} more findings\n`;
        context += `└─\n`;
    }

    return context;
}

/**
 * Clear conversation history
 */
function clearHistory() {
    conversationHistory.length = 0;
}

/**
 * Build trend context showing changes over time
 */
function buildTrendContext(state) {
    const { exposure = {} } = state;
    let context = "┌─ TREND ANALYSIS\n";
    
    if (exposure.trend) {
        const trend = exposure.trend === '↑' ? 'INCREASING' : exposure.trend === '↓' ? 'DECREASING' : 'STABLE';
        context += `│  Exposure Trend: ${trend}\n`;
    }
    
    if (exposure.history && exposure.history.length > 1) {
        const recent = exposure.history.slice(-5);
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const current = exposure.score || 0;
        const delta = current - avg;
        context += `│  Recent Average: ${avg.toFixed(1)}\n`;
        context += `│  Current Delta: ${delta > 0 ? '+' : ''}${delta.toFixed(1)}\n`;
    }
    
    context += `└─\n`;
    return context;
}

/**
 * Calculate confidence score based on data availability
 */
function calculateConfidence(state) {
    let score = 0;
    if ((state.wifi || []).length > 0) score += 25;
    if ((state.ble || []).length > 0) score += 25;
    if ((state.nmap || []).length > 0) score += 25;
    if ((state.correlations || []).length > 0) score += 25;
    return score;
}

/**
 * Persist conversation to database
 */
function persistConversation(sessionId, userMessage, aiResponse, networkState) {
    try {
        const db = registry.getDb();
        db.prepare(`
            CREATE TABLE IF NOT EXISTS redteam_conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                timestamp INTEGER,
                user_message TEXT,
                ai_response TEXT,
                exposure_score REAL,
                wifi_count INTEGER,
                ble_count INTEGER,
                host_count INTEGER
            )
        `).run();

        db.prepare(`
            INSERT INTO redteam_conversations 
            (session_id, timestamp, user_message, ai_response, exposure_score, wifi_count, ble_count, host_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            sessionId,
            Date.now(),
            userMessage,
            aiResponse,
            networkState.exposure?.score || 0,
            (networkState.wifi || []).length,
            (networkState.ble || []).length,
            (networkState.nmap || []).length
        );
    } catch (e) {
        console.error('[RedTeamChat] Failed to persist conversation:', e.message);
    }
}

/**
 * Get conversation history from database
 */
function getHistory(sessionId = null) {
    try {
        const db = registry.getDb();
        const sql = sessionId
            ? 'SELECT * FROM redteam_conversations WHERE session_id=? ORDER BY timestamp DESC LIMIT 50'
            : 'SELECT * FROM redteam_conversations ORDER BY timestamp DESC LIMIT 50';
        
        const rows = sessionId 
            ? db.prepare(sql).all(sessionId)
            : db.prepare(sql).all();
        
        return rows.map(row => ({
            timestamp: row.timestamp,
            user: row.user_message,
            ai: row.ai_response,
            context: {
                exposure: row.exposure_score,
                wifi: row.wifi_count,
                ble: row.ble_count,
                hosts: row.host_count
            }
        }));
    } catch (e) {
        return [];
    }
}

/**
 * Get all unique session IDs
 */
function getSessions() {
    try {
        const db = registry.getDb();
        const rows = db.prepare('SELECT DISTINCT session_id, MIN(timestamp) as started FROM redteam_conversations GROUP BY session_id ORDER BY started DESC').all();
        return rows;
    } catch (e) {
        return [];
    }
}

module.exports = { chat, clearHistory, getHistory, getSessions };
