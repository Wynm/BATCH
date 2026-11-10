import crypto from 'node:crypto';

export function buildCacheKey({ targetModel, messages, temperature, max_tokens, response_format, tools }) {
  const normalized = {
    targetModel: targetModel || 'auto',
    messages: (messages || []).map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content.trim() : m.content,
    })),
    temperature: temperature ?? 0.2,
    max_tokens: max_tokens ?? null,
    response_format: response_format ?? null,
    tools: tools ?? null,
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
