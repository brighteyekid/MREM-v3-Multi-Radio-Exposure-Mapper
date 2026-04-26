// MREM v3 — Report Generator
// CSV exports and Puppeteer PDF generation

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const OUTPUT_DIR = path.resolve(__dirname, 'output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCSV(rows, columns) {
  const header = columns.join(',');
  const lines = rows.map(row => columns.map(c => escapeCSV(row[c])).join(','));
  return [header, ...lines].join('\n');
}

function exportWifi(wifiData) {
  const cols = ['ssid', 'bssid', 'channel', 'signal_level', 'security', 'vendor', 'firstSeen', 'appearanceCount'];
  return toCSV(wifiData, cols);
}

function exportBle(bleData) {
  const cols = ['id', 'localName', 'rssi', 'connectable', 'addressType', 'vendor', 'firstSeen', 'appearanceCount'];
  return toCSV(bleData, cols);
}

function exportHosts(nmapData) {
  const cols = ['ip', 'mac', 'hostname', 'vendor', 'os_match', 'os_confidence', 'risk_score'];
  return toCSV(nmapData, cols);
}

function exportChannels(nrfBins) {
  const rows = (nrfBins || []).map((hits, i) => ({ channel: i, frequency_mhz: 2401 + i, hits }));
  return toCSV(rows, ['channel', 'frequency_mhz', 'hits']);
}

function saveCsv(filename, content) {
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

async function generatePdf(state = {}, meta = {}) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    throw new Error('puppeteer not installed — run: npm install puppeteer');
  }

  const sessionId = uuidv4().slice(0, 8);
  const timestamp = new Date().toISOString();
  const title = meta.title || 'MREM Scan Report';
  const author = meta.author || require('os').hostname();

  const html = buildReportHtml({ ...state, title, author, timestamp, sessionId });
  const htmlPath = path.join(OUTPUT_DIR, `report-${sessionId}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  const pdfPath = path.join(OUTPUT_DIR, `mrem-report-${sessionId}.pdf`);
  await page.pdf({ path: pdfPath, format: 'A4', margin: { top: '1.5cm', bottom: '1.5cm', left: '1.5cm', right: '1.5cm' } });

  await browser.close();
  fs.unlinkSync(htmlPath);
  return pdfPath;
}

function buildReportHtml({ wifi, ble, nmap, nrf, exposureData, correlations, title, author, timestamp, sessionId }) {
  const ei = exposureData || {};
  const score = ei.score || '—';
  const zone = ei.zone ? ei.zone.label : '—';

  const wifiRows = (wifi || []).map(n =>
    `<tr><td>${n.ssid || ''}</td><td class="mono">${n.bssid || ''}</td><td>${n.channel || ''}</td><td>${n.signal_level || ''} dBm</td><td>${n.security || ''}</td><td>${n.vendor || ''}</td></tr>`
  ).join('');

  const bleRows = (ble || []).map(d =>
    `<tr><td>${d.localName || '[unnamed]'}</td><td class="mono">${d.id || ''}</td><td>${d.rssi || ''} dBm</td><td>${d.connectable ? 'Yes' : 'No'}</td><td>${d.vendor || ''}</td></tr>`
  ).join('');

  const hostRows = (nmap || []).map(h =>
    `<tr><td class="mono">${h.ip || ''}</td><td>${h.hostname || ''}</td><td>${h.vendor || ''}</td><td>${h.os_match || ''}</td><td>${(h.ports || []).map(p => p.port).join(', ')}</td><td>${h.risk_score || 0}</td></tr>`
  ).join('');

  const corrRows = (correlations || []).slice(0, 10).map(f =>
    `<tr><td><span class="badge">${f.ruleType}</span></td><td>${f.description}</td><td>${f.severity}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1A1A18; background: #fff; padding: 0; }
  .cover { padding: 48px 48px 32px; border-bottom: 2px solid #1A1A18; margin-bottom: 32px; }
  .cover h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
  .cover .logo { font-family: monospace; font-size: 14px; color: #6B6B66; margin-bottom: 16px; }
  .cover .meta { color: #6B6B66; font-size: 11px; margin-top: 8px; }
  .section { padding: 0 48px 32px; }
  h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #6B6B66; margin-bottom: 12px; padding-bottom: 4px; border-bottom: 1px solid #E8E6E1; }
  .ei-box { display: inline-block; padding: 16px 24px; border: 1px solid #E8E6E1; margin-bottom: 20px; }
  .ei-score { font-family: monospace; font-size: 48px; font-weight: 700; }
  .ei-zone { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #6B6B66; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 8px; }
  th { text-align: left; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 9px; color: #A8A8A3; border-bottom: 1px solid #E8E6E1; padding: 4px 6px; }
  td { padding: 4px 6px; border-bottom: 1px solid #F0EEE9; }
  .mono { font-family: monospace; }
  .badge { display: inline-block; font-family: monospace; font-size: 9px; padding: 1px 5px; background: #F0EEE9; border: 1px solid #E8E6E1; border-radius: 2px; }
  .footer { padding: 16px 48px; border-top: 1px solid #E8E6E1; color: #A8A8A3; font-size: 9px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="cover">
  <div class="logo">MREM — MULTI-RADIO EXPOSURE MAPPER · v3.0</div>
  <h1>${title}</h1>
  <div class="meta">Generated: ${timestamp} · Author: ${author} · Session: ${sessionId}</div>
</div>

<div class="section">
  <h2>Exposure Index</h2>
  <div class="ei-box">
    <div class="ei-score">${score}</div>
    <div class="ei-zone">${zone}</div>
  </div>
  <p style="color:#6B6B66; font-size:11px;">Composite score from ${(ei.factors || []).length} factors. Range: 1.0 (minimal) – 10.0 (critical).</p>
</div>

<div class="section">
  <h2>WiFi Networks (${(wifi || []).length})</h2>
  <table><thead><tr><th>SSID</th><th>BSSID</th><th>Ch</th><th>Signal</th><th>Security</th><th>Vendor</th></tr></thead>
  <tbody>${wifiRows || '<tr><td colspan="6">No networks</td></tr>'}</tbody></table>
</div>

<div class="section">
  <h2>BLE Devices (${(ble || []).length})</h2>
  <table><thead><tr><th>Name</th><th>Address</th><th>RSSI</th><th>Connectable</th><th>Vendor</th></tr></thead>
  <tbody>${bleRows || '<tr><td colspan="5">No devices</td></tr>'}</tbody></table>
</div>

<div class="section">
  <h2>Network Hosts (${(nmap || []).length})</h2>
  <table><thead><tr><th>IP</th><th>Hostname</th><th>Vendor</th><th>OS</th><th>Open Ports</th><th>Risk</th></tr></thead>
  <tbody>${hostRows || '<tr><td colspan="6">No hosts</td></tr>'}</tbody></table>
</div>

<div class="section">
  <h2>Correlation Findings (${(correlations || []).length})</h2>
  <table><thead><tr><th>Rule</th><th>Description</th><th>Severity</th></tr></thead>
  <tbody>${corrRows || '<tr><td colspan="3">No findings yet</td></tr>'}</tbody></table>
</div>

<div class="footer">
  <span>MREM v3 — Multi-Radio Exposure Mapper</span>
  <span>${timestamp}</span>
</div>
</body>
</html>`;
}

module.exports = { exportWifi, exportBle, exportHosts, exportChannels, saveCsv, generatePdf };
