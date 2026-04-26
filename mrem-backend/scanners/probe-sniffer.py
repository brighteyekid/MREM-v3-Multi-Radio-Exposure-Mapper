#!/usr/bin/env python3
# MREM v3 — Probe Request Sniffer
# Uses Scapy to capture 802.11 probe request frames in monitor mode
# Usage: python3 probe-sniffer.py <interface>
# Outputs one JSON line per captured probe request to stdout

import sys
import json
import time
import signal
import subprocess

iface = sys.argv[1] if len(sys.argv) > 1 else 'wlan0'

def enable_monitor_mode(interface):
    try:
        subprocess.run(['ip', 'link', 'set', interface, 'down'], check=True, capture_output=True)
        subprocess.run(['iw', 'dev', interface, 'set', 'type', 'monitor'], check=True, capture_output=True)
        subprocess.run(['ip', 'link', 'set', interface, 'up'], check=True, capture_output=True)
        return True
    except Exception as e:
        return False

def disable_monitor_mode(interface):
    try:
        subprocess.run(['ip', 'link', 'set', interface, 'down'], capture_output=True)
        subprocess.run(['iw', 'dev', interface, 'set', 'type', 'managed'], capture_output=True)
        subprocess.run(['ip', 'link', 'set', interface, 'up'], capture_output=True)
    except:
        pass

def handle_packet(pkt):
    try:
        from scapy.layers.dot11 import Dot11ProbeReq, Dot11Elt, Dot11
        if pkt.haslayer(Dot11ProbeReq):
            src_mac = pkt[Dot11].addr2 or ''
            ssid = ''
            if pkt.haslayer(Dot11Elt):
                ssid = pkt[Dot11Elt].info.decode('utf-8', errors='replace')
            rssi = getattr(pkt, 'dBm_AntSignal', None)
            out = {
                'type': 'probe',
                'src_mac': src_mac,
                'ssid': ssid,
                'rssi': rssi,
                'ts': int(time.time())
            }
            print(json.dumps(out), flush=True)
    except Exception:
        pass

def cleanup(signum, frame):
    disable_monitor_mode(iface)
    sys.exit(0)

signal.signal(signal.SIGTERM, cleanup)
signal.signal(signal.SIGINT, cleanup)

# Check for scapy
try:
    from scapy.all import sniff
    from scapy.layers.dot11 import Dot11ProbeReq
except ImportError:
    print(json.dumps({'type': 'error', 'message': 'scapy not installed — run: pip install scapy'}), flush=True)
    sys.exit(1)

print(json.dumps({'type': 'status', 'message': f'Enabling monitor mode on {iface}'}), flush=True)

if not enable_monitor_mode(iface):
    print(json.dumps({'type': 'error', 'message': f'Monitor mode not available on {iface}'}), flush=True)
    sys.exit(1)

print(json.dumps({'type': 'status', 'message': f'Sniffing probe requests on {iface}'}), flush=True)

try:
    sniff(iface=iface, prn=handle_packet, store=False)
finally:
    disable_monitor_mode(iface)
