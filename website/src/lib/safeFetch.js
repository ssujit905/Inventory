import { supabaseWithTimeout } from './supabase';

/**
 * Robust async fetcher with retry, exponential backoff, and per-attempt timeout.
 * Protects against transient network drops, 502/503/504 errors, slow queries,
 * and requests that hang forever on flaky connections.
 *
 * Each attempt is raced against a timeout (via supabaseWithTimeout) so a hung
 * request fails fast with a NETWORK_TIMEOUT error and is retried, instead of
 * hanging the retry loop indefinitely. A global 25s fetch cap in lib/supabase.js
 * backs this up for every Supabase request, including ones not using safeFetch.
 *
 * @param {Function} fetchFn - Function returning a Promise (e.g. Supabase query)
 * @param {Object} options - Configuration options
 * @param {number} options.retries - Number of retry attempts (default: 3)
 * @param {number} options.baseDelayMs - Initial delay before retry in ms (default: 600)
 * @param {number} options.maxDelayMs - Cap for backoff delay (default: 3000)
 * @param {number} options.timeoutMs - Per-attempt timeout in ms (default: 20000).
 *   Must stay below the global fetch cap (25000ms) so the operation-level
 *   timeout wins first and produces a retryable NETWORK_TIMEOUT error.
 * @returns {Promise<{ data: any, error: any }>}
 */
function isTimeoutError(error) {
    if (!error) return false;
    if (error.message === 'NETWORK_TIMEOUT' || error.status === 408) return true;
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
    return /timeout|abort|Failed to fetch|NetworkError/i.test(String(error.message || ''));
}

export async function safeFetch(fetchFn, options = {}) {
    const {
        retries = 3,
        baseDelayMs = 600,
        maxDelayMs = 3000,
        timeoutMs = 20000
    } = options;

    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const result = await supabaseWithTimeout(fetchFn(), timeoutMs);
            // Handle Supabase response pattern { data, error }
            if (result && result.error) {
                lastError = result.error;
                // Only retry if it looks like a network, timeout, or temporary server error
                const isNetworkOr5xx =
                    isTimeoutError(result.error) ||
                    result.error.message?.includes('Failed to fetch') ||
                    result.error.code === '503' ||
                    result.error.code === '502' ||
                    result.error.code === '504' ||
                    result.error.status >= 500;

                if (!isNetworkOr5xx) {
                    // Do not retry 4xx client errors or database constraint rejections
                    return result;
                }
            } else {
                return result || { data: null, error: null };
            }
        } catch (err) {
            lastError = err;
        }

        // If attempts remain, wait with exponential backoff + jitter
        if (attempt < retries) {
            const jitter = Math.random() * 200;
            const delay = Math.min(baseDelayMs * Math.pow(2, attempt) + jitter, maxDelayMs);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    return {
        data: null,
        error: lastError || new Error('Network request failed after retries')
    };
}
