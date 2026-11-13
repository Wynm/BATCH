import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { getConfig } from '../config/env.mjs';
import { Store } from '../db/store.mjs';
import { GatewayRouter } from '../router/gateway.mjs';
import { BatchRunner } from '../batch/runner.mjs';
import { BenchRunner } from '../bench/runner.mjs';
import { runResilienceProof } from '../proof/resilienceLab.mjs';
import { isProviderReady } from '../config/providerKinds.mjs';
import { inspectWorkspace } from '../craft/inspector.mjs';
import { generateClientConfigs } from '../craft/clientConfigs.mjs';

export const MCP_TOOLS = [
  {
    name: 'batch_chat',
    description: 'Send a chat prompt through a BATCH routing combo or provider/model with automatic failover and caching.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Combo ID (e.g. auto-free, coding-fast, local-unlimited) or provider/model' },
        prompt: { type: 'string', description: 'User prompt text' },
        system: { type: 'string', description: 'Optional system instruction' },
        temperature: { type: 'number' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'batch_list_providers',
    description: 'List configured AI providers, enabled status, circuit breaker health, and available combos.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'batch_submit_job',
    description: 'Queue a concurrent batch job of multiple prompts across resilient failover providers.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        comboOrModel: { type: 'string' },
        concurrency: { type: 'integer' },
        systemPrompt: { type: 'string' },
        prompts: { type: 'array', items: { type: 'string' } },
      },
      required: ['prompts'],
    },
  },
  {
    name: 'batch_get_job',
    description: 'Inspect status and outputs of a previously submitted batch job.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'batch_run_bench',
    description: 'Run mechanically graded benchmark suites (reflex-core, structured-data, arabic-first) against routing targets and return a scorecard.',
    inputSchema: {
      type: 'object',
      properties: {
        suiteIds: { type: 'array', items: { type: 'string' } },
        targets: { type: 'array', items: { type: 'string' }, description: 'Combo IDs or provider/model strings' },
        concurrency: { type: 'integer' },
      },
    },
  },
  {
    name: 'batch_proof_lab',
    description: 'Prove failover behaviour: run the real router against scripted upstream failures (429, 401, 5xx, timeout, rate limits) and return assertions.',
    inputSchema: {
      type: 'object',
      properties: {
        scenarios: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'craft_inspect_workspace',
    description: 'Clean-room inspect local project structure, languages, manifests, or a single file inside the workspace root.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path inside workspace (default ".")' },
      },
    },
  },
  {
    name: 'craft_generate_agent_configs',
    description: 'Generate client integration snippets for OpenCode, Cursor, Continue, Claude Code, and OpenAI SDK.',
    inputSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string' },
      },
    },
  },
];

export class McpHandler {
  constructor({ store, router, batchRunner, benchRunner, workspaceRoot, baseUrl }) {
    this.store = store;
    this.router = router;
    this.batchRunner = batchRunner;
    this.benchRunner = benchRunner ?? (store && router ? new BenchRunner(store, router) : null);
    this.workspaceRoot = workspaceRoot;
    this.baseUrl = baseUrl || 'http://localhost:20128';
  }

  async handleRpc(msg) {
    if (!msg || typeof msg !== 'object') {
      return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
    }

    const { id, method, params } = msg;

    // Notifications (no id) require no response
    if (method === 'notifications/initialized' || id === undefined) {
      return null;
    }

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'batch-ai-gateway', version: '0.1.0' },
        },
      };
    }

    if (method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } };
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};
      try {
        const resultObj = await this._executeTool(toolName, args);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(resultObj, null, 2) }],
          },
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [{ type: 'text', text: err.message }],
          },
        };
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }

  async _executeTool(name, args) {
    switch (name) {
      case 'batch_chat': {
        const messages = [];
        if (args.system) messages.push({ role: 'system', content: String(args.system) });
        messages.push({ role: 'user', content: String(args.prompt || '') });
        const res = await this.router.routeChatCompletion({
          model: args.model || 'auto-free',
          messages,
          temperature: args.temperature ?? 0.2,
          stream: false,
        });
        if (!res.ok) throw new Error(res.error);
        return {
          providerId: res.meta.providerId,
          model: res.meta.model,
          cacheHit: res.meta.cacheHit,
          content: res.data?.choices?.[0]?.message?.content ?? '',
          attempts: res.meta.attempts,
        };
      }

      case 'batch_list_providers': {
        const providers = this.store.listProviders(false)
          .map((p) => ({ ...p, ready: isProviderReady({ ...p, apiKey: p.hasApiKey ? 'set' : null }) }));
        const breakers = this.router.circuitBreaker.snapshot(providers.map((p) => p.id));
        const combos = this.store.listCombos();
        return { providers, circuitBreakers: breakers, combos };
      }

      case 'batch_submit_job': {
        const items = (args.prompts || []).map((p, i) => ({
          customId: `mcp-${i + 1}`,
          prompt: String(p),
        }));
        return this.batchRunner.submitJob({
          name: args.name || 'MCP Batch Job',
          comboOrModel: args.comboOrModel || 'auto-free',
          concurrency: args.concurrency ?? 2,
          systemPrompt: args.systemPrompt || '',
          items,
        });
      }

      case 'batch_get_job': {
        const job = this.store.getBatchJob(String(args.jobId || ''));
        if (!job) throw new Error('Batch job not found');
        return job;
      }

      case 'batch_run_bench': {
        if (!this.benchRunner) throw new Error('Bench runner unavailable');
        return this.benchRunner.run({
          suiteIds: Array.isArray(args.suiteIds) ? args.suiteIds : undefined,
          targets: Array.isArray(args.targets) && args.targets.length ? args.targets : ['offline-proof'],
          concurrency: args.concurrency,
        });
      }

      case 'batch_proof_lab': {
        const report = await runResilienceProof({ only: Array.isArray(args.scenarios) ? args.scenarios : undefined });
        return report;
      }

      case 'craft_inspect_workspace': {
        return inspectWorkspace(this.workspaceRoot, args.path || '.');
      }

      case 'craft_generate_agent_configs': {
        return generateClientConfigs(args.baseUrl || this.baseUrl);
      }

      default:
        throw new Error(`Unknown MCP tool: ${name}`);
    }
  }
}

export function startStdioMcpServer() {
  const cfg = getConfig();
  const store = new Store(cfg.dbPath, cfg.masterKey, { enableDemo: cfg.enableDemo });
  const router = new GatewayRouter(store);
  const batchRunner = new BatchRunner(store, router);
  const benchRunner = new BenchRunner(store, router);
  const handler = new McpHandler({
    store,
    router,
    batchRunner,
    benchRunner,
    workspaceRoot: cfg.workspaceRoot,
    baseUrl: `http://localhost:${cfg.port}`,
  });

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
      return;
    }
    const resp = await handler.handleRpc(parsed);
    if (resp) {
      process.stdout.write(JSON.stringify(resp) + '\n');
    }
  });

  rl.on('close', () => {
    store.close();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startStdioMcpServer();
}
