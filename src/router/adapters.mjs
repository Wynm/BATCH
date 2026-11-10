import crypto from 'node:crypto';

export function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text' && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function estimateTokens(text) {
  const len = String(text || '').length;
  return Math.max(1, Math.ceil(len / 4));
}

export function anthropicRequestToOpenAI(body) {
  const messages = [];
  if (body.system) {
    const sysText = extractTextContent(body.system);
    if (sysText) messages.push({ role: 'system', content: sysText });
  }
  for (const msg of body.messages || []) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({
        role: msg.role,
        content: extractTextContent(msg.content),
      });
    }
  }
  const openaiReq = {
    model: body.model || 'auto-free',
    messages,
    stream: Boolean(body.stream),
  };
  if (body.max_tokens !== undefined) openaiReq.max_tokens = body.max_tokens;
  if (body.temperature !== undefined) openaiReq.temperature = body.temperature;
  if (body.top_p !== undefined) openaiReq.top_p = body.top_p;
  if (body.stop_sequences) openaiReq.stop = body.stop_sequences;
  return openaiReq;
}

export function openAIResponseToAnthropic(openaiRes, requestedModel) {
  const choice = openaiRes.choices?.[0];
  const text = choice?.message?.content ?? '';
  const usage = openaiRes.usage || {};
  return {
    id: `msg_${(openaiRes.id || crypto.randomUUID()).replace(/^chatcmpl-/, '')}`,
    type: 'message',
    role: 'assistant',
    model: requestedModel || openaiRes.model || 'batch-router',
    content: [{ type: 'text', text }],
    stop_reason: choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
    },
  };
}

export function openAIRequestToAnthropic(openaiReq, upstreamModel) {
  const systemParts = [];
  const messages = [];
  for (const m of openaiReq.messages || []) {
    if (m.role === 'system') {
      systemParts.push(extractTextContent(m.content));
    } else if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role, content: extractTextContent(m.content) });
    }
  }
  const payload = {
    model: upstreamModel,
    max_tokens: openaiReq.max_tokens ?? 1024,
    messages,
    stream: Boolean(openaiReq.stream),
  };
  if (systemParts.length > 0) {
    payload.system = systemParts.join('\n\n');
  }
  if (openaiReq.temperature !== undefined) payload.temperature = openaiReq.temperature;
  if (openaiReq.top_p !== undefined) payload.top_p = openaiReq.top_p;
  if (openaiReq.stop) {
    payload.stop_sequences = Array.isArray(openaiReq.stop) ? openaiReq.stop : [openaiReq.stop];
  }
  return payload;
}

export function anthropicResponseToOpenAI(anthRes, providerModel) {
  const text = (anthRes.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const promptTokens = anthRes.usage?.input_tokens ?? 0;
  const completionTokens = anthRes.usage?.output_tokens ?? 0;
  return {
    id: `chatcmpl-${anthRes.id || crypto.randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: providerModel || anthRes.model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: anthRes.stop_reason === 'max_tokens' ? 'length' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

export function buildSimulatorText(messages = []) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const prompt = extractTextContent(lastUser?.content || '').trim();
  const preview = prompt.length > 240 ? `${prompt.slice(0, 240)}...` : prompt;
  return [
    '[BATCH Sandbox Simulator — Offline Demo Mode]',
    preview
      ? `Processed prompt (${prompt.length} chars): "${preview}"`
      : 'Processed empty prompt.',
    'Note: Add a real provider key (Groq, Gemini, OpenRouter, NVIDIA NIM, Mistral) or enable local Ollama in the Providers tab to route to live LLMs.',
  ].join('\n\n');
}

export function createSimulatorCompletion(reqBody, modelName = 'batch-sim-v1') {
  const text = buildSimulatorText(reqBody.messages || []);
  const promptText = (reqBody.messages || []).map((m) => extractTextContent(m.content)).join('\n');
  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateTokens(text);

  return {
    id: `chatcmpl-${crypto.randomUUID().slice(0, 12)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

export async function* streamSimulatorChunks(reqBody, modelName = 'batch-sim-v1') {
  const id = `chatcmpl-${crypto.randomUUID().slice(0, 12)}`;
  const created = Math.floor(Date.now() / 1000);
  const text = buildSimulatorText(reqBody.messages || []);
  const tokens = text.split(/(\s+)/).filter(Boolean);

  yield {
    id,
    object: 'chat.completion.chunk',
    created,
    model: modelName,
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
  };

  for (const token of tokens) {
    yield {
      id,
      object: 'chat.completion.chunk',
      created,
      model: modelName,
      choices: [{ index: 0, delta: { content: token }, finish_reason: null }],
    };
  }

  yield {
    id,
    object: 'chat.completion.chunk',
    created,
    model: modelName,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  };
}
