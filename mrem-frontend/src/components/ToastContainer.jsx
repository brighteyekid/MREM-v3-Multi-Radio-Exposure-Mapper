import { useState, useEffect } from 'react';

let addToast = null;

export function showToast(source, message, severity = 'info') {
    if (addToast) addToast({ source, message, severity, id: Date.now() + Math.random() });
}

export default function ToastContainer() {
    const [toasts, setToasts] = useState([]);

    useEffect(() => {
        addToast = (t) => setToasts(ts => [t, ...ts].slice(0, 6));
        return () => { addToast = null; };
    }, []);

    const dismiss = (id) => setToasts(ts => ts.filter(t => t.id !== id));

    return (
        <div style={{
            position: 'fixed', bottom: 36, right: 16,
            display: 'flex', flexDirection: 'column-reverse', gap: 8,
            zIndex: 9999, pointerEvents: 'none',
        }}>
            {toasts.map(t => (
                <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
            ))}
        </div>
    );
}

function Toast({ toast, onDismiss }) {
    const { source, message, severity } = toast;
    const stripColor = severity === 'critical' ? 'var(--danger)' : severity === 'warning' ? 'var(--warning)' : 'var(--accent)';
    const duration = severity === 'critical' ? null : severity === 'warning' ? 8000 : 3000;

    useEffect(() => {
        if (duration) {
            const t = setTimeout(onDismiss, duration);
            return () => clearTimeout(t);
        }
    }, [duration, onDismiss]);

    return (
        <div style={{
            display: 'flex', width: 320, minHeight: 54,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 4, overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0,0,0,.1)',
            pointerEvents: 'all',
            animation: 'toastIn .2s ease',
        }}>
            <style>{`@keyframes toastIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}`}</style>
            <div style={{ width: 3, flexShrink: 0, background: stripColor }} />
            <div style={{ flex: 1, padding: '8px 10px' }}>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)' }}>{source}</div>
                <div style={{ fontSize: 12, color: 'var(--text-1)', marginTop: 2, lineHeight: 1.4 }}>{message}</div>
                {duration && (
                    <div style={{ height: 2, background: 'var(--border-2)', marginTop: 6, borderRadius: 1, overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', background: stripColor, borderRadius: 1,
                            animation: `timerBar ${duration}ms linear forwards`,
                        }} />
                        <style>{`@keyframes timerBar{from{width:100%}to{width:0%}}`}</style>
                    </div>
                )}
            </div>
            <button onClick={onDismiss} style={{
                alignSelf: 'flex-start', padding: '7px 8px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-3)', fontSize: 14, lineHeight: 1,
            }}>×</button>
        </div>
    );
}
