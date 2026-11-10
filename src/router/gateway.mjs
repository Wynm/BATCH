import crypto from 'node:crypto';
import { CircuitBreakerRegistry, parseRetryAfterMs } from './circuitBreaker.mjs';
import { RateLimiterRegistry } from './rateLimiter.mjs';
import { buildCacheKey, shouldUseCache } from './cache.mjs';
import {
  anthropicResponseToOpenAI,
  createSimulatorCompletion,
  openAIRequestToAnthropic,
  streamSimulatorChunks,
} from './adapters.mjs';

export class GatewayRouter {
  constructor(store, options = {}) {
    this.store = store;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.cacheTtlMs = options.cacheTtlMs ?? 3600_000;
    this.circuitBreaker = options.circuitBreaker ?? new CircuitBreakerRegistry();
    this.rateLimiter = options.rateLimiter ?? new RateLimiterRegistry();
    this.roundRobinCursors = new Map();
  }

  _isProviderReady(provider) {
    if (!provider || !provider.enabled) return false;
    if (provider.kind === 'simulator' || provider.kind === 'local-openai') return true;
    return Boolean(provider.apiKey && provider.apiKey.trim());
  }

  resolveTargets(requestedModel) {
    const raw = (requestedModel || 'auto-free').trim();
    const providers = this.store.listProviders(true);
    const byId = new Map(providers.map((p) => [p.id, p]));

    const comboKey = raw === 'auto' ? 'auto-free' : raw.startsWith('combo:') ? raw.slice(6) : raw;
    const combo = this.store.getCombo(comboKey);

    if (combo) {
      let ordered = combo.providerIds
        .map((id) => byId.get(id))
        .filter((p) => this._isProviderReady(p));

      if (combo.strategy === 'round-robin' && ordered.length > 1) {
        const cursor = this.roundRobinCursors.get(combo.id) ?? 0;
        this.roundRobinCursors.set(combo.id, (cursor + 1) % ordered.length);
        ordered = [...ordered.slice(cursor), ...ordered.slice(0, cursor)];
      } else if (combo.strategy === 'lowest-latency' && ordered.length > 1) {
        ordered = [...ordered].sort((a, b) => {
          const la = this.circuitBreaker.getStatus(a.id).ewmaLatencyMs ?? 150;
          const lb = this.circuitBreaker.getStatus(b.id).ewmaLatencyMs ?? 150;
          return la - lb;
        });
      }

      return {
        comboId: combo.id,
        targets: ordered.map((p) => ({ provider: p, model: p.defaultModel })),
      };
    }

    const slashIdx = raw.indexOf('/');
    if (slashIdx > 0) {
      const prefix = raw.slice(0, slashIdx);
      const rest = raw.slice(slashIdx + 1);
      const direct = byId.get(prefix);
      if (direct) {
        if (!this._isProviderReady(direct)) {
          return { comboId: null, targets: [], disabledProvider: direct.id };
        }
        return {
          comboId: null,
          targets: [{ provider: direct, model: rest || direct.defaultModel }],
        };
      }
    }

    // Match providers advertising this model explicitly, otherwise ready providers sorted by priority
    const ready = providers.filter((p) => this._isProviderReady(p));
    const exactMatches = ready.filter((p) => p.defaultModel === raw || p.models.includes(raw));
    if (exactMatches.length > 0) {
      return {
        comboId: null,
        targets: exactMatches.map((p) => ({ provider: p, model: raw })),
      };
    }

    return {
      comboId: null,
      targets: ready.map((p) => ({ provider: p, model: raw })),
    };
  }

  async _callProvider({ provider, model, reqBody }) {
    const start = Date.now();

    if (provider.kind === 'simulator') {
      if (reqBody.stream) {
        return {
          kind: 'simulator-stream',
          generator: streamSimulatorChunks(reqBody, model),
          latencyMs: Date.now() - start,
        };
      }
      return {
        kind: 'json',
        data: createSimulatorCompletion(reqBody, model),
        latencyMs: Date.now() - start,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const cleanBase = provider.baseUrl.replace(/\/+$/, '');
      if (provider.kind === 'anthropic') {
        const anthReq = openAIRequestToAnthropic(reqBody, model);
        const res = await this.fetchImpl(`${cleanBase}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(anthReq),
          signal: controller.signal,
        });
        const latencyMs = Date.now() - start;
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
          const err = new Error(`HTTP ${res.status}: ${text.slice(0, 240)}`);
          err.httpStatus = res.status;
          err.retryAfterMs = retryAfterMs;
          throw err;
        }
        if (reqBody.stream) {
          // Fallback for Anthropic streaming: read message & synthesize OpenAI SSE if needed,
          // or parse Anthropic SSE events. Here we emit clean OpenAI-compat SSE from parsed response
          // when upstream returns SSE or JSON.
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('text/event-stream') && res.body) {
            return { kind: 'anthropic-stream', response: res, model, latencyMs };
          }
          const json = await res.json();
          const openAI = anthropicResponseToOpenAI(json, model);
          return { kind: 'synthetic-stream', data: openAI, latencyMs };
        }
        const json = await res.json();
        return {
          kind: 'json',
          data: anthropicResponseToOpenAI(json, model),
          latencyMs,
        };
      }

      // OpenAI-compatible (cloud or local)
      const headers = { 'Content-Type': 'application/json' };
      if (provider.apiKey) {
        headers.Authorization = `Bearer ${provider.apiKey}`;
      } else if (provider.kind === 'local-openai') {
        headers.Authorization = 'Bearer local';
      }
      if (provider.id === 'openrouter') {
        headers['HTTP-Referer'] = 'https://github.com/Wynm/BATCH';
        headers['X-Title'] = 'BATCH AI Gateway';
      }

      const upstreamBody = {
        ...reqBody,
        model,
      };
      delete upstreamBody.cache;

      const res = await this.fetchImpl(`${cleanBase}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(upstreamBody),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
        const err = new Error(`HTTP ${res.status}: ${text.slice(0, 240)}`);
        err.httpStatus = res.status;
        err.retryAfterMs = retryAfterMs;
        throw err;
      }

      if (reqBody.stream) {
        return { kind: 'openai-stream', response: res, model, latencyMs };
      }

      const json = await res.json();
      return { kind: 'json', data: json, latencyMs };
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Upstream timeout after ${this.timeoutMs}ms`);
        timeoutErr.httpStatus = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async routeChatCompletion(reqBody, headers = {}) {
    const requestId = crypto.randomUUID().slice(0, 12);
    const requestedModel = reqBody.model || 'auto-free';
    const useCache = shouldUseCache(reqBody, headers);
    const cacheKey = useCache
      ? buildCacheKey({
          targetModel: requestedModel,
          messages: reqBody.messages,
          temperature: reqBody.temperature,
          max_tokens: reqBody.max_tokens,
          response_format: reqBody.response_format,
          tools: reqBody.tools,
        })
      : null;

    if (cacheKey) {
      const cached = this.store.getCachedResponse(cacheKey);
      if (cached) {
        this.store.logRequest({
          requestId,
          comboId: null,
          providerId: cached.providerId,
          model: cached.model,
          status: 'cached',
          httpStatus: 200,
          latencyMs: 1,
          promptTokens: cached.response?.usage?.prompt_tokens ?? 0,
          completionTokens: cached.response?.usage?.completion_tokens ?? 0,
          cacheHit: true,
        });
        return {
          ok: true,
          stream: false,
          data: cached.response,
          meta: {
            requestId,
            providerId: cached.providerId,
            model: cached.model,
            cacheHit: true,
            attempts: [{ providerId: cached.providerId, model: cached.model, status: 'cache-hit', latencyMs: 1 }],
          },
        };
      }
    }

    const { comboId, targets, disabledProvider } = this.resolveTargets(requestedModel);
    if (!targets.length) {
      const reason = disabledProvider
        ? `Provider "${disabledProvider}" is disabled or missing an API key.`
        : `No enabled/configured providers available for "${requestedModel}". Configure an API key, start Ollama, or enable Sandbox Simulator.`;
      return {
        ok: false,
        status: 503,
        error: reason,
        meta: { requestId, comboId, attempts: [] },
      };
    }

    const attempts = [];
    for (const { provider, model } of targets) {
      if (!this.circuitBreaker.canAttempt(provider.id)) {
        const status = this.circuitBreaker.getStatus(provider.id);
        attempts.push({
          providerId: provider.id,
          model,
          status: 'skipped-circuit-open',
          reason: `Cooldown ${Math.ceil(status.remainingCooldownMs / 1000)}s (${status.lastError || 'recent failures'})`,
        });
        continue;
      }

      const rate = this.rateLimiter.tryConsume(provider.id, provider.rpmLimit);
      if (!rate.allowed) {
        attempts.push({
          providerId: provider.id,
          model,
          status: 'skipped-rate-limit',
          reason: `Local RPM bucket throttled (~${Math.ceil(rate.retryAfterMs / 1000)}s)`,
        });
        continue;
      }

      const t0 = Date.now();
      try {
        const result = await this._callProvider({ provider, model, reqBody });
        this.circuitBreaker.recordSuccess(provider.id, result.latencyMs);
        attempts.push({
          providerId: provider.id,
          model,
          status: 'ok',
          latencyMs: result.latencyMs,
        });

        if (result.kind === 'json') {
          const usage = result.data?.usage || {};
          if (cacheKey) {
            this.store.setCachedResponse(cacheKey, model, provider.id, result.data, this.cacheTtlMs);
          }
          this.store.logRequest({
            requestId,
            comboId,
            providerId: provider.id,
            model,
            status: 'ok',
            httpStatus: 200,
            latencyMs: result.latencyMs,
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
            cacheHit: false,
          });
          return {
            ok: true,
            stream: false,
            data: result.data,
            meta: {
              requestId,
              comboId,
              providerId: provider.id,
              model,
              cacheHit: false,
              latencyMs: result.latencyMs,
              attempts,
            },
          };
        }

        // Streaming result
        this.store.logRequest({
          requestId,
          comboId,
          providerId: provider.id,
          model,
          status: 'ok',
          httpStatus: 200,
          latencyMs: result.latencyMs,
          cacheHit: false,
        });
        return {
          ok: true,
          stream: true,
          streamResult: result,
          meta: {
            requestId,
            comboId,
            providerId: provider.id,
            model,
            cacheHit: false,
            latencyMs: result.latencyMs,
            attempts,
          },
        };
      } catch (err) {
        const latencyMs = Date.now() - t0;
        const httpStatus = err.httpStatus ?? 502;
        this.circuitBreaker.recordFailure(provider.id, {
          httpStatus,
          message: err.message,
          retryAfterMs: err.retryAfterMs,
        });
        attempts.push({
          providerId: provider.id,
          model,
          status: 'error',
          httpStatus,
          latencyMs,
          reason: err.message,
        });
        this.store.logRequest({
          requestId,
          comboId,
          providerId: provider.id,
          model,
          status: 'error',
          httpStatus,
          latencyMs,
          cacheHit: false,
          errorMessage: err.message,
        });
      }
    }

    return {
      ok: false,
      status: 502,
      error: `All candidate providers failed or were throttled for "${requestedModel}".`,
      meta: { requestId, comboId, attempts },
    };
  }

  async testProvider(providerId) {
    const provider = this.store.getProvider(providerId, true);
    if (!provider) return { ok: false, error: 'Provider not found' };

    if (provider.kind === 'simulator') {
      return { ok: true, latencyMs: 1, models: provider.models, message: 'Sandbox simulator ready' };
    }
    if (provider.kind !== 'local-openai' && !provider.apiKey) {
      return { ok: false, error: 'No API key configured for this provider' };
    }

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const cleanBase = provider.baseUrl.replace(/\/+$/, '');
      if (provider.kind === 'anthropic') {
        const res = await this.fetchImpl(`${cleanBase}/models`, {
          headers: {
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
          },
          signal: controller.signal,
        });
        const latencyMs = Date.now() - start;
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          return { ok: false, httpStatus: res.status, latencyMs, error: txt.slice(0, 200) || `HTTP ${res.status}` };
        }
        const json = await res.json().catch(() => ({}));
        return {
          ok: true,
          httpStatus: res.status,
          latencyMs,
          discoveredModels: (json.data || []).map((m) => m.id).slice(0, 20),
        };
      }

      const headers = {};
      if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
      const res = await this.fetchImpl(`${cleanBase}/models`, { headers, signal: controller.signal });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return { ok: false, httpStatus: res.status, latencyMs, error: txt.slice(0, 200) || `HTTP ${res.status}` };
      }
      const json = await res.json().catch(() => ({}));
      const discovered = Array.isArray(json.data) ? json.data.map((m) => m.id).slice(0, 30) : [];
      return {
        ok: true,
        httpStatus: res.status,
        latencyMs,
        discoveredModels: discovered,
      };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message };
    } finally {
      clearTimeout(timer);
    }
  }
}
