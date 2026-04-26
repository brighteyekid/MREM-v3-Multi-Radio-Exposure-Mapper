// MREM v3 — Dynamic Port Risk Analyzer
// Context-aware port risk assessment based on environment and service detection

const fs = require('fs');
const path = require('path');

let portRisks = {};
let lastLoaded = 0;
const RELOAD_INTERVAL = 300000; // Reload every 5 minutes

/**
 * Load port risks database
 */
function loadPortRisks() {
    try {
        const risksPath = path.resolve(__dirname, '../data/port_risks.json');
        const data = fs.readFileSync(risksPath, 'utf8');
        portRisks = JSON.parse(data);
        lastLoaded = Date.now();
        console.log('[PortRiskAnalyzer] Loaded risk data for', Object.keys(portRisks).length - 1, 'ports');
    } catch (e) {
        console.error('[PortRiskAnalyzer] Failed to load port_risks.json:', e.message);
        portRisks = {};
    }
}

/**
 * Get base risk for a port
 * @param {number|string} port - Port number
 * @returns {object|null} Risk data or null
 */
function getPortRisk(port) {
    // Reload if stale
    if (Date.now() - lastLoaded > RELOAD_INTERVAL) {
        loadPortRisks();
    }

    const portStr = String(port);
    if (portRisks[portStr] && portStr !== '_metadata') {
        return { ...portRisks[portStr], port: parseInt(port) };
    }
    return null;
}

/**
 * Analyze port risk with context awareness
 * @param {object} portInfo - { port, protocol, service, version, state }
 * @param {object} context - { hostOS, isInternal, hasFirewall, networkType }
 * @returns {object} Enhanced risk assessment
 */
function analyzePortRisk(portInfo, context = {}) {
    const { port, protocol = 'tcp', service, version, state = 'open' } = portInfo;
    const { hostOS, isInternal = true, hasFirewall = false, networkType = 'unknown' } = context;

    // Get base risk
    let baseRisk = getPortRisk(port);
    
    // If port not in database, calculate dynamic risk
    if (!baseRisk) {
        baseRisk = calculateDynamicRisk(port, service, protocol);
    }

    // Context-aware risk adjustment
    let adjustedRisk = baseRisk.risk;
    const riskFactors = [];

    // Internal vs External
    if (!isInternal) {
        adjustedRisk += 2;
        riskFactors.push('Exposed to internet (+2 risk)');
    }

    // Firewall protection
    if (!hasFirewall) {
        adjustedRisk += 1;
        riskFactors.push('No firewall detected (+1 risk)');
    }

    // OS-specific risks
    if (hostOS) {
        const osRisk = assessOSSpecificRisk(port, service, hostOS);
        adjustedRisk += osRisk.adjustment;
        if (osRisk.reason) riskFactors.push(osRisk.reason);
    }

    // Service version vulnerabilities
    if (version) {
        const versionRisk = assessVersionRisk(service, version);
        adjustedRisk += versionRisk.adjustment;
        if (versionRisk.reason) riskFactors.push(versionRisk.reason);
    }

    // Network type considerations
    if (networkType === 'enterprise') {
        // Some services are expected in enterprise
        if ([389, 636, 88, 464].includes(port)) {
            adjustedRisk -= 1;
            riskFactors.push('Expected in enterprise environment (-1 risk)');
        }
    } else if (networkType === 'home') {
        // Some services are unusual in home networks
        if ([1433, 3306, 5432, 27017].includes(port)) {
            adjustedRisk += 1;
            riskFactors.push('Unusual for home network (+1 risk)');
        }
    } else if (networkType === 'iot') {
        // IoT-specific risks
        if ([1883, 8883, 5683].includes(port)) {
            adjustedRisk += 1;
            riskFactors.push('IoT protocol - often misconfigured (+1 risk)');
        }
    }

    // Port state
    if (state === 'filtered') {
        adjustedRisk -= 1;
        riskFactors.push('Port filtered (-1 risk)');
    }

    // Cap risk at 0-10
    adjustedRisk = Math.max(0, Math.min(10, adjustedRisk));

    return {
        port,
        service: baseRisk.service || service || 'Unknown',
        baseRisk: baseRisk.risk,
        adjustedRisk: Math.round(adjustedRisk * 10) / 10,
        category: baseRisk.category || 'unknown',
        reason: baseRisk.reason || 'Unknown service',
        attackVectors: baseRisk.attack_vectors || [],
        mitigation: baseRisk.mitigation || 'Restrict access and monitor',
        cveExamples: baseRisk.cve_examples || [],
        riskFactors,
        severity: getRiskSeverity(adjustedRisk)
    };
}

/**
 * Calculate dynamic risk for unknown ports
 */
function calculateDynamicRisk(port, service, protocol) {
    let risk = 3; // Default medium-low risk
    let reason = 'Unknown service';
    const category = 'unknown';

    // Well-known ports (0-1023) are more likely to be critical services
    if (port < 1024) {
        risk = 5;
        reason = 'Well-known port range, likely system service';
    }
    // Registered ports (1024-49151)
    else if (port < 49152) {
        risk = 4;
        reason = 'Registered port range';
    }
    // Dynamic/private ports (49152-65535)
    else {
        risk = 3;
        reason = 'Dynamic port range, likely temporary service';
    }

    // Service name heuristics
    if (service) {
        const serviceLower = service.toLowerCase();
        
        // Database indicators
        if (serviceLower.includes('sql') || serviceLower.includes('db') || serviceLower.includes('mongo')) {
            risk = 7;
            reason = 'Database service detected';
        }
        // Remote access indicators
        else if (serviceLower.includes('ssh') || serviceLower.includes('rdp') || serviceLower.includes('vnc')) {
            risk = 6;
            reason = 'Remote access service detected';
        }
        // Web services
        else if (serviceLower.includes('http') || serviceLower.includes('web')) {
            risk = 4;
            reason = 'Web service detected';
        }
        // Admin/management
        else if (serviceLower.includes('admin') || serviceLower.includes('manage')) {
            risk = 7;
            reason = 'Administrative interface detected';
        }
    }

    return {
        service: service || `Port ${port}`,
        risk,
        category,
        reason,
        attack_vectors: ['Port scanning', 'Service fingerprinting'],
        mitigation: 'Identify service and apply appropriate security controls',
        cve_examples: []
    };
}

/**
 * Assess OS-specific risks
 */
function assessOSSpecificRisk(port, service, hostOS) {
    const osLower = (hostOS || '').toLowerCase();
    
    // Windows-specific
    if (osLower.includes('windows')) {
        // SMB on Windows
        if ([139, 445].includes(port)) {
            return { adjustment: 1, reason: 'SMB on Windows - high-value target (+1 risk)' };
        }
        // RDP on Windows
        if (port === 3389) {
            return { adjustment: 1, reason: 'RDP on Windows - frequent attack target (+1 risk)' };
        }
        // WinRM
        if ([5985, 5986].includes(port)) {
            return { adjustment: 1, reason: 'WinRM exposed (+1 risk)' };
        }
    }
    
    // Linux-specific
    if (osLower.includes('linux')) {
        // SSH on Linux
        if (port === 22) {
            return { adjustment: 0, reason: 'SSH on Linux - expected' };
        }
        // Docker on Linux
        if ([2375, 2376].includes(port)) {
            return { adjustment: 2, reason: 'Docker API on Linux - critical if exposed (+2 risk)' };
        }
    }
    
    // Embedded/IoT
    if (osLower.includes('embedded') || osLower.includes('iot')) {
        // Telnet on IoT
        if (port === 23) {
            return { adjustment: 2, reason: 'Telnet on IoT device - critical vulnerability (+2 risk)' };
        }
        // HTTP on IoT
        if (port === 80) {
            return { adjustment: 1, reason: 'HTTP on IoT - often has vulnerabilities (+1 risk)' };
        }
    }

    return { adjustment: 0, reason: null };
}

/**
 * Assess version-specific risks
 */
function assessVersionRisk(service, version) {
    if (!service || !version) return { adjustment: 0, reason: null };

    const serviceLower = service.toLowerCase();
    const versionLower = version.toLowerCase();

    // OpenSSH version checks
    if (serviceLower.includes('openssh')) {
        const versionMatch = version.match(/(\d+)\.(\d+)/);
        if (versionMatch) {
            const major = parseInt(versionMatch[1]);
            const minor = parseInt(versionMatch[2]);
            
            if (major < 7) {
                return { adjustment: 2, reason: `OpenSSH ${version} - outdated, known vulnerabilities (+2 risk)` };
            } else if (major === 7 && minor < 4) {
                return { adjustment: 1, reason: `OpenSSH ${version} - old version (+1 risk)` };
            }
        }
    }

    // Apache version checks
    if (serviceLower.includes('apache')) {
        if (versionLower.includes('2.2')) {
            return { adjustment: 2, reason: 'Apache 2.2 - end of life (+2 risk)' };
        } else if (versionLower.includes('2.4') && versionLower.match(/2\.4\.[0-9](?![0-9])/)) {
            return { adjustment: 1, reason: 'Apache 2.4.x - old minor version (+1 risk)' };
        }
    }

    // MySQL version checks
    if (serviceLower.includes('mysql')) {
        if (versionLower.includes('5.5') || versionLower.includes('5.6')) {
            return { adjustment: 2, reason: 'MySQL 5.5/5.6 - end of life (+2 risk)' };
        }
    }

    // Generic old version detection
    if (versionLower.includes('old') || versionLower.includes('legacy')) {
        return { adjustment: 1, reason: 'Legacy version detected (+1 risk)' };
    }

    return { adjustment: 0, reason: null };
}

/**
 * Get risk severity label
 */
function getRiskSeverity(risk) {
    if (risk <= 2) return 'Low';
    if (risk <= 4) return 'Medium';
    if (risk <= 6) return 'Elevated';
    if (risk <= 8) return 'High';
    return 'Critical';
}

/**
 * Analyze multiple ports for a host
 * @param {Array} ports - Array of port objects
 * @param {object} context - Host context
 * @returns {object} Comprehensive risk assessment
 */
function analyzeHostPorts(ports, context = {}) {
    const analyses = ports.map(p => analyzePortRisk(p, context));
    
    // Calculate aggregate risk
    const totalRisk = analyses.reduce((sum, a) => sum + a.adjustedRisk, 0);
    const avgRisk = analyses.length > 0 ? totalRisk / analyses.length : 0;
    const maxRisk = Math.max(...analyses.map(a => a.adjustedRisk), 0);
    
    // Count by severity
    const severityCounts = {
        Low: analyses.filter(a => a.severity === 'Low').length,
        Medium: analyses.filter(a => a.severity === 'Medium').length,
        Elevated: analyses.filter(a => a.severity === 'Elevated').length,
        High: analyses.filter(a => a.severity === 'High').length,
        Critical: analyses.filter(a => a.severity === 'Critical').length
    };

    // Identify critical services
    const criticalServices = analyses
        .filter(a => a.adjustedRisk >= 7)
        .sort((a, b) => b.adjustedRisk - a.adjustedRisk);

    return {
        portAnalyses: analyses,
        summary: {
            totalPorts: analyses.length,
            averageRisk: Math.round(avgRisk * 10) / 10,
            maximumRisk: maxRisk,
            overallSeverity: getRiskSeverity(maxRisk),
            severityCounts,
            criticalServices: criticalServices.map(a => ({
                port: a.port,
                service: a.service,
                risk: a.adjustedRisk
            }))
        }
    };
}

/**
 * Get all port categories
 */
function getCategories() {
    const categories = new Set();
    Object.values(portRisks).forEach(risk => {
        if (risk.category) categories.add(risk.category);
    });
    return Array.from(categories);
}

/**
 * Get ports by category
 */
function getPortsByCategory(category) {
    return Object.entries(portRisks)
        .filter(([port, data]) => port !== '_metadata' && data.category === category)
        .map(([port, data]) => ({ port: parseInt(port), ...data }));
}

// Initialize
loadPortRisks();

module.exports = {
    getPortRisk,
    analyzePortRisk,
    analyzeHostPorts,
    getCategories,
    getPortsByCategory,
    loadPortRisks
};
