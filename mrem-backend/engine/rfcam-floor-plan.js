// MREM RF Camera Addon — Floor Plan Manager
// Manages AP positions in canvas space and real-world meters.
// Persists to data/rfcam_floorplan.json

const fs = require('fs');
const path = require('path');

const FP_PATH = path.resolve(__dirname, '../data/rfcam_floorplan.json');

const DEFAULT_CANVAS = 600; // px

class FloorPlan {
    constructor() {
        this.aps = {};          // bssid → { canvas_x, canvas_y, real_x_m, real_y_m, ssid, is_anchor, tx_power_dbm }
        this.canvasSize = DEFAULT_CANVAS;
        this.roomWidthM = 10;   // default room width meters
        this.roomHeightM = 8;
        this.mode = 'auto'; // 'auto' | 'manual'
        this.laptopX = DEFAULT_CANVAS / 2;
        this.laptopY = DEFAULT_CANVAS / 2;
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(FP_PATH)) {
                const data = JSON.parse(fs.readFileSync(FP_PATH, 'utf8'));
                Object.assign(this, data);
                console.log(`[FloorPlan] Loaded — ${Object.keys(this.aps).length} APs`);
            }
        } catch (e) {
            console.warn('[FloorPlan] Could not load floor plan:', e.message);
        }
    }

    save() {
        try {
            fs.writeFileSync(FP_PATH, JSON.stringify({
                aps: this.aps, canvasSize: this.canvasSize,
                roomWidthM: this.roomWidthM, roomHeightM: this.roomHeightM,
                mode: this.mode, laptopX: this.laptopX, laptopY: this.laptopY,
            }, null, 2));
        } catch (e) {
            console.warn('[FloorPlan] Save failed:', e.message);
        }
    }

    /** Auto-distribute APs evenly around a circle — no measurement needed */
    autoLayout(apList, canvasSize = DEFAULT_CANVAS) {
        this.canvasSize = canvasSize;
        this.laptopX = canvasSize / 2;
        this.laptopY = canvasSize / 2;
        const radius = Math.floor(canvasSize / 3);
        // Sort by RSSI descending (strongest = 12 o'clock)
        const sorted = [...apList].sort((a, b) => (b.rssi || b.signal_level || -100) - (a.rssi || a.signal_level || -100));
        sorted.forEach((ap, i) => {
            const angle = (i / sorted.length) * 2 * Math.PI - Math.PI / 2;
            const bssid = (ap.bssid || ap.id || '').toLowerCase();
            if (!bssid) return;
            const existing = this.aps[bssid] || {};
            this.aps[bssid] = {
                ...existing,
                canvas_x: Math.round(canvasSize / 2 + radius * Math.cos(angle)),
                canvas_y: Math.round(canvasSize / 2 + radius * Math.sin(angle)),
                ssid: ap.ssid || existing.ssid || bssid,
                rssi: ap.signal_level || ap.rssi || existing.rssi || -80,
                tx_power_dbm: existing.tx_power_dbm || -59,
                is_anchor: existing.is_anchor ?? true,
            };
        });
    }

    getAPPosition(bssid) {
        return this.aps[(bssid || '').toLowerCase()] || null;
    }

    setAPPosition(bssid, x, y, realXm, realYm) {
        const key = (bssid || '').toLowerCase();
        this.aps[key] = { ...(this.aps[key] || {}), canvas_x: x, canvas_y: y, real_x_m: realXm, real_y_m: realYm };
    }

    setAPAnchor(bssid, isAnchor) {
        const key = (bssid || '').toLowerCase();
        if (this.aps[key]) this.aps[key].is_anchor = isAnchor;
    }

    toJSON() {
        return {
            aps: this.aps, canvasSize: this.canvasSize,
            roomWidthM: this.roomWidthM, roomHeightM: this.roomHeightM,
            mode: this.mode, laptopX: this.laptopX, laptopY: this.laptopY,
        };
    }
}

module.exports = new FloorPlan();
