/**
 * Single source of truth for "can this provider serve traffic right now?".
 *
 * Before this module existed the same predicate was duplicated in the router,
 * the HTTP server, the CLI doctor, the MCP server and the web UI, so adding a
 * provider kind silently broke readiness reporting everywhere. Keep it here.
 */

/** Kinds that need neither an API key nor a network peer to answer. */
export const SELF_CONTAINED_KINDS = new Set(['simulator', 'micro']);

/** Kinds served over an OpenAI-compatible HTTP endpoint (local engines included). */
export const OPENAI_COMPATIBLE_KINDS = new Set(['openai-compatible', 'local-openai']);

export function isProviderReady(provider) {
  if (!provider || !provider.enabled) return false;
  if (SELF_CONTAINED_KINDS.has(provider.kind)) return true;
  if (provider.kind === 'local-openai') return true;
  return Boolean(provider.apiKey && String(provider.apiKey).trim());
}

export function isProviderConfigured(provider) {
  if (!provider) return false;
  if (SELF_CONTAINED_KINDS.has(provider.kind)) return Boolean(provider.enabled);
  if (provider.kind === 'local-openai') return Boolean(provider.enabled);
  return Boolean(provider.enabled && provider.hasApiKey);
}
