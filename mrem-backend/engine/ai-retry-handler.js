// MREM v3 — AI Retry Handler
// Robust retry mechanism with exponential backoff for Gemini API calls

/**
 * Retry configuration
 */
const DEFAULT_CONFIG = {
    maxRetries: 5,
    initialDelay: 2000,      // 2 seconds
    maxDelay: 60000,         // 60 seconds
    backoffMultiplier: 2,
    jitter: true,            // Add randomness to prevent thundering herd
    retryableErrors: [
        'UNAVAILABLE',
        'RESOURCE_EXHAUSTED',
        'DEADLINE_EXCEEDED',
        503,
        429,
        500,
        502,
        504
    ]
};

/**
 * Check if error is retryable
 */
function isRetryableError(error, config = DEFAULT_CONFIG) {
    if (!error) return false;

    const errorStr = JSON.stringify(error).toLowerCase();
    
    // Check for specific error codes/statuses
    for (const code of config.retryableErrors) {
        if (typeof code === 'number') {
            if (error.code === code || error.status === code) return true;
        } else {
            if (errorStr.includes(code.toLowerCase())) return true;
        }
    }

    // Check for common retry indicators
    if (errorStr.includes('high demand') ||
        errorStr.includes('rate limit') ||
        errorStr.includes('quota') ||
        errorStr.includes('timeout') ||
        errorStr.includes('temporarily unavailable')) {
        return true;
    }

    return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt, config = DEFAULT_CONFIG) {
    const exponentialDelay = Math.min(
        config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
        config.maxDelay
    );

    if (config.jitter) {
        // Add ±25% jitter
        const jitterRange = exponentialDelay * 0.25;
        const jitter = (Math.random() * 2 - 1) * jitterRange;
        return Math.max(0, exponentialDelay + jitter);
    }

    return exponentialDelay;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for async functions
 * @param {Function} fn - Async function to retry
 * @param {object} config - Retry configuration
 * @returns {Promise} Result of successful execution
 */
async function withRetry(fn, config = {}) {
    const retryConfig = { ...DEFAULT_CONFIG, ...config };
    let lastError;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
        try {
            // First attempt or retry
            if (attempt > 0) {
                const delay = calculateDelay(attempt - 1, retryConfig);
                console.log(`[AIRetry] Attempt ${attempt + 1}/${retryConfig.maxRetries + 1} after ${Math.round(delay)}ms delay`);
                await sleep(delay);
            }

            const result = await fn();
            
            // Success
            if (attempt > 0) {
                console.log(`[AIRetry] Success on attempt ${attempt + 1}`);
            }
            return result;

        } catch (error) {
            lastError = error;

            // Check if we should retry
            if (!isRetryableError(error, retryConfig)) {
                console.error('[AIRetry] Non-retryable error:', error.message);
                throw error;
            }

            // Check if we've exhausted retries
            if (attempt >= retryConfig.maxRetries) {
                console.error(`[AIRetry] Max retries (${retryConfig.maxRetries}) exhausted`);
                throw new Error(`AI service unavailable after ${retryConfig.maxRetries + 1} attempts: ${error.message}`);
            }

            // Log retry
            console.warn(`[AIRetry] Attempt ${attempt + 1} failed (${error.message}), will retry...`);
        }
    }

    // Should never reach here, but just in case
    throw lastError;
}

/**
 * Circuit breaker state
 */
class CircuitBreaker {
    constructor(config = {}) {
        this.failureThreshold = config.failureThreshold || 5;
        this.resetTimeout = config.resetTimeout || 60000; // 1 minute
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failures = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
    }

    async execute(fn) {
        // Check if circuit is open
        if (this.state === 'OPEN') {
            const timeSinceFailure = Date.now() - this.lastFailureTime;
            
            if (timeSinceFailure >= this.resetTimeout) {
                console.log('[CircuitBreaker] Attempting to close circuit (half-open state)');
                this.state = 'HALF_OPEN';
                this.successCount = 0;
            } else {
                const waitTime = Math.round((this.resetTimeout - timeSinceFailure) / 1000);
                throw new Error(`Circuit breaker OPEN. Service unavailable. Retry in ${waitTime}s`);
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    onSuccess() {
        this.failures = 0;
        
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= 2) {
                console.log('[CircuitBreaker] Circuit closed after successful recovery');
                this.state = 'CLOSED';
                this.successCount = 0;
            }
        }
    }

    onFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();

        if (this.failures >= this.failureThreshold) {
            console.error(`[CircuitBreaker] Circuit opened after ${this.failures} failures`);
            this.state = 'OPEN';
        }
    }

    getState() {
        return {
            state: this.state,
            failures: this.failures,
            lastFailureTime: this.lastFailureTime
        };
    }

    reset() {
        this.state = 'CLOSED';
        this.failures = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
    }
}

/**
 * Global circuit breaker for Gemini API
 */
const geminiCircuitBreaker = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 120000 // 2 minutes
});

/**
 * Wrapper for Gemini API calls with retry and circuit breaker
 */
async function callGeminiWithRetry(fn, options = {}) {
    const config = {
        maxRetries: options.maxRetries || 5,
        initialDelay: options.initialDelay || 3000,
        maxDelay: options.maxDelay || 60000,
        useCircuitBreaker: options.useCircuitBreaker !== false
    };

    const wrappedFn = async () => {
        if (config.useCircuitBreaker) {
            return await geminiCircuitBreaker.execute(fn);
        }
        return await fn();
    };

    return await withRetry(wrappedFn, config);
}

/**
 * Get circuit breaker status
 */
function getCircuitBreakerStatus() {
    return geminiCircuitBreaker.getState();
}

/**
 * Reset circuit breaker
 */
function resetCircuitBreaker() {
    geminiCircuitBreaker.reset();
    console.log('[CircuitBreaker] Manually reset');
}

module.exports = {
    withRetry,
    callGeminiWithRetry,
    isRetryableError,
    calculateDelay,
    CircuitBreaker,
    getCircuitBreakerStatus,
    resetCircuitBreaker
};
