#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { getConfig } from '../config/env.mjs';
import { Store } from '../db/store.mjs';
import { GatewayRouter } from '../router/gateway.mjs';
import { BatchRunner } from '../batch/runner.mjs';
import { inspectWorkspace } from '../craft/inspector.mjs';
import { generateClientConfigs } from '../craft/clientConfigs.mjs';

function parseArgs(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(a);
    }
  }
  return { command: args[0] || 'help', rest: args.slice(1), flags };
}

function printHelp() {
  console.log(`BATCH CLI — Unified AI Gateway & Batch Orchestrator

Commands:
  doctor                          Verify environment, DB vault, and provider readiness
  chat --prompt "..."             Run a single prompt through smart routing (--model auto-free)
  run-file --input <file.jsonl>   Execute batch prompts from JSONL/TXT (--output out.jsonl --model auto-free --concurrency 2)
  inspect [path]                  Clean-room workspace architecture & manifest inspection
  export-config [--url <origin>]  Print client configs for OpenCode, Cursor, Continue, Claude Code
`);
}

export async function runCli(argv = process.argv.slice(2)) {
  const { command, rest, flags } = parseArgs(argv);
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return 0;
  }

  const cfg = getConfig();

  if (command === 'inspect') {
    const target = rest[0] || flags.path || '.';
    const report = inspectWorkspace(cfg.workspaceRoot, target);
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  if (command === 'export-config') {
    const url = String(flags.url || `http://localhost:${cfg.port}`);
    const configs = generateClientConfigs(url, cfg.apiKey || 'batch-local-dev');
    console.log(JSON.stringify(configs, null, 2));
    return 0;
  }

  const store = new Store(cfg.dbPath, cfg.masterKey, { enableDemo: cfg.enableDemo });
  const router = new GatewayRouter(store);

  try {
    if (command === 'doctor') {
      const providers = store.listProviders(false);
      const ready = providers.filter((p) => p.enabled && (p.hasApiKey || p.kind === 'local-openai' || p.kind === 'simulator'));
      console.log(`Node.js:          ${process.version}`);
      console.log(`Database:         ${cfg.dbPath}`);
      console.log(`Providers total:  ${providers.length}`);
      console.log(`Providers ready:  ${ready.length}`);
      for (const p of ready) {
        const probe = flags.live ? await router.testProvider(p.id) : { ok: true, message: 'configured' };
        console.log(`  - ${p.id.padEnd(14)} [${p.tier}] model=${p.defaultModel} -> ${probe.ok ? 'READY' : `ERR: ${probe.error}`}`);
      }
      return 0;
    }

    if (command === 'chat') {
      const prompt = String(flags.prompt || rest.join(' ') || '').trim();
      if (!prompt) {
        console.error('Error: --prompt is required');
        return 1;
      }
      const model = String(flags.model || 'auto-free');
      const res = await router.routeChatCompletion({
        model,
        messages: [
          ...(flags.system ? [{ role: 'system', content: String(flags.system) }] : []),
          { role: 'user', content: prompt },
        ],
        stream: false,
      });
      if (!res.ok) {
        console.error(`Error: ${res.error}`);
        return 1;
      }
      console.log(res.data?.choices?.[0]?.message?.content ?? '');
      console.error(`\n[provider=${res.meta.providerId} model=${res.meta.model} cache=${res.meta.cacheHit ? 'HIT' : 'MISS'}]`);
      return 0;
    }

    if (command === 'run-file') {
      const inputPath = String(flags.input || rest[0] || '');
      if (!inputPath || !fs.existsSync(inputPath)) {
        console.error('Error: --input <file> is required and must exist');
        return 1;
      }
      const raw = fs.readFileSync(inputPath, 'utf8');
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const items = lines.map((line, i) => {
        if (line.startsWith('{')) {
          const obj = JSON.parse(line);
          return {
            customId: obj.custom_id || obj.id || `line-${i + 1}`,
            prompt: obj.prompt || obj.input || '',
            system: obj.system,
            messages: obj.messages,
          };
        }
        return { customId: `line-${i + 1}`, prompt: line };
      });

      const runner = new BatchRunner(store, router);
      const job = runner.submitJob({
        name: String(flags.name || `CLI Batch (${inputPath})`),
        comboOrModel: String(flags.model || 'auto-free'),
        concurrency: Number(flags.concurrency || 2),
        systemPrompt: String(flags.system || ''),
        items,
      });
      const completed = await runner.waitForJob(job.id);
      const jsonl = runner.exportJsonl(job.id);
      if (flags.output) {
        fs.writeFileSync(String(flags.output), jsonl + '\n', 'utf8');
        console.log(`Batch ${job.id} finished (${completed.status}): ${completed.completedItems}/${completed.totalItems} succeeded -> ${flags.output}`);
      } else {
        console.log(jsonl);
      }
      return completed.failedItems > 0 ? 1 : 0;
    }

    console.error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  } finally {
    store.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().then((code) => process.exit(code));
}
