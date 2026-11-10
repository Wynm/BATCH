export class CircuitBreakerRegistry {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold ?? 2;
    this.defaultCooldownMs = options.defaultCooldownMs ?? 30_000;
    this.authCooldownMs = options.authCooldownMs ?? 300_000;
    this.states = new Map();
  }

  _get(providerId) {
    if (!this.states.has(providerId)) {
      this.states.set(providerId, {
        providerId,
        state: 'closed', // 'closed' | 'open' | 'half-open'
        failures: 0,
        successes: 0,
        ewmaLatencyMs: null,
        cooldownUntil: 0,
        lastError: null,
        lastStatus: null,
        lastUpdatedAt: Date.now(),
      });
    }
    return this.states.get(providerId);
  }

  canAttempt(providerId, now = Date.now()) {
    const entry = this._get(providerId);
    if (entry.state === 'closed') return true;
    if (entry.state === 'open') {
      if (now >= entry.cooldownUntil) {
        entry.state = 'half-open';
        entry.lastUpdatedAt = now;
        return true;
      }
      return false;
    }
    // half-open allows probe
    return true;
  }

  recordSuccess(providerId, latencyMs = 0, now = Date.now()) {
    const entry = this._get(providerId);
    entry.state = 'closed';
    entry.failures = 0;
    entry.successes += 1;
    entry.cooldownUntil = 0;
    entry.lastError = null;
    entry.lastStatus = 200;
    entry.ewmaLatencyMs = entry.ewmaLatencyMs == null
      ? latencyMs
      : Math.round(entry.ewmaLatencyMs * 0.7 + latencyMs * 0.3);
    entry.lastUpdatedAt = now;
  }

  recordFailure(providerId, { httpStatus = 500, message = 'Upstream error', retryAfterMs = null } = {}, now = Date.now()) {
    const entry = this._get(providerId);
    entry.failures += 1;
    entry.lastError = message;
    entry.lastStatus = httpStatus;
    entry.lastUpdatedAt = now;

    if (httpStatus === 401 || httpStatus === 403) {
      entry.state = 'open';
      entry.cooldownUntil = now + this.authCooldownMs;
      return entry;
    }

    if (httpStatus === 429) {
      entry.state = 'open';
      entry.cooldownUntil = now + (retryAfterMs ?? this.defaultCooldownMs);
      return entry;
    }

    if (entry.state === 'half-open' || entry.failures >= this.failureThreshold) {
      entry.state = 'open';
      entry.cooldownUntil = now + (retryAfterMs ?? this.defaultCooldownMs);
    }
    return entry;
  }

  reset(providerId) {
    this.states.delete(providerId);
  }

  getStatus(providerId, now = Date.now()) {
    const entry = this._get(providerId);
    const remainingCooldownMs = entry.state === 'open' ? Math.max(0, entry.cooldownUntil - now) : 0;
    return {
      ...entry,
      effectiveState: entry.state === 'open' && remainingCooldownMs === 0 ? 'half-open' : entry.state,
      remainingCooldownMs,
    };
  }

  snapshot(providerIds = [], now = Date.now()) {
    const ids = new Set([...providerIds, ...this.states.keys()]);
    return Array.from(ids).map((id) => this.getStatus(id, now));
  }
}

export function parseRetryAfterMs(headerVal) {
  if (!headerVal) return null;
  const trimmed = String(headerVal).trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.max(Math.round(seconds * 1000), 1000), 600_000);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 1000), 600_000);
  }
  return null;
}
