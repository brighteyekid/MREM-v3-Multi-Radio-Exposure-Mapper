import { useState } from 'react';
import { useAppState } from '../context/WsContext';

export default function ReportPanel() {
    const { wifi, ble, nmap, exposure } = useAppState();
    const [title, setTitle] = useState('MREM Scan Report');
    const [author, setAuthor] = useState('');
    const [pdfStatus, setPdfStatus] = useState('idle'); // idle | generating | ready | error
    const [pdfUrl, setPdfUrl] = useState(null);

    const downloads = [
        { label: 'Download WiFi CSV', url: '/api/export/wifi' },
        { label: 'Download BLE CSV', url: '/api/export/ble' },
        { label: 'Download Network Hosts CSV', url: '/api/export/hosts' },
        { label: 'Download NRF Channel CSV', url: '/api/export/channels' },
    ];

    async function generatePdf() {
        setPdfStatus('generating');
        setPdfUrl(null);
        try {
            const r = await fetch('/api/export/pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, author }),
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            setPdfUrl(url);
            setPdfStatus('ready');
        } catch (e) {
            console.error(e);
            setPdfStatus('error');
        }
    }

    const score = exposure?.score ?? 0;
    const zone = exposure?.zone?.label ?? '—';

    return (
        <div>
            {/* Summary */}
            <div className="card p-4 mb-3">
                <div className="section-header">Current Scan Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
                    {[
                        { label: 'WiFi Networks', val: wifi.length },
                        { label: 'BLE Devices', val: ble.length },
                        { label: 'Network Hosts', val: nmap.length },
                        { label: 'Exposure Index', val: `${score.toFixed(1)} (${zone})` },
                    ].map(c => (
                        <div key={c.label} className="card p-3" style={{ textAlign: 'center' }}>
                            <div className="label mb-2">{c.label}</div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700 }}>{c.val}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* CSV Exports */}
            <div className="card p-4 mb-3">
                <div className="section-header">CSV Exports</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {downloads.map(d => (
                        <a key={d.url} href={d.url} download className="btn">{d.label}</a>
                    ))}
                </div>
            </div>

            {/* PDF Report */}
            <div className="card p-4">
                <div className="section-header">PDF Report</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                            <div className="label mb-2">Report Title</div>
                            <input className="input" value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div className="label mb-2">Author</div>
                            <input className="input" placeholder="Your name" value={author} onChange={e => setAuthor(e.target.value)} style={{ width: '100%' }} />
                        </div>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
                        The PDF report includes: scan timestamp, environment summary, Exposure Index breakdown,
                        WiFi network table, BLE device table, Nmap host table, top NRF channels, and correlation findings.
                        Generation takes 3–5 seconds (Puppeteer headless Chrome).
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <button className="btn btn-primary" onClick={generatePdf} disabled={pdfStatus === 'generating'}>
                            {pdfStatus === 'generating' ? '⏳ Generating...' : '⬇ Generate PDF Report'}
                        </button>
                        {pdfStatus === 'ready' && pdfUrl && (
                            <a href={pdfUrl} download="mrem-report.pdf" className="btn btn-primary">⬇ Download PDF</a>
                        )}
                        {pdfStatus === 'error' && (
                            <span style={{ color: 'var(--danger)', fontSize: 12 }}>PDF generation failed — ensure Puppeteer is installed</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
