/**
 * Robust async fetcher with retry and exponential backoff.
 * Protects against transient network drops, 502/503/504 errors, and slow queries.
 *
 * @param {Function} fetchFn - Function returning a Promise (e.g. Supabase query)
 * @param {Object} options - Configuration options
 * @param {number} options.retries - Number of retry attempts (default: 3)
 * @param {number} options.baseDelayMs - Initial delay before retry in ms (default: 600)
 * @param {number} options.maxDelayMs - Cap for backoff delay (default: 3000)
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function safeFetch(fetchFn, options = {}) {
    const {
        retries = 3,
        baseDelayMs = 600,
        maxDelayMs = 3000
    } = options;

    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const result = await fetchFn();
            // Handle Supabase response pattern { data, error }
            if (result && result.error) {
                lastError = result.error;
                // Only retry if it looks like a network or temporary server error
                const isNetworkOr5xx = 
                    result.error.message?.includes('Failed to fetch') ||
                    result.error.code === '503' ||
                    result.error.code === '502' ||
                    result.error.code === '504' ||
                    result.error.status >= 500;

                if (!isNetworkOr5xx && attempt > 0) {
                    // Stop retrying 4xx client errors
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
