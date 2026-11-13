import crypto from 'node:crypto';

export function buildCacheKey({
  targetModel,
  messages,
  temperature,
  max_tokens,
  response_format,
  tools,
  tool_choice,
  top_p,
  stop,
  seed,
  n,
  presence_penalty,
  frequency_penalty,
}) {
  // Every parameter that can change the output MUST participate in the key.
  // Earlier versions omitted top_p/stop/seed/n/penalties, so two genuinely
  // different requests could share one stored answer.
  const normalized = {
    targetModel: targetModel || 'auto',
    messages: (messages || []).map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content.trim() : m.content,
      name: m.name ?? null,
      tool_call_id: m.tool_call_id ?? null,
      tool_calls: m.tool_calls ?? null,
    })),
    temperature: temperature ?? 0.2,
    max_tokens: max_tokens ?? null,
    response_format: response_format ?? null,
    tools: tools ?? null,
    tool_choice: tool_choice ?? null,
    top_p: top_p ?? null,
    stop: stop ?? null,
    seed: seed ?? null,
    n: n ?? null,
    presence_penalty: presence_penalty ?? null,
    frequency_penalty: frequency_penalty ?? null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function shouldUseCache(reqBody, headers = {}) {
  const mode = String(headers['x-batch-cache'] || 'auto').toLowerCase();
  if (mode === 'bypass' || mode === 'off' || reqBody.cache === false) return false;
  if (reqBody.stream) return false;
  if (mode === 'force') return true;
  const temp = reqBody.temperature;
  return temp === undefined || temp === null || Number(temp) <= 0.4;
}
