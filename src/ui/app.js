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
  const readyCount = data.providers.filter((p) => p.enabled && (p.hasApiKey || p.kind === 'local-openai' || p.kind === 'simulator')).length;

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
    const ready = p.enabled && (p.hasApiKey || p.kind === 'local-openai' || p.kind === 'simulator');
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
      prompt: document.getElementById('pg-prompt').value || 'Explain how BATCH routes across free tiers and local Ollama.',
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

applyLang();
loadOverview();
