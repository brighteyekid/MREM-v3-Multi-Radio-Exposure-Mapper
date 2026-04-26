#!/usr/bin/env bash
# MREM v3 — Privilege Setup Script
# Grants Linux capabilities to Node.js and Nmap so MREM can run WITHOUT sudo.
# Run ONCE as root or with sudo: bash scripts/setup-caps.sh
#
# What this does:
#   1. cap_net_raw + cap_net_admin → Node.js (enables Noble BLE scanning)
#   2. cap_net_raw + cap_net_admin → nmap    (enables OS fingerprinting, SYN scan)
#   3. Adds nmap to sudoers for passwordless sudo (alternative approach)

set -e

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║  MREM v3 — Privilege Setup                ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Check we are root
if [ "$(id -u)" -ne 0 ]; then
  echo "❌  This script must be run as root:"
  echo "    sudo bash scripts/setup-caps.sh"
  exit 1
fi

# Find node binary
NODE_BIN=$(which node 2>/dev/null || which nodejs 2>/dev/null)
if [ -z "$NODE_BIN" ]; then
  echo "❌  Node.js not found in PATH"
  exit 1
fi
# Resolve symlinks (setcap needs the real binary)
NODE_REAL=$(readlink -f "$NODE_BIN")
echo "→  Node.js binary: $NODE_REAL"

# Find nmap
NMAP_BIN=$(which nmap 2>/dev/null)
if [ -z "$NMAP_BIN" ]; then
  echo "⚠  nmap not found — install with: sudo apt install nmap"
else
  NMAP_REAL=$(readlink -f "$NMAP_BIN")
  echo "→  Nmap binary:    $NMAP_REAL"
fi

echo ""
echo "→  Granting cap_net_raw + cap_net_admin to Node.js..."
setcap cap_net_raw,cap_net_admin+eip "$NODE_REAL"
echo "   ✓ Done"

if [ -n "$NMAP_REAL" ]; then
  echo "→  Granting cap_net_raw + cap_net_admin to nmap..."
  setcap cap_net_raw,cap_net_admin+eip "$NMAP_REAL"
  echo "   ✓ Done"
fi

echo ""
echo "✅  Capabilities granted. You can now run MREM without sudo:"
echo "    node server.js"
echo ""
echo "Note: If Node.js is updated via nvm or package manager,"
echo "      re-run this script as the new binary won't have capabilities."
echo ""

# Verify
echo "→  Verifying Node.js capabilities:"
getcap "$NODE_REAL" || echo "   (getcap not available)"
if [ -n "$NMAP_REAL" ]; then
  echo "→  Verifying nmap capabilities:"
  getcap "$NMAP_REAL" || echo "   (getcap not available)"
fi
