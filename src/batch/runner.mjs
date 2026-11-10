import crypto from 'node:crypto';

export class BatchRunner {
  constructor(store, router, options = {}) {
    this.store = store;
    this.router = router;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 300;
    this.activeJobs = new Map(); // jobId -> { cancelled: boolean, promise: Promise }
  }

  submitJob({ name, comboOrModel = 'auto-free', concurrency = 2, items = [], systemPrompt = '' }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Batch job requires at least 1 item');
    }
    const cleanConcurrency = Math.max(1, Math.min(8, Number(concurrency) || 2));
    const normalizedItems = items.map((item, idx) => {
      if (typeof item === 'string') {
        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: item });
        return { customId: `item-${idx + 1}`, payload: { messages } };
      }
      const messages = Array.isArray(item.messages)
        ? item.messages
        : [
            ...(systemPrompt || item.system ? [{ role: 'system', content: item.system || systemPrompt }] : []),
            { role: 'user', content: String(item.prompt ?? item.input ?? '') },
          ];
      return {
        customId: item.customId || item.custom_id || `item-${idx + 1}`,
        payload: {
          messages,
          temperature: item.temperature,
          max_tokens: item.max_tokens,
        },
      };
    });

    const id = `batch_${crypto.randomUUID().slice(0, 10)}`;
    const job = this.store.createBatchJob({
      id,
      name: name || `Batch ${new Date().toISOString().slice(0, 19)}`,
      comboOrModel,
      concurrency: cleanConcurrency,
      items: normalizedItems,
    });

    const state = { cancelled: false, promise: null };
    state.promise = this._runJob(id, state).catch((err) => {
      this.store.updateBatchJobStatus(id, 'failed', Date.now());
      return { error: err.message };
    });
    this.activeJobs.set(id, state);
    return job;
  }

  async waitForJob(jobId) {
    const active = this.activeJobs.get(jobId);
    if (active?.promise) {
      await active.promise;
    }
    return this.store.getBatchJob(jobId);
  }

  cancelJob(jobId) {
    const active = this.activeJobs.get(jobId);
    if (active) {
      active.cancelled = true;
    }
    const job = this.store.getBatchJob(jobId);
    if (job && (job.status === 'queued' || job.status === 'running')) {
      this.store.updateBatchJobStatus(jobId, 'cancelled', Date.now());
    }
    return this.store.getBatchJob(jobId);
  }

  async _runJob(jobId, state) {
    this.store.updateBatchJobStatus(jobId, 'running');
    const job = this.store.getBatchJob(jobId);
    if (!job) return;

    const queue = [...job.items];
    let failedCount = 0;

    const worker = async () => {
      while (queue.length > 0 && !state.cancelled) {
        const item = queue.shift();
        if (!item) break;
        this.store.updateBatchItem(item.id, { status: 'running', errorMessage: null });

        let succeeded = false;
        let lastError = null;
        let attempts = 0;

        for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
          if (state.cancelled) break;
          attempts = attempt;
          const t0 = Date.now();
          const res = await this.router.routeChatCompletion({
            model: job.comboOrModel,
            messages: item.payload.messages,
            temperature: item.payload.temperature ?? 0.2,
            max_tokens: item.payload.max_tokens,
            stream: false,
          });

          if (res.ok) {
            const text = res.data?.choices?.[0]?.message?.content ?? '';
            this.store.updateBatchItem(item.id, {
              status: 'completed',
              providerId: res.meta.providerId,
              model: res.meta.model,
              responseText: text,
              errorMessage: null,
              attempts,
              latencyMs: res.meta.latencyMs ?? (Date.now() - t0),
            });
            succeeded = true;
            break;
          }

          lastError = res.error || 'Routing failed';
          if (attempt <= this.maxRetries) {
            await new Promise((r) => setTimeout(r, this.retryDelayMs * attempt));
          }
        }

        if (!succeeded && !state.cancelled) {
          failedCount += 1;
          this.store.updateBatchItem(item.id, {
            status: 'failed',
            errorMessage: lastError,
            attempts,
          });
        }
        this.store.updateBatchJobStatus(jobId, state.cancelled ? 'cancelled' : 'running');
      }
    };

    const workers = Array.from({ length: Math.min(job.concurrency, queue.length || 1) }, () => worker());
    await Promise.all(workers);

    if (state.cancelled) {
      this.store.updateBatchJobStatus(jobId, 'cancelled', Date.now());
    } else {
      const finalStatus = failedCount > 0 ? 'completed_with_errors' : 'completed';
      this.store.updateBatchJobStatus(jobId, finalStatus, Date.now());
    }
    this.activeJobs.delete(jobId);
  }

  exportJsonl(jobId) {
    const job = this.store.getBatchJob(jobId);
    if (!job) return null;
    return job.items
      .map((item) => JSON.stringify({
        custom_id: item.customId,
        status: item.status,
        provider_id: item.providerId,
        model: item.model,
        response: item.responseText,
        error: item.errorMessage,
        attempts: item.attempts,
        latency_ms: item.latencyMs,
      }))
      .join('\n');
  }
}
