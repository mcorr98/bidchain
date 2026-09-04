// In-memory buckets, one per key. Cleared on server restart, which is
// acceptable for a single-instance deployment.
const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Simple fixed-window rate limiter keyed by caller-chosen string
 * @param key - what to limit on, for example an email or an IP address
 * @param limit - maximum attempts allowed inside one window
 * @param windowMs - window length in milliseconds
 * @returns - true if the attempt is allowed, false if the limit is hit
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (bucket === undefined || bucket.resetAt < now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }
    if (bucket.count >= limit) {
        return false;
    }
    bucket.count += 1;
    return true;
}