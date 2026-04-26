import { useState, useRef, useEffect } from 'react';
import { useAppState, useWs } from '../context/WsContext';
import { EmptyState } from '../components/ui';

export default function RedTeamPanel() {
    const { connected } = useWs();
    const state = useAppState();
    const [mode, setMode] = useState('chat');
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [attackVectors, setAttackVectors] = useState([]);
    const [selectedVector, setSelectedVector] = useState(null);
    const [sessionId, setSessionId] = useState(`redteam_${Date.now()}`);
    const [confidence, setConfidence] = useState(100);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        setLoading(true);

        setMessages(prev => [...prev, { role: 'user', content: userMessage, ts: Date.now() }]);

        try {
            const response = await fetch('http://localhost:3000/api/redteam/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    sessionId,
                    networkState: {
                        wifi: state.wifi,
                        ble: state.ble,
                        nmap: state.nmap,
                        arp: state.arp,
                        nrf: state.nrf,
                        exposure: state.exposure,
                        correlations: state.correlations,
                    }
                })
            });

            const data = await response.json();
            
            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: data.response || 'No response received.', 
                confidence: data.confidence || 0,
                ts: Date.now() 
            }]);
            
            setConfidence(data.confidence || 0);

        } catch (error) {
            setMessages(prev => [...prev, { 
                role: 'error', 
                content: `Error: ${error.message}`, 
                ts: Date.now() 
            }]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    };

    const generateAttackVectors = async () => {
        setLoading(true);
        try {
            const response = await fetch('http://localhost:3000/api/redteam/attack-vectors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    networkState: {
                        wifi: state.wifi,
                        ble: state.ble,
                        nmap: state.nmap,
                        arp: state.arp,
                        nrf: state.nrf,
                        exposure: state.exposure,
                    }
                })
            });

            const data = await response.json();
            setAttackVectors(data.attackVectors || []);
        } catch (error) {
            console.error('Attack vector generation failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const clearChat = () => {
        setMessages([]);
        setSessionId(`redteam_${Date.now()}`);
        fetch('http://localhost:3000/api/redteam/clear', { method: 'POST' }).catch(() => {});
    };

    const quickPrompts = [
        "Analyze the current network security posture",
        "What are the biggest vulnerabilities you see?",
        "Suggest attack vectors for the open networks",
        "How would you exploit the BLE devices?",
        "What defensive measures should be implemented?",
        "Identify the most critical security risks",
    ];

    const getDifficultyColor = (diff) => {
        if (diff === 'Easy') return 'var(--success)';
        if (diff === 'Medium') return 'var(--warning)';
        return 'var(--danger)';
    };

    const getImpactColor = (impact) => {
        if (impact === 'Low') return 'var(--text-3)';
        if (impact === 'Medium') return 'var(--warning)';
        if (impact === 'High') return 'var(--danger)';
        return '#7F1D1D';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
            {/* Header */}
            <div className="card p-3 mb-3">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div className="section-header" style={{ marginBottom: 4 }}>Red Team AI Analyst</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            AI-powered security analysis and penetration testing insights
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {/* Mode Toggle */}
                        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                            <button
                                onClick={() => setMode('chat')}
                                style={{
                                    padding: '6px 16px',
                                    border: 'none',
                                    background: mode === 'chat' ? 'var(--accent)' : 'transparent',
                                    color: mode === 'chat' ? '#fff' : 'var(--text-2)',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                CHAT MODE
                            </button>
                            <button
                                onClick={() => { setMode('attack'); if (attackVectors.length === 0) generateAttackVectors(); }}
                                style={{
                                    padding: '6px 16px',
                                    border: 'none',
                                    background: mode === 'attack' ? 'var(--danger)' : 'transparent',
                                    color: mode === 'attack' ? '#fff' : 'var(--text-2)',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                ATTACK MODE
                            </button>
                        </div>
                        <div style={{
                            padding: '4px 10px',
                            background: connected ? 'var(--success)' : 'var(--danger)',
                            color: '#fff',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 600,
                        }}>
                            {connected ? 'ONLINE' : 'OFFLINE'}
                        </div>
                        {mode === 'chat' && messages.length > 0 && (
                            <>
                                <div style={{
                                    padding: '4px 10px',
                                    background: confidence > 75 ? 'var(--success)' : confidence > 50 ? 'var(--warning)' : 'var(--danger)',
                                    color: '#fff',
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 600,
                                }}>
                                    {confidence}% DATA
                                </div>
                                <button className="btn btn-sm" onClick={clearChat}>Clear</button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Chat Mode */}
            {mode === 'chat' && (
                <>
                    {messages.length === 0 && (
                        <div className="card p-3 mb-3">
                            <div className="label mb-2">Quick Prompts</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                                {quickPrompts.map((prompt, i) => (
                                    <button
                                        key={i}
                                        className="btn btn-sm"
                                        style={{ textAlign: 'left', fontSize: 11, padding: '8px 12px' }}
                                        onClick={() => setInput(prompt)}
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                            {messages.length === 0 ? (
                                <EmptyState message="Start a conversation with the Red Team AI. Ask about vulnerabilities, attack vectors, or security recommendations." />
                            ) : (
                                messages.map((msg, i) => (
                                    <div key={i} style={{
                                        marginBottom: 16,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    }}>
                                        <div style={{
                                            maxWidth: '80%',
                                            padding: 12,
                                            borderRadius: 8,
                                            background: msg.role === 'user' ? 'var(--accent)' : msg.role === 'error' ? 'var(--danger)' : 'var(--bg)',
                                            color: msg.role === 'user' || msg.role === 'error' ? '#fff' : 'var(--text-1)',
                                            border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                                        }}>
                                            <div style={{
                                                fontSize: 10,
                                                fontWeight: 600,
                                                marginBottom: 6,
                                                opacity: 0.7,
                                                textTransform: 'uppercase',
                                                letterSpacing: '.05em',
                                            }}>
                                                {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : 'Red Team AI'}
                                            </div>
                                            <div style={{
                                                fontSize: 13,
                                                lineHeight: 1.6,
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                            }}>
                                                {msg.content}
                                            </div>
                                            {msg.role === 'assistant' && msg.confidence !== undefined && (
                                                <div style={{
                                                    fontSize: 9,
                                                    marginTop: 6,
                                                    padding: '2px 6px',
                                                    background: msg.confidence > 75 ? 'rgba(10, 115, 70, 0.2)' : msg.confidence > 50 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(192, 27, 27, 0.2)',
                                                    borderRadius: 3,
                                                    display: 'inline-block',
                                                }}>
                                                    Confidence: {msg.confidence}% (based on scan data availability)
                                                </div>
                                            )}
                                            <div style={{ fontSize: 9, marginTop: 6, opacity: 0.5 }}>
                                                {new Date(msg.ts).toLocaleTimeString()}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            {loading && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 12 }}>
                                    <div className="spinner" />
                                    Analyzing network data...
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <div style={{ borderTop: '1px solid var(--border)', padding: 12, background: 'var(--bg)' }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                    placeholder="Ask about vulnerabilities, attack vectors, or security recommendations..."
                                    disabled={loading}
                                    style={{
                                        flex: 1,
                                        padding: '10px 14px',
                                        border: '1px solid var(--border)',
                                        borderRadius: 6,
                                        fontSize: 13,
                                        background: '#fff',
                                        fontFamily: 'inherit',
                                    }}
                                />
                                <button
                                    className="btn btn-primary"
                                    onClick={sendMessage}
                                    disabled={!input.trim() || loading}
                                    style={{ minWidth: 80 }}
                                >
                                    {loading ? '...' : 'Send'}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Attack Mode */}
            {mode === 'attack' && (
                <div style={{ flex: 1, display: 'flex', gap: 12, overflow: 'hidden' }}>
                    {/* Attack Vector List */}
                    <div className="card" style={{ width: '40%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="section-header">Attack Vectors</div>
                            <button className="btn btn-sm btn-primary" onClick={generateAttackVectors} disabled={loading}>
                                {loading ? 'Generating...' : 'Generate'}
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                            {attackVectors.length === 0 ? (
                                <EmptyState message="Click Generate to analyze the network and create attack scenarios" />
                            ) : (
                                attackVectors.map((vector, i) => (
                                    <div
                                        key={i}
                                        onClick={() => setSelectedVector(vector)}
                                        style={{
                                            padding: 12,
                                            marginBottom: 8,
                                            border: '1px solid var(--border)',
                                            borderRadius: 6,
                                            cursor: 'pointer',
                                            background: selectedVector === vector ? 'var(--bg)' : '#fff',
                                            borderLeft: `3px solid ${getImpactColor(vector.impact)}`,
                                        }}
                                    >
                                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{vector.name}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>{vector.category}</div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 9, padding: '2px 6px', background: getDifficultyColor(vector.difficulty), color: '#fff', borderRadius: 3 }}>
                                                {vector.difficulty}
                                            </span>
                                            <span style={{ fontSize: 9, padding: '2px 6px', background: getImpactColor(vector.impact), color: '#fff', borderRadius: 3 }}>
                                                {vector.impact} Impact
                                            </span>
                                            <span style={{ fontSize: 9, padding: '2px 6px', background: 'var(--text-3)', color: '#fff', borderRadius: 3 }}>
                                                {vector.detectionRisk} Detection
                                            </span>
                                            {vector.confidence && (
                                                <span style={{ fontSize: 9, padding: '2px 6px', background: vector.confidence === 'High' ? 'var(--success)' : vector.confidence === 'Medium' ? 'var(--warning)' : 'var(--danger)', color: '#fff', borderRadius: 3 }}>
                                                    {vector.confidence} Confidence
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Attack Vector Details */}
                    <div className="card" style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                        {!selectedVector ? (
                            <EmptyState message="Select an attack vector to view details" />
                        ) : (
                            <div>
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{selectedVector.name}</div>
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                        <span style={{ fontSize: 11, padding: '4px 10px', background: getDifficultyColor(selectedVector.difficulty), color: '#fff', borderRadius: 4 }}>
                                            {selectedVector.difficulty}
                                        </span>
                                        <span style={{ fontSize: 11, padding: '4px 10px', background: getImpactColor(selectedVector.impact), color: '#fff', borderRadius: 4 }}>
                                            {selectedVector.impact} Impact
                                        </span>
                                        <span style={{ fontSize: 11, padding: '4px 10px', background: 'var(--text-3)', color: '#fff', borderRadius: 4 }}>
                                            {selectedVector.detectionRisk} Detection Risk
                                        </span>
                                        {selectedVector.confidence && (
                                            <span style={{ fontSize: 11, padding: '4px 10px', background: selectedVector.confidence === 'High' ? 'var(--success)' : selectedVector.confidence === 'Medium' ? 'var(--warning)' : 'var(--danger)', color: '#fff', borderRadius: 4 }}>
                                                {selectedVector.confidence} Confidence
                                            </span>
                                        )}
                                    </div>
                                    {selectedVector.confidenceReason && (
                                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, fontStyle: 'italic' }}>
                                            {selectedVector.confidenceReason}
                                        </div>
                                    )}
                                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                                        <strong>Category:</strong> {selectedVector.category}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                                        <strong>Target:</strong> {selectedVector.target}
                                    </div>
                                    {selectedVector.estimatedTime && (
                                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                                            <strong>Estimated Time:</strong> {selectedVector.estimatedTime}
                                        </div>
                                    )}
                                </div>

                                {selectedVector.prerequisites && (
                                    <div style={{ marginBottom: 20 }}>
                                        <div className="label mb-2">Prerequisites</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-2)', padding: 12, background: 'var(--bg)', borderRadius: 6 }}>
                                            {selectedVector.prerequisites}
                                        </div>
                                    </div>
                                )}

                                <div style={{ marginBottom: 20 }}>
                                    <div className="label mb-2">Required Tools</div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {selectedVector.tools.map((tool, i) => (
                                            <span key={i} style={{ fontSize: 11, padding: '4px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--mono)' }}>
                                                {tool}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ marginBottom: 20 }}>
                                    <div className="label mb-2">Execution Steps</div>
                                    {selectedVector.steps.map((step, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                                {i + 1}
                                            </div>
                                            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', paddingTop: 2 }}>{step}</div>
                                        </div>
                                    ))}
                                </div>

                                {selectedVector.successIndicators && selectedVector.successIndicators.length > 0 && (
                                    <div style={{ marginBottom: 20 }}>
                                        <div className="label mb-2">Success Indicators</div>
                                        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: 'var(--text-2)' }}>
                                            {selectedVector.successIndicators.map((ind, i) => (
                                                <li key={i} style={{ marginBottom: 6 }}>{ind}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {selectedVector.countermeasures && selectedVector.countermeasures.length > 0 && (
                                    <div style={{ padding: 12, background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 6 }}>
                                        <div className="label mb-2" style={{ color: '#92400E' }}>Defensive Countermeasures</div>
                                        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#92400E' }}>
                                            {selectedVector.countermeasures.map((cm, i) => (
                                                <li key={i} style={{ marginBottom: 6 }}>{cm}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                .spinner {
                    width: 12px;
                    height: 12px;
                    border: 2px solid var(--border);
                    border-top-color: var(--accent);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
