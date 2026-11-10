export class RateLimiterRegistry {
  constructor() {
    this.buckets = new Map();
  }

  tryConsume(providerId, rpmLimit = 30, now = Date.now()) {
    if (!rpmLimit || rpmLimit <= 0) return { allowed: true, retryAfterMs: 0 };
    const capacity = Math.max(1, rpmLimit);
    const refillPerMs = capacity / 60_000;

    let bucket = this.buckets.get(providerId);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: now, capacity };
      this.buckets.set(providerId, bucket);
    }

    const elapsed = Math.max(0, now - bucket.lastRefill);
    bucket.capacity = capacity;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterMs: 0 };
    }

    const needed = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil(needed / refillPerMs);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  reset(providerId) {
    if (providerId) this.buckets.delete(providerId);
    else this.buckets.clear();
  }
}
