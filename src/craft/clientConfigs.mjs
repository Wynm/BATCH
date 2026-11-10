export function generateClientConfigs(baseOrigin = 'http://localhost:20128', apiKey = 'batch-local-dev') {
  const cleanOrigin = baseOrigin.replace(/\/+$/, '');
  const v1Base = `${cleanOrigin}/v1`;
  const effectiveKey = apiKey || 'batch-local-dev';

  return {
    openaiSdkPython: `from openai import OpenAI

client = OpenAI(
    base_url="${v1Base}",
    api_key="${effectiveKey}",
)

resp = client.chat.completions.create(
    model="auto-free",
    messages=[{"role": "user", "content": "Review this architecture cleanly."}],
)
print(resp.choices[0].message.content)`,

    claudeCodeEnv: `# Point Claude Code (Anthropic-compatible /v1/messages) at BATCH Gateway
export ANTHROPIC_BASE_URL="${cleanOrigin}"
export ANTHROPIC_AUTH_TOKEN="${effectiveKey}"
export ANTHROPIC_MODEL="coding-fast"
# Run Claude Code:
claude`,

    opencodeJson: JSON.stringify(
      {
        $schema: 'https://opencode.ai/config.json',
        provider: {
          batch: {
            npm: '@ai-sdk/openai-compatible',
            name: 'BATCH Gateway',
            options: {
              baseURL: v1Base,
              apiKey: effectiveKey,
            },
            models: {
              'auto-free': { name: 'BATCH Auto Free Chain' },
              'coding-fast': { name: 'BATCH Coding Fast' },
              'local-unlimited': { name: 'BATCH Local Ollama' },
            },
          },
        },
      },
      null,
      2,
    ),

    continueYaml: `models:
  - name: BATCH Auto Free
    provider: openai
    model: auto-free
    apiBase: ${v1Base}
    apiKey: ${effectiveKey}
    roles:
      - chat
      - edit
      - apply
  - name: BATCH Autocomplete
    provider: openai
    model: coding-fast
    apiBase: ${v1Base}
    apiKey: ${effectiveKey}
    useLegacyCompletionsEndpoint: true
    roles:
      - autocomplete`,

    cursorSettings: `1. Open Cursor Settings -> Models -> Override OpenAI Base URL
2. Base URL: ${v1Base}
3. OpenAI API Key: ${effectiveKey}
4. Add custom model IDs: auto-free, coding-fast, local-unlimited`,

    mcpConfig: JSON.stringify(
      {
        mcpServers: {
          batch: {
            command: 'node',
            args: ['--no-warnings', 'src/mcp/server.mjs'],
            env: {
              DATA_DIR: './data',
            },
          },
        },
      },
      null,
      2,
    ),
  };
}
