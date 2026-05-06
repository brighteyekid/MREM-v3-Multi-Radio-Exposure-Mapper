# MREM v3 — Multi-Radio Exposure Mapper


MREM v3 is an advanced, hybrid cyber-physical reconnaissance platform for professional Red Team engagements. By fusing OS-level software-defined intelligence (Wi-Fi, BLE, Nmap, ARP) with dedicated hardware (Arduino Uno + NRF24L01+), MREM maps device-to-gateway relationships, cross-protocol vulnerabilities, and physical human presence in real-time.

## Key Features

*   **Hybrid Reconnaissance**: Leverages host machine network interfaces for rich protocol analysis (802.11, BLE) while utilizing a custom 128-channel NRF24L01+ hardware bridge for raw 2.4GHz energy detection.
*   **Presence Engine (RF Camera)**: Translates Wi-Fi signal variance (Welford's Algorithm) and BLE log-distance path loss into physical tracking zones, detecting motion and device presence without active transmission.
*   **Red Team AI (Gemini Flash)**: Embedded Large Language Model analyzes real-time JSON telemetry to answer natural language questions about the environment and autonomously generate actionable attack vectors.
*   **Cross-Protocol Correlation**: Links disparate signals together (e.g., matching a BLE advertisement to a hidden Wi-Fi network or an active NRF transmission) to identify complex Multi-Radio Gateways.
*   **Unified Exposure Index (UEI)**: A comprehensive 1-10 scoring engine that continuously evaluates the physical security posture based on 10 weighted data points.

---

## 🚀 Quick Start

### 1. Install Backend Dependencies
```bash
cd mrem-backend
npm install
```

### 2. Install Frontend Dependencies
```bash
cd mrem-frontend
npm install
```

### 3. Setup AI & Environment Variables
Create a `.env` file in the `mrem-backend` directory and add your Gemini API Key:
```env
GEMINI_API_KEY="your_api_key_here"
```

### 4. (Optional) Download Full OUI Vendor Database
*Highly recommended for accurate device hardware identification.*
```bash
cd mrem-backend
node scripts/generate-oui.js
```

### 5. Start the Backend Server
*Note: Depending on your OS, running packet captures (e.g., Nmap) may require `sudo` privileges.*
```bash
cd mrem-backend
npm run dev        # with nodemon hot-reload
# OR
node server.js     # production mode
```
Backend runs at: **http://localhost:3000**

### 6. Start the Frontend Dashboard
```bash
cd mrem-frontend
npm run dev
```
Frontend runs at: **http://localhost:5173**

---

## Hardware Configuration (Optional but Recommended)
To enable the 128-bin NRF24 heatmap and 2.4GHz raw energy overlap:
1. Flash the provided `mrem-backend/firmware/nrf_scanner.ino` to an Arduino Uno.
2. Connect the NRF24L01+ module via SPI.
3. Plug the Arduino into your machine; MREM will automatically bind the serial bridge on startup.
