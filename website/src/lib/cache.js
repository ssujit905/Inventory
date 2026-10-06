/**
 * Tiny stale-while-revalidate cache backed by localStorage.
 * Render stale instantly, revalidate in background.
 */

export function getCache(key, maxAgeMs) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return { data: null, stale: true };
        const parsed = JSON.parse(raw);
        if (!parsed || !('ts' in parsed)) return { data: null, stale: true };
        const age = Date.now() - parsed.ts;
        return { data: parsed.data ?? null, stale: age > maxAgeMs };
    } catch {
        return { data: null, stale: true };
    }
}

export function setCache(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch {
        // Quota / private mode — ignore, app works without cache.
    }
}
