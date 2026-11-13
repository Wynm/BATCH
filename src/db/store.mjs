import { DatabaseSync } from 'node:sqlite';
import { PROVIDERS_CATALOG, DEFAULT_COMBOS } from '../config/providersCatalog.mjs';
import { encryptSecret, decryptSecret, maskSecret } from '../security/vault.mjs';
import { SELF_CONTAINED_KINDS } from '../config/providerKinds.mjs';

export class Store {
  constructor(dbPath, masterKey, options = {}) {
    this.dbPath = dbPath;
    this.masterKey = masterKey;
    this.enableDemo = options.enableDemo ?? true;
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initSchema();
    this.seedDefaults();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        tier TEXT NOT NULL,
        base_url TEXT NOT NULL,
        default_model TEXT NOT NULL,
        models_json TEXT NOT NULL,
        encrypted_api_key TEXT,
        rpm_limit INTEGER NOT NULL DEFAULT 30,
        priority INTEGER NOT NULL DEFAULT 100,
        enabled INTEGER NOT NULL DEFAULT 0,
        notes TEXT DEFAULT '',
        docs_url TEXT DEFAULT '',
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS combos (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        strategy TEXT NOT NULL DEFAULT 'failover',
        description TEXT DEFAULT '',
        provider_ids_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS response_cache (
        cache_key TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        hits INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        combo_id TEXT,
        provider_id TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL,
        http_status INTEGER,
        latency_ms INTEGER NOT NULL,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        cache_hit INTEGER DEFAULT 0,
        error_message TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS batch_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        combo_or_model TEXT NOT NULL,
        status TEXT NOT NULL,
        concurrency INTEGER NOT NULL DEFAULT 2,
        total_items INTEGER NOT NULL,
        completed_items INTEGER NOT NULL DEFAULT 0,
        failed_items INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        finished_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS batch_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL REFERENCES batch_jobs(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        custom_id TEXT,
        prompt_json TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_id TEXT,
        model TEXT,
        response_text TEXT,
        error_message TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        latency_ms INTEGER,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bench_runs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        suite_ids_json TEXT NOT NULL,
        targets_json TEXT NOT NULL,
        status TEXT NOT NULL,
        total_cases INTEGER NOT NULL,
        passed_cases INTEGER NOT NULL,
        score REAL NOT NULL,
        duration_ms INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_batch_items_job ON batch_items(job_id, seq);
      CREATE INDEX IF NOT EXISTS idx_bench_runs_created ON bench_runs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_request_logs_created ON request_logs(created_at DESC);
    `);
  }

  seedDefaults() {
    const now = Date.now();
    const existingProviderStmt = this.db.prepare('SELECT id, encrypted_api_key FROM providers WHERE id = ?');
    const insertProviderStmt = this.db.prepare(`
      INSERT INTO providers (
        id, name, kind, tier, base_url, default_model, models_json,
        encrypted_api_key, rpm_limit, priority, enabled, notes, docs_url, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateEnvKeyStmt = this.db.prepare(`
      UPDATE providers SET encrypted_api_key = ?, enabled = 1, updated_at = ? WHERE id = ? AND encrypted_api_key IS NULL
    `);

    for (const p of PROVIDERS_CATALOG) {
      const envSecret = p.envKey ? process.env[p.envKey]?.trim() : null;
      const existing = existingProviderStmt.get(p.id);
      if (!existing) {
        const encrypted = envSecret ? encryptSecret(envSecret, this.masterKey) : null;
        // Self-contained engines (simulator, micro reflex engine) need no key;
        // they are gated by the demo switch instead.
        const enabled = SELF_CONTAINED_KINDS.has(p.kind)
          ? (this.enableDemo ? 1 : 0)
          : (envSecret ? 1 : 0);
        insertProviderStmt.run(
          p.id,
          p.name,
          p.kind,
          p.tier,
          p.baseUrl,
          p.defaultModel,
          JSON.stringify(p.models),
          encrypted,
          p.rpmLimit,
          p.priority,
          enabled,
          p.notes || '',
          p.docsUrl || '',
          now,
        );
      } else if (envSecret && !existing.encrypted_api_key) {
        updateEnvKeyStmt.run(encryptSecret(envSecret, this.masterKey), now, p.id);
      }
    }

    const existingComboStmt = this.db.prepare('SELECT id FROM combos WHERE id = ?');
    const insertComboStmt = this.db.prepare(`
      INSERT INTO combos (id, name, strategy, description, provider_ids_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const c of DEFAULT_COMBOS) {
      if (!existingComboStmt.get(c.id)) {
        insertComboStmt.run(
          c.id,
          c.name,
          c.strategy,
          c.description,
          JSON.stringify(c.providerIds),
          now,
        );
      }
    }
  }

  _hydrateProvider(row, includeSecret = false) {
    if (!row) return null;
    let rawKey = null;
    let keyError = null;
    if (row.encrypted_api_key) {
      try {
        rawKey = decryptSecret(row.encrypted_api_key, this.masterKey);
      } catch (err) {
        // A rotated/lost master key used to crash the whole provider list.
        // Fail per-provider and surface it instead of taking the gateway down.
        keyError = err.message;
      }
    }
    const result = {
      id: row.id,
      name: row.name,
      kind: row.kind,
      tier: row.tier,
      baseUrl: row.base_url,
      defaultModel: row.default_model,
      models: JSON.parse(row.models_json || '[]'),
      hasApiKey: Boolean(rawKey),
      maskedApiKey: rawKey ? maskSecret(rawKey) : '',
      rpmLimit: row.rpm_limit,
      priority: row.priority,
      enabled: Boolean(row.enabled),
      notes: row.notes || '',
      docsUrl: row.docs_url || '',
      updatedAt: row.updated_at,
      keyError,
    };
    if (includeSecret) {
      result.apiKey = rawKey;
    }
    return result;
  }

  listProviders(includeSecrets = false) {
    const rows = this.db.prepare('SELECT * FROM providers ORDER BY priority ASC, id ASC').all();
    return rows.map((r) => this._hydrateProvider(r, includeSecrets));
  }

  getProvider(id, includeSecret = false) {
    const row = this.db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
    return this._hydrateProvider(row, includeSecret);
  }

  upsertProvider(input) {
    const now = Date.now();
    const existing = this.db.prepare('SELECT * FROM providers WHERE id = ?').get(input.id);

    let encryptedKey = existing ? existing.encrypted_api_key : null;
    if (input.clearApiKey) {
      encryptedKey = null;
    } else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
      encryptedKey = encryptSecret(input.apiKey.trim(), this.masterKey);
    }

    const name = input.name ?? existing?.name ?? input.id;
    const kind = input.kind ?? existing?.kind ?? 'openai-compatible';
    const tier = input.tier ?? existing?.tier ?? 'custom';
    const baseUrl = input.baseUrl ?? existing?.base_url ?? '';
    const defaultModel = input.defaultModel ?? existing?.default_model ?? 'default';
    const models = Array.isArray(input.models)
      ? input.models
      : existing
        ? JSON.parse(existing.models_json || '[]')
        : [defaultModel];
    const rpmLimit = Number(input.rpmLimit ?? existing?.rpm_limit ?? 30);
    const priority = Number(input.priority ?? existing?.priority ?? 100);
    const enabled = input.enabled !== undefined ? (input.enabled ? 1 : 0) : (existing ? existing.enabled : 1);
    const notes = input.notes ?? existing?.notes ?? '';
    const docsUrl = input.docsUrl ?? existing?.docs_url ?? '';

    if (existing) {
      this.db.prepare(`
        UPDATE providers SET
          name = ?, kind = ?, tier = ?, base_url = ?, default_model = ?, models_json = ?,
          encrypted_api_key = ?, rpm_limit = ?, priority = ?, enabled = ?, notes = ?, docs_url = ?, updated_at = ?
        WHERE id = ?
      `).run(
        name, kind, tier, baseUrl, defaultModel, JSON.stringify(models),
        encryptedKey, rpmLimit, priority, enabled, notes, docsUrl, now, input.id,
      );
    } else {
      this.db.prepare(`
        INSERT INTO providers (
          id, name, kind, tier, base_url, default_model, models_json,
          encrypted_api_key, rpm_limit, priority, enabled, notes, docs_url, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.id, name, kind, tier, baseUrl, defaultModel, JSON.stringify(models),
        encryptedKey, rpmLimit, priority, enabled, notes, docsUrl, now,
      );
    }
    return this.getProvider(input.id, false);
  }

  deleteProvider(id) {
    const info = this.db.prepare('DELETE FROM providers WHERE id = ?').run(id);
    return info.changes > 0;
  }

  listCombos() {
    const rows = this.db.prepare('SELECT * FROM combos ORDER BY id ASC').all();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      strategy: r.strategy,
      description: r.description || '',
      providerIds: JSON.parse(r.provider_ids_json || '[]'),
      updatedAt: r.updated_at,
    }));
  }

  getCombo(id) {
    const row = this.db.prepare('SELECT * FROM combos WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      strategy: row.strategy,
      description: row.description || '',
      providerIds: JSON.parse(row.provider_ids_json || '[]'),
      updatedAt: row.updated_at,
    };
  }

  upsertCombo(input) {
    const now = Date.now();
    const existing = this.getCombo(input.id);
    const name = input.name ?? existing?.name ?? input.id;
    const strategy = input.strategy ?? existing?.strategy ?? 'failover';
    const description = input.description ?? existing?.description ?? '';
    const providerIds = Array.isArray(input.providerIds) ? input.providerIds : (existing?.providerIds ?? []);

    if (existing) {
      this.db.prepare(`
        UPDATE combos SET name = ?, strategy = ?, description = ?, provider_ids_json = ?, updated_at = ?
        WHERE id = ?
      `).run(name, strategy, description, JSON.stringify(providerIds), now, input.id);
    } else {
      this.db.prepare(`
        INSERT INTO combos (id, name, strategy, description, provider_ids_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(input.id, name, strategy, description, JSON.stringify(providerIds), now);
    }
    return this.getCombo(input.id);
  }

  getCachedResponse(cacheKey) {
    const now = Date.now();
    const row = this.db.prepare('SELECT * FROM response_cache WHERE cache_key = ?').get(cacheKey);
    if (!row) return null;
    if (row.expires_at <= now) {
      this.db.prepare('DELETE FROM response_cache WHERE cache_key = ?').run(cacheKey);
      return null;
    }
    this.db.prepare('UPDATE response_cache SET hits = hits + 1 WHERE cache_key = ?').run(cacheKey);
    return {
      providerId: row.provider_id,
      model: row.model,
      response: JSON.parse(row.response_json),
      hits: row.hits + 1,
    };
  }

  setCachedResponse(cacheKey, model, providerId, responseObj, ttlMs = 3600_000) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO response_cache (cache_key, model, provider_id, response_json, created_at, expires_at, hits)
      VALUES (?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(cache_key) DO UPDATE SET
        model = excluded.model,
        provider_id = excluded.provider_id,
        response_json = excluded.response_json,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
    `).run(cacheKey, model, providerId, JSON.stringify(responseObj), now, now + ttlMs);
  }

  clearCache() {
    const info = this.db.prepare('DELETE FROM response_cache').run();
    return info.changes;
  }

  logRequest(entry) {
    this.db.prepare(`
      INSERT INTO request_logs (
        request_id, combo_id, provider_id, model, status, http_status,
        latency_ms, prompt_tokens, completion_tokens, cache_hit, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.requestId,
      entry.comboId ?? null,
      entry.providerId,
      entry.model,
      entry.status,
      entry.httpStatus ?? null,
      entry.latencyMs ?? 0,
      entry.promptTokens ?? 0,
      entry.completionTokens ?? 0,
      entry.cacheHit ? 1 : 0,
      entry.errorMessage ?? null,
      entry.createdAt ?? Date.now(),
    );
  }

  listLogs(limit = 50) {
    return this.db.prepare('SELECT * FROM request_logs ORDER BY id DESC LIMIT ?').all(limit);
  }

  getMetrics() {
    const summary = this.db.prepare(`
      SELECT
        COUNT(*) as totalRequests,
        SUM(CASE WHEN status = 'ok' OR status = 'cached' THEN 1 ELSE 0 END) as successRequests,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failedRequests,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cacheHits,
        COALESCE(SUM(prompt_tokens), 0) as totalPromptTokens,
        COALESCE(SUM(completion_tokens), 0) as totalCompletionTokens,
        COALESCE(ROUND(AVG(latency_ms)), 0) as avgLatencyMs
      FROM request_logs
    `).get();

    const byProvider = this.db.prepare(`
      SELECT
        provider_id as providerId,
        COUNT(*) as requests,
        SUM(CASE WHEN status != 'error' THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
        COALESCE(ROUND(AVG(latency_ms)), 0) as avgLatencyMs
      FROM request_logs
      GROUP BY provider_id
      ORDER BY requests DESC
    `).all();

    const cacheStats = this.db.prepare('SELECT COUNT(*) as entries, COALESCE(SUM(hits), 0) as totalHits FROM response_cache').get();
    return { summary, byProvider, cacheStats };
  }

  createBatchJob({ id, name, comboOrModel, concurrency, items }) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO batch_jobs (id, name, combo_or_model, status, concurrency, total_items, completed_items, failed_items, created_at)
      VALUES (?, ?, ?, 'queued', ?, ?, 0, 0, ?)
    `).run(id, name, comboOrModel, concurrency, items.length, now);

    const insertItem = this.db.prepare(`
      INSERT INTO batch_items (job_id, seq, custom_id, prompt_json, status, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `);

    items.forEach((item, index) => {
      insertItem.run(
        id,
        index,
        item.customId ?? `item-${index + 1}`,
        JSON.stringify(item.payload),
        now,
      );
    });

    return this.getBatchJob(id);
  }

  getBatchJob(id) {
    const job = this.db.prepare('SELECT * FROM batch_jobs WHERE id = ?').get(id);
    if (!job) return null;
    const items = this.db.prepare('SELECT * FROM batch_items WHERE job_id = ? ORDER BY seq ASC').all(id)
      .map((item) => ({
        id: item.id,
        seq: item.seq,
        customId: item.custom_id,
        payload: JSON.parse(item.prompt_json),
        status: item.status,
        providerId: item.provider_id,
        model: item.model,
        responseText: item.response_text,
        errorMessage: item.error_message,
        attempts: item.attempts,
        latencyMs: item.latency_ms,
        updatedAt: item.updated_at,
      }));
    return {
      id: job.id,
      name: job.name,
      comboOrModel: job.combo_or_model,
      status: job.status,
      concurrency: job.concurrency,
      totalItems: job.total_items,
      completedItems: job.completed_items,
      failedItems: job.failed_items,
      createdAt: job.created_at,
      finishedAt: job.finished_at,
      items,
    };
  }

  listBatchJobs(limit = 25) {
    return this.db.prepare('SELECT * FROM batch_jobs ORDER BY created_at DESC LIMIT ?').all(limit).map((job) => ({
      id: job.id,
      name: job.name,
      comboOrModel: job.combo_or_model,
      status: job.status,
      concurrency: job.concurrency,
      totalItems: job.total_items,
      completedItems: job.completed_items,
      failedItems: job.failed_items,
      createdAt: job.created_at,
      finishedAt: job.finished_at,
    }));
  }

  updateBatchJobStatus(id, status, finishedAt = null) {
    const counts = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM batch_items WHERE job_id = ?
    `).get(id);

    this.db.prepare(`
      UPDATE batch_jobs SET status = ?, completed_items = ?, failed_items = ?, finished_at = COALESCE(?, finished_at)
      WHERE id = ?
    `).run(status, counts?.completed ?? 0, counts?.failed ?? 0, finishedAt, id);
  }

  updateBatchItem(itemId, fields) {
    const now = Date.now();
    this.db.prepare(`
      UPDATE batch_items SET
        status = COALESCE(?, status),
        provider_id = COALESCE(?, provider_id),
        model = COALESCE(?, model),
        response_text = COALESCE(?, response_text),
        error_message = ?,
        attempts = COALESCE(?, attempts),
        latency_ms = COALESCE(?, latency_ms),
        updated_at = ?
      WHERE id = ?
    `).run(
      fields.status ?? null,
      fields.providerId ?? null,
      fields.model ?? null,
      fields.responseText ?? null,
      fields.errorMessage !== undefined ? fields.errorMessage : null,
      fields.attempts ?? null,
      fields.latencyMs ?? null,
      now,
      itemId,
    );
  }

  saveBenchRun(run) {
    this.db.prepare(`
      INSERT INTO bench_runs (
        id, name, suite_ids_json, targets_json, status, total_cases,
        passed_cases, score, duration_ms, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id,
      run.name,
      JSON.stringify(run.suiteIds),
      JSON.stringify(run.targets),
      run.status,
      run.summary?.cases ?? run.results.length,
      run.summary?.passed ?? 0,
      run.summary?.score ?? 0,
      run.durationMs,
      run.createdAt,
      JSON.stringify(run),
    );
    return run.id;
  }

  listBenchRuns(limit = 20) {
    return this.db.prepare(`
      SELECT id, name, suite_ids_json, targets_json, status, total_cases,
             passed_cases, score, duration_ms, created_at
      FROM bench_runs ORDER BY created_at DESC LIMIT ?
    `).all(limit).map((row) => ({
      id: row.id,
      name: row.name,
      suiteIds: JSON.parse(row.suite_ids_json),
      targets: JSON.parse(row.targets_json),
      status: row.status,
      totalCases: row.total_cases,
      passedCases: row.passed_cases,
      passRate: row.total_cases ? row.passed_cases / row.total_cases : 0,
      score: row.score,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
    }));
  }

  getBenchRun(id) {
    const row = this.db.prepare('SELECT payload_json FROM bench_runs WHERE id = ?').get(id);
    if (!row) return null;
    try { return JSON.parse(row.payload_json); } catch { return null; }
  }

  close() {
    this.db.close();
  }
}
