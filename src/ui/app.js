const I18N = {
  en: {
    subtitle: 'Unified AI Gateway · Smart Failover · Batch Engine · Craft Inspector · MCP',
    refresh: 'Refresh',
    tabPlayground: 'Playground & Overview',
    tabProviders: 'Providers & Vault',
    tabCombos: 'Combos & Routing',
    tabBatches: 'Batch Runner',
    tabCraft: 'Craft, MCP & Deploy',
    mTotal: 'Total Requests',
    mReady: 'Ready Providers',
    mCache: 'Cache Hit Rate',
    mLatency: 'Avg Latency',
    playgroundTitle: 'Interactive Router Playground',
    targetCombo: 'Combo or Provider/Model',
    temperature: 'Temperature',
    systemPrompt: 'System Prompt (optional)',
    userPrompt: 'User Prompt',
    bypassCache: 'Bypass Cache',
    sendPrompt: 'Route Request',
    failoverTrace: 'Failover & Routing Trace',
    recentLogs: 'Recent Gateway Logs',
    clearCache: 'Clear Cache',
    providersTitle: 'Provider Registry & AES-256-GCM Key Vault',
    providersDesc: 'Configure official API keys (encrypted at rest) or enable local unlimited engines like Ollama. Single official key per provider; respects rate limits cleanly.',
    addCustomProvider: 'Add / Update Custom OpenAI-Compatible Provider',
    saveProvider: 'Save Provider',
    combosTitle: 'Routing Combos (Fallback Chains)',
    saveComboTitle: 'Create / Update Routing Combo',
    saveCombo: 'Save Combo',
    submitBatchTitle: 'Submit Batch Job',
    batchPromptsLabel: 'Prompts (one per line, or JSONL objects with {"custom_id","prompt"})',
    launchBatch: 'Launch Batch Job',
    batchJobsTitle: 'Batch Jobs & Outputs',
    craftInspectorTitle: 'Craft Clean-Room Workspace Inspector',
    inspectBtn: 'Inspect Workspace',
    agentBridgeTitle: 'Agent & IDE Integration Snippets',
    deployTitle: 'CI/CD Batch Pipelines & Self-Hosted Docker + Neko Workspace',
    tabProof: 'Proof Lab & Bench',
    proofTitle: 'Failover Proof Lab',
    proofDesc: 'Runs the real router — circuit breaker, token bucket, cache, timeout — against scripted upstreams (429, revoked key, hung socket, total outage) and asserts on what actually happened. No mocks at the routing layer.',
    runProof: 'Run proof suite',
    proofIdle: 'Not run yet. 8 scenarios · 34 assertions.',
    benchTitle: 'Model Bench (deterministic grading)',
    benchDesc: 'Mechanically graded suites — arithmetic, unit conversion, ordering, JSON extraction, Arabic commands. No LLM judge: an echoing provider scores zero, and that is the point.',
    benchSuites: 'Suites',
    benchTargets: 'Targets (combos or provider/model)',
    benchHint: 'Tip: compare offline-proof (deterministic engine) with sandbox-sim (echo) to see the grader discriminate.',
    runBench: 'Run bench',
    benchHistory: 'Recent bench runs',
  },
  ar: {
    subtitle: 'بوابة ذكاء اصطناعي موحدة · تبديل تلقائي ذكي · محرك دفعات · فاحص مشاريع · خادم MCP',
    refresh: 'تحديث',
    tabPlayground: 'ساحة التجربة والملخص',
    tabProviders: 'المزودون وخزنة المفاتيح',
    tabCombos: 'سلاسل التوجيه والبدائل',
    tabBatches: 'منفذ الدفعات (Batch)',
    tabCraft: 'فحص الكود و MCP والنشر',
    mTotal: 'إجمالي الطلبات',
    mReady: 'المزودون الجاهزون',
    mCache: 'نسبة الكاش',
    mLatency: 'متوسط الاستجابة',
    playgroundTitle: 'مختبر التوجيه التفاعلي',
    targetCombo: 'السلسلة أو المزود/النموذج',
    temperature: 'الحرارة (Temperature)',
    systemPrompt: 'تعليمات النظام (اختياري)',
    userPrompt: 'نص الطلب',
    bypassCache: 'تجاوز الكاش',
    sendPrompt: 'إرسال عبر البوابة',
    failoverTrace: 'تتبع التوجيه والتبديل التلقائي',
    recentLogs: 'سجل الطلبات الأخير',
    clearCache: 'مسح الكاش',
    providersTitle: 'سجل المزودين وخزنة المفاتيح المشفرة (AES-256-GCM)',
    providersDesc: 'أضف مفاتيحك الرسمية (تُحفظ مشفرة محلياً) أو فعّل نماذج محلية مثل Ollama للاستخدام المفتوح. مفتاح رسمي واحد لكل مزود مع احترام حدود الاستخدام.',
    addCustomProvider: 'إضافة / تعديل مزود OpenAI مخصص',
    saveProvider: 'حفظ المزود',
    combosTitle: 'سلاسل التوجيه التلقائي (Combos)',
    saveComboTitle: 'إنشاء / تعديل سلسلة توجيه',
    saveCombo: 'حفظ السلسلة',
    submitBatchTitle: 'إطلاق مهمة دفعات (Batch)',
    batchPromptsLabel: 'الطلبات (سطر لكل طلب أو بصيغة JSONL)',
    launchBatch: 'تشغيل الدفعة',
    batchJobsTitle: 'مهام الدفعات والنتائج',
    craftInspectorTitle: 'فاحص بنية المشروع النظيف (Craft Inspector)',
    inspectBtn: 'فحص مساحة العمل',
    agentBridgeTitle: 'إعدادات ربط الوكلاء والمحررات',
    deployTitle: 'قوالب CI/CD وحاوية Docker + Ollama + Neko للاستضافة الذاتية',
    tabProof: 'مختبر الإثبات والقياس',
    proofTitle: 'مختبر إثبات التبديل التلقائي',
    proofDesc: 'يشغّل الموجّه الحقيقي — قاطع الدارة، دلو الرموز، الكاش، والمهلة — أمام مزوّدين مُحاكين (429، مفتاح ملغى، اتصال معلّق، انقطاع كامل) ويتحقق مما حدث فعلاً. لا محاكاة على مستوى التوجيه.',
    runProof: 'تشغيل حزمة الإثبات',
    proofIdle: 'لم يُشغَّل بعد. ٨ سيناريوهات · ٣٤ تحققاً.',
    benchTitle: 'مقياس النماذج (تصحيح حتمي)',
    benchDesc: 'حزم تُصحَّح آلياً — حساب، تحويل وحدات، ترتيب، استخراج JSON، وأوامر عربية. لا حَكَم من نموذج لغوي: المزوّد الذي يردّد النص يحصل على صفر، وهذا هو المقصود.',
    benchSuites: 'الحزم',
    benchTargets: 'الأهداف (سلاسل أو مزود/نموذج)',
    benchHint: 'جرّب مقارنة offline-proof (المحرك الحتمي) مع sandbox-sim (الصدى) لترى التصحيح يفرّق بينهما.',
    runBench: 'تشغيل القياس',
    benchHistory: 'أحدث عمليات القياس',
  },
};

let currentLang = 'en';
let overviewData = null;

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3200);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(json?.error?.message || json?.error || `HTTP ${res.status}`);
  return json;
}

function applyLang() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  const dict = I18N[currentLang];
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n');
    if (dict[k]) el.textContent = dict[k];
  });
}

function renderOverview(data) {
  overviewData = data;
  const { summary, cacheStats } = data.metrics;
  const total = summary.totalRequests || 0;
  const cacheRate = total > 0 ? Math.round(((summary.cacheHits || 0) / total) * 100) : 0;
  const readyCount = data.providers.filter((p) => p.ready).length;

  document.getElementById('m-total').textContent = String(total);
  document.getElementById('m-ready').textContent = `${readyCount} / ${data.providers.length}`;
  document.getElementById('m-cache').textContent = `${cacheRate}% (${cacheStats.entries || 0})`;
  document.getElementById('m-latency').textContent = `${summary.avgLatencyMs || 0} ms`;

  // Populate model selects
  const modelOptions = [
    ...data.combos.map((c) => `<option value="${esc(c.id)}">combo: ${esc(c.id)} — ${esc(c.name)}</option>`),
    ...data.providers
      .filter((p) => p.enabled)
      .map((p) => `<option value="${esc(p.id)}/${esc(p.defaultModel)}">${esc(p.id)}/${esc(p.defaultModel)}</option>`),
  ].join('');
  document.getElementById('pg-model').innerHTML = modelOptions;
  document.getElementById('batch-model').innerHTML = modelOptions;
  const pgSelect = document.getElementById('pg-model');
  if ([...pgSelect.options].some((o) => o.value === 'offline-proof') && !pgSelect.dataset.touched) {
    pgSelect.value = 'offline-proof';
  }
  pgSelect.onchange = () => { pgSelect.dataset.touched = '1'; };
  renderBenchChoosers(data);
  renderBenchHistory(data.benchRuns || []);

  // Render logs
  const logsHtml = (data.recentLogs || []).slice(0, 18).map((l) => {
    const badgeCls = l.status === 'ok' ? 'badge-ok' : l.status === 'cached' ? 'badge-accent' : 'badge-err';
    return `<tr>
      <td>${esc(l.provider_id)}</td>
      <td>${esc(l.model)}</td>
      <td><span class="badge ${badgeCls}">${esc(l.status)}</span></td>
      <td>${esc(l.latency_ms)} ms</td>
    </tr>`;
  }).join('');
  document.getElementById('logs-tbody').innerHTML = logsHtml || '<tr><td colspan="4" class="muted">No requests yet</td></tr>';

  // Render providers
  const providersHtml = data.providers.map((p) => {
    const cb = p.circuitBreaker;
    const cbState = cb?.effectiveState || 'closed';
    const cbBadge = cbState === 'closed' ? 'badge-ok' : cbState === 'half-open' ? 'badge-warn' : 'badge-err';
    const ready = Boolean(p.ready);
    const tierBadge = p.tier === 'local-unlimited' ? 'badge-ok' : p.tier === 'demo' ? 'badge-warn' : 'badge-accent';

    return `<div class="provider-card" data-pid="${esc(p.id)}">
      <div class="provider-top">
        <div>
          <h3>${esc(p.name)}</h3>
          <p class="muted">${esc(p.id)} · ${esc(p.baseUrl)}</p>
        </div>
        <span class="badge ${tierBadge}">${esc(p.tier)}</span>
      </div>
      <div class="result-meta">
        <span class="badge ${ready ? 'badge-ok' : 'badge-err'}">${ready ? 'Ready' : (p.enabled ? 'Needs Key' : 'Disabled')}</span>
        <span class="badge ${cbBadge}">Breaker: ${esc(cbState)}</span>
        <span class="badge">RPM: ${esc(p.rpmLimit)}</span>
        <span class="badge">Prio: ${esc(p.priority)}</span>
      </div>
      <p class="muted">${esc(p.notes)}</p>
      <div class="stack">
        <label><span>Default Model</span>
          <input class="p-model" value="${esc(p.defaultModel)}" />
        </label>
        ${p.kind !== 'simulator' ? `<label><span>API Key (${p.hasApiKey ? esc(p.maskedApiKey) : 'not set'})</span>
          <input class="p-key" type="password" placeholder="${p.hasApiKey ? 'Leave blank to keep existing key' : 'Paste official API key'}" />
        </label>` : ''}
        <div class="row-between">
          <label class="checkbox-inline">
            <input class="p-enabled" type="checkbox" ${p.enabled ? 'checked' : ''} />
            <span>Enabled</span>
          </label>
          <div class="row-inline">
            <button class="btn btn-secondary btn-sm btn-test" type="button">Test</button>
            ${cbState !== 'closed' ? '<button class="btn btn-ghost btn-sm btn-reset" type="button">Reset</button>' : ''}
            <button class="btn btn-primary btn-sm btn-save" type="button">Save</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('providers-list').innerHTML = providersHtml;

  // Render combos
  const combosHtml = data.combos.map((c) => `
    <div class="provider-card">
      <div class="provider-top">
        <div>
          <h3>${esc(c.name)} (<code>${esc(c.id)}</code>)</h3>
          <p class="muted">${esc(c.description)}</p>
        </div>
        <span class="badge badge-accent">${esc(c.strategy)}</span>
      </div>
      <div>${c.providerIds.map((id) => `<span class="badge" style="margin-right:4px;">${esc(id)}</span>`).join('')}</div>
    </div>
  `).join('');
  document.getElementById('combos-list').innerHTML = combosHtml;

  // Render batches
  renderBatchList(data.batches || []);

  // Render client configs
  const cfgEntries = [
    ['OpenAI Python SDK', data.clientConfigs.openaiSdkPython],
    ['Claude Code (/v1/messages)', data.clientConfigs.claudeCodeEnv],
    ['OpenCode / Antigravity-Compatible JSON', data.clientConfigs.opencodeJson],
    ['Continue.dev YAML', data.clientConfigs.continueYaml],
    ['MCP stdio Server Config', data.clientConfigs.mcpConfig],
  ];
  document.getElementById('client-configs').innerHTML = cfgEntries.map(([title, body]) => `
    <details>
      <summary style="cursor:pointer;font-weight:600;font-size:13px;">${esc(title)}</summary>
      <pre class="code-output small" style="margin-top:8px;">${esc(body)}</pre>
    </details>
  `).join('');
}

function renderBatchList(batches) {
  const html = batches.map((b) => {
    const cls = b.status === 'completed' ? 'badge-ok' : b.status === 'running' ? 'badge-warn' : b.status === 'cancelled' ? 'badge-err' : 'badge-accent';
    return `<div class="provider-card">
      <div class="provider-top">
        <div>
          <h3>${esc(b.name)}</h3>
          <p class="muted">${esc(b.id)} · ${esc(b.comboOrModel)}</p>
        </div>
        <span class="badge ${cls}">${esc(b.status)}</span>
      </div>
      <div class="row-between">
        <span class="muted">${b.completedItems}/${b.totalItems} completed (${b.failedItems} failed)</span>
        <div class="row-inline">
          <button class="btn btn-secondary btn-sm" onclick="window.__viewBatch('${esc(b.id)}')">Inspect</button>
          <a class="btn btn-ghost btn-sm" href="/api/batches/${esc(b.id)}/export" style="text-decoration:none;">JSONL</a>
        </div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('batches-list').innerHTML = html || '<p class="muted">No batch jobs submitted yet.</p>';
}

window.__viewBatch = async (id) => {
  try {
    const { job } = await api(`/api/batches/${encodeURIComponent(id)}`);
    const box = document.getElementById('batch-detail');
    box.classList.remove('hidden');
    const itemsHtml = job.items.map((it) => `
      <div style="padding:8px;border-bottom:1px solid var(--border);">
        <div class="row-between">
          <strong>${esc(it.customId)}</strong>
          <span class="badge ${it.status === 'completed' ? 'badge-ok' : 'badge-err'}">${esc(it.status)} · ${esc(it.providerId || '-')} (${it.latencyMs ?? 0}ms)</span>
        </div>
        <pre class="code-output small" style="margin-top:6px;">${esc(it.responseText || it.errorMessage || '')}</pre>
      </div>
    `).join('');
    box.innerHTML = `<div class="row-between" style="margin-bottom:8px;">
      <strong>${esc(job.name)} (${esc(job.status)})</strong>
      ${job.status === 'running' ? `<button class="btn btn-danger btn-sm" onclick="window.__cancelBatch('${esc(job.id)}')">Cancel</button>` : ''}
    </div>${itemsHtml}`;
  } catch (err) {
    toast(err.message);
  }
};

window.__cancelBatch = async (id) => {
  try {
    await api(`/api/batches/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' });
    toast('Batch cancelled');
    await loadOverview();
    await window.__viewBatch(id);
  } catch (err) {
    toast(err.message);
  }
};

async function loadOverview() {
  try {
    const data = await api('/api/overview');
    renderOverview(data);
  } catch (err) {
    toast(`Load failed: ${err.message}`);
  }
}

// Event Wiring
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
  });
});

document.getElementById('lang-toggle').addEventListener('click', () => {
  currentLang = currentLang === 'en' ? 'ar' : 'en';
  applyLang();
});

document.getElementById('refresh-btn').addEventListener('click', loadOverview);

document.getElementById('clear-cache-btn').addEventListener('click', async () => {
  const res = await api('/api/cache/clear', { method: 'POST', body: '{}' });
  toast(`Cleared ${res.cleared} cached responses`);
  loadOverview();
});

document.getElementById('playground-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('pg-send');
  btn.disabled = true;
  try {
    const payload = {
      model: document.getElementById('pg-model').value,
      temperature: Number(document.getElementById('pg-temp').value),
      system: document.getElementById('pg-system').value,
      prompt: document.getElementById('pg-prompt').value || 'CALC: 37 * 43 + 11',
      bypassCache: document.getElementById('pg-bypass-cache').checked,
    };
    const res = await api('/api/playground', { method: 'POST', body: JSON.stringify(payload) });
    document.getElementById('pg-result').classList.remove('hidden');
    document.getElementById('pg-meta').innerHTML = `
      <span class="badge badge-ok">Provider: ${esc(res.meta.providerId)}</span>
      <span class="badge badge-accent">Model: ${esc(res.meta.model)}</span>
      <span class="badge ${res.meta.cacheHit ? 'badge-warn' : ''}">Cache: ${res.meta.cacheHit ? 'HIT' : 'MISS'}</span>
      <span class="badge">Latency: ${esc(res.meta.latencyMs ?? 1)} ms</span>
    `;
    document.getElementById('pg-output').textContent = res.content;
    document.getElementById('pg-trace').textContent = JSON.stringify(res.meta.attempts, null, 2);
    loadOverview();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('providers-list').addEventListener('click', async (e) => {
  const card = e.target.closest('.provider-card');
  if (!card) return;
  const pid = card.dataset.pid;

  if (e.target.classList.contains('btn-save')) {
    const defaultModel = card.querySelector('.p-model')?.value?.trim();
    const apiKey = card.querySelector('.p-key')?.value?.trim();
    const enabled = card.querySelector('.p-enabled')?.checked;
    try {
      await api('/api/providers', {
        method: 'POST',
        body: JSON.stringify({
          id: pid,
          defaultModel,
          enabled,
          ...(apiKey ? { apiKey } : {}),
        }),
      });
      toast(`Saved provider ${pid}`);
      loadOverview();
    } catch (err) {
      toast(err.message);
    }
  } else if (e.target.classList.contains('btn-test')) {
    try {
      const res = await api(`/api/providers/${encodeURIComponent(pid)}/test`, { method: 'POST', body: '{}' });
      toast(res.ok ? `${pid} OK (${res.latencyMs}ms)` : `${pid} Error: ${res.error}`);
    } catch (err) {
      toast(err.message);
    }
  } else if (e.target.classList.contains('btn-reset')) {
    await api(`/api/providers/${encodeURIComponent(pid)}/reset-breaker`, { method: 'POST', body: '{}' });
    toast(`Circuit breaker reset for ${pid}`);
    loadOverview();
  }
});

document.getElementById('custom-provider-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  body.rpmLimit = Number(body.rpmLimit || 60);
  body.priority = Number(body.priority || 85);
  body.enabled = true;
  try {
    await api('/api/providers', { method: 'POST', body: JSON.stringify(body) });
    toast(`Saved custom provider ${body.id}`);
    e.target.reset();
    loadOverview();
  } catch (err) {
    toast(err.message);
  }
});

document.getElementById('combo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    id: document.getElementById('combo-id').value.trim(),
    name: document.getElementById('combo-name').value.trim(),
    strategy: document.getElementById('combo-strategy').value,
    providerIds: document.getElementById('combo-providers').value.split(',').map((s) => s.trim()).filter(Boolean),
    description: document.getElementById('combo-desc').value.trim(),
  };
  try {
    await api('/api/combos', { method: 'POST', body: JSON.stringify(body) });
    toast(`Saved combo ${body.id}`);
    loadOverview();
  } catch (err) {
    toast(err.message);
  }
});

document.getElementById('batch-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const lines = document.getElementById('batch-items').value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items = lines.map((line, i) => {
    if (line.startsWith('{')) {
      try {
        const obj = JSON.parse(line);
        return { customId: obj.custom_id || obj.id || `item-${i + 1}`, prompt: obj.prompt || obj.input || '' };
      } catch {
        return { customId: `item-${i + 1}`, prompt: line };
      }
    }
    return { customId: `item-${i + 1}`, prompt: line };
  });

  try {
    const { job } = await api('/api/batches', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('batch-name').value.trim(),
        comboOrModel: document.getElementById('batch-model').value,
        concurrency: Number(document.getElementById('batch-concurrency').value),
        systemPrompt: document.getElementById('batch-system').value,
        items,
      }),
    });
    toast(`Submitted ${job.id}`);
    setTimeout(async () => {
      await loadOverview();
      await window.__viewBatch(job.id);
    }, 600);
  } catch (err) {
    toast(err.message);
  }
});

document.getElementById('inspect-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { inspection } = await api('/api/craft/inspect', {
      method: 'POST',
      body: JSON.stringify({ path: document.getElementById('inspect-path').value.trim() || '.' }),
    });
    document.getElementById('inspect-output').textContent = JSON.stringify(inspection, null, 2);
  } catch (err) {
    toast(err.message);
  }
});

/* ------------------------------------------------------------------ */
/* Proof Lab & Bench                                                   */
/* ------------------------------------------------------------------ */

const benchSelection = { suites: new Set(), targets: new Set(), initialised: false };

function passTone(rate) {
  if (rate >= 0.999) return 'var(--ok)';
  if (rate >= 0.5) return 'var(--warn)';
  return 'var(--err)';
}

function scoreBar(rate) {
  const pct = Math.max(0, Math.min(100, Math.round(rate * 100)));
  return `<div class="score-bar"><span style="width:${pct}%;background:${passTone(rate)}"></span></div>`;
}

function renderBenchChoosers(data) {
  const suiteWrap = document.getElementById('bench-suite-list');
  const targetWrap = document.getElementById('bench-target-list');
  if (!suiteWrap || !targetWrap) return;

  const suites = data.benchSuites || [];
  const suiteSignature = suites.map((s) => s.id).join(',');
  if (suiteWrap.dataset.signature !== suiteSignature) {
    suiteWrap.dataset.signature = suiteSignature;
    suiteWrap.innerHTML = suites.map((s) => `
      <label class="chip" title="${esc(s.description)}">
        <input type="checkbox" class="bench-suite" value="${esc(s.id)}" checked />
        <span>${esc(s.name)} <span class="muted">(${s.caseCount})</span></span>
      </label>`).join('');
    suites.forEach((s) => benchSelection.suites.add(s.id));
  }

  const targets = [
    ...data.combos.map((c) => ({ value: c.id, label: `combo: ${c.id}`, note: c.name })),
    ...data.providers.filter((p) => p.ready).map((p) => ({ value: `${p.id}/${p.defaultModel}`, label: `${p.id}/${p.defaultModel}`, note: p.name })),
  ];
  const targetSignature = targets.map((t) => t.value).join(',');
  if (targetWrap.dataset.signature !== targetSignature) {
    targetWrap.dataset.signature = targetSignature;
    targetWrap.innerHTML = targets.map((t) => `
      <label class="chip" title="${esc(t.note)}">
        <input type="checkbox" class="bench-target" value="${esc(t.value)}" ${t.value === 'offline-proof' ? 'checked' : ''} ${t.value.startsWith('sandbox-sim/') ? 'checked' : ''} />
        <span>${esc(t.label)}</span>
      </label>`).join('');
  }
}

function readBenchSelection() {
  const suiteIds = [...document.querySelectorAll('.bench-suite:checked')].map((el) => el.value);
  const targets = [...document.querySelectorAll('.bench-target:checked')].map((el) => el.value);
  return { suiteIds, targets };
}

async function fetchJsonRaw(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}

async function runProof() {
  const btn = document.getElementById('proof-run');
  const summary = document.getElementById('proof-summary');
  if (btn.disabled) return;
  btn.disabled = true;
  summary.textContent = currentLang === 'ar' ? 'جارٍ تشغيل السيناريوهات…' : 'Running scenarios…';
  try {
    const { json } = await fetchJsonRaw('/api/proof/run', { method: 'POST', body: '{}' });
    if (!json.results) throw new Error(json.error || 'proof run failed');
    renderProof(json);
  } catch (err) {
    summary.textContent = `Proof failed: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

function renderProof(report) {
  const summary = document.getElementById('proof-summary');
  const wrap = document.getElementById('proof-results');
  const { summary: s } = report;
  summary.innerHTML = `
    <span class="badge ${s.allPassed ? 'badge-ok' : 'badge-err'}">${s.passed}/${s.scenarios} scenarios</span>
    <span class="badge ${s.checksPassed === s.checks ? 'badge-ok' : 'badge-err'}">${s.checksPassed}/${s.checks} assertions</span>
    <span class="badge badge-accent">${report.durationMs} ms total</span>
    <span class="badge">real router · scripted network</span>`;

  wrap.innerHTML = report.results.map((r) => `
    <div class="proof-card ${r.passed ? 'proof-pass' : 'proof-fail'}">
      <div class="proof-card-top">
        <strong>${esc(r.name)}</strong>
        <span class="badge ${r.passed ? 'badge-ok' : 'badge-err'}">${r.passed ? 'PASS' : 'FAIL'} · ${r.durationMs} ms</span>
      </div>
      <p class="muted">${esc(r.what)}</p>
      <ul class="check-list">
        ${r.checks.map((c) => `<li class="${c.passed ? 'check-ok' : 'check-bad'}">${c.passed ? '✓' : '✗'} ${esc(c.label)}${c.detail ? ` <span class="muted">— ${esc(c.detail)}</span>` : ''}</li>`).join('')}
      </ul>
      <details>
        <summary class="muted">observations</summary>
        <pre class="code-output small">${esc(JSON.stringify(r.observations, null, 2))}</pre>
      </details>
    </div>`).join('');
}

async function runBench() {
  const btn = document.getElementById('bench-run');
  const box = document.getElementById('bench-scorecards');
  const { suiteIds, targets } = readBenchSelection();
  if (suiteIds.length === 0 || targets.length === 0) {
    toast(currentLang === 'ar' ? 'اختر حزمة وهدفاً واحداً على الأقل' : 'Pick at least one suite and one target');
    return;
  }
  btn.disabled = true;
  box.innerHTML = `<p class="muted">Running ${suiteIds.length} suite(s) against ${targets.length} target(s)…</p>`;
  try {
    const { json, ok } = await fetchJsonRaw('/api/bench/run', {
      method: 'POST',
      body: JSON.stringify({ suiteIds, targets, concurrency: 4 }),
    });
    if (!ok || !json.run) throw new Error(json.error || 'bench failed');
    renderBenchRun(json.run);
    await loadOverview();
  } catch (err) {
    box.innerHTML = `<p class="badge badge-err">${esc(err.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
}

function renderBenchRun(run) {
  const box = document.getElementById('bench-scorecards');
  const detail = document.getElementById('bench-detail');
  const cards = run.scorecards.map((c) => `
    <div class="bench-card">
      <div class="proof-card-top">
        <strong>${esc(c.target)}</strong>
        <span class="badge ${c.passRate >= 0.999 ? 'badge-ok' : c.passRate >= 0.5 ? 'badge-warn' : 'badge-err'}">${c.passed}/${c.cases} · ${Math.round(c.passRate * 100)}%</span>
      </div>
      ${scoreBar(c.passRate)}
      <div class="bench-stats">
        <span>score <strong>${(c.score * 100).toFixed(0)}%</strong></span>
        <span>p50 <strong>${c.latencyMs.p50} ms</strong></span>
        <span>p95 <strong>${c.latencyMs.p95} ms</strong></span>
        <span>fallbacks <strong>${c.fallbacks}</strong></span>
      </div>
      <div class="muted">answered by: ${Object.entries(c.providers).map(([id, n]) => `${esc(id)} ×${n}`).join(' · ') || '—'}</div>
      <div class="suite-breakdown">
        ${c.suites.map((s) => `<span class="badge ${s.passRate >= 0.999 ? 'badge-ok' : s.passRate > 0 ? 'badge-warn' : 'badge-err'}">${esc(s.id)} ${s.passed}/${s.cases}</span>`).join('')}
      </div>
    </div>`).join('');

  box.innerHTML = cards || '<p class="muted">No results.</p>';

  const rows = [...run.results]
    .sort((a, b) => Number(a.passed) - Number(b.passed) || a.target.localeCompare(b.target))
    .map((r) => `<tr>
      <td>${esc(r.target)}</td>
      <td>${esc(r.caseId)}</td>
      <td><span class="badge ${r.passed ? 'badge-ok' : 'badge-err'}">${r.passed ? 'pass' : 'fail'}</span></td>
      <td>${esc(r.providerId || '—')}</td>
      <td>${esc(r.latencyMs)} ms</td>
      <td><code class="cell-code">${esc((r.output || r.error || '').slice(0, 90))}</code></td>
      <td class="muted">${esc(r.detail)}</td>
    </tr>`).join('');

  detail.classList.remove('hidden');
  detail.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Target</th><th>Case</th><th>Result</th><th>Provider</th><th>Latency</th><th>Output</th><th>Grader</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderBenchHistory(runs) {
  const wrap = document.getElementById('bench-history');
  if (!wrap) return;
  if (!runs || runs.length === 0) {
    wrap.innerHTML = '<p class="muted">No runs yet.</p>';
    return;
  }
  wrap.innerHTML = runs.map((r) => `
    <div class="row-between history-row">
      <div>
        <strong>${esc(r.name)}</strong>
        <p class="muted">${esc(r.targets.join(', '))} · ${esc(r.suiteIds.join(', '))}</p>
      </div>
      <div class="row-inline">
        <span class="badge ${r.passRate >= 0.999 ? 'badge-ok' : r.passRate >= 0.5 ? 'badge-warn' : 'badge-err'}">${r.passedCases}/${r.totalCases} · ${Math.round(r.passRate * 100)}%</span>
        <button class="btn btn-ghost btn-sm" type="button" onclick="window.__viewBenchRun('${esc(r.id)}')">View</button>
      </div>
    </div>`).join('');
}

window.__viewBenchRun = async (id) => {
  try {
    const { run } = await api(`/api/bench/runs/${encodeURIComponent(id)}`);
    renderBenchRun(run);
    document.getElementById('panel-proof').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    toast(err.message);
  }
};

document.getElementById('proof-run')?.addEventListener('click', runProof);
document.getElementById('bench-run')?.addEventListener('click', runBench);

applyLang();
loadOverview();
