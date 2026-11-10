import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function loadDotEnv(envPath = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

export function resolveMasterKey(dataDir) {
  const fromEnv = process.env.BATCH_MASTER_KEY;
  if (fromEnv && fromEnv.trim()) {
    const clean = fromEnv.trim();
    if (/^[0-9a-fA-F]{64}$/.test(clean)) {
      return Buffer.from(clean, 'hex');
    }
    return crypto.createHash('sha256').update(clean, 'utf8').digest();
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const keyFile = path.join(dataDir, '.batch-master.key');
  if (fs.existsSync(keyFile)) {
    const hex = fs.readFileSync(keyFile, 'utf8').trim();
    if (/^[0-9a-fA-F]{64}$/.test(hex)) {
      return Buffer.from(hex, 'hex');
    }
  }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, generated.toString('hex') + '\n', { mode: 0o600 });
  return generated;
}

export function getConfig(overrides = {}) {
  loadDotEnv();
  const dataDir = path.resolve(overrides.dataDir ?? process.env.DATA_DIR ?? './data');
  fs.mkdirSync(dataDir, { recursive: true });

  const port = Number(overrides.port ?? process.env.PORT ?? 20128);
  const host = String(overrides.host ?? process.env.HOST ?? '0.0.0.0');
  const dbPath = path.resolve(overrides.dbPath ?? process.env.BATCH_DB_PATH ?? path.join(dataDir, 'batch.db'));
  const masterKey = overrides.masterKey ?? resolveMasterKey(dataDir);
  const apiKey = overrides.apiKey ?? (process.env.BATCH_API_KEY?.trim() || null);
  const enableDemo = overrides.enableDemo ?? ((process.env.BATCH_ENABLE_DEMO_PROVIDER ?? 'true').toLowerCase() !== 'false');
  const workspaceRoot = path.resolve(overrides.workspaceRoot ?? process.env.BATCH_WORKSPACE_ROOT ?? process.cwd());

  return {
    host,
    port,
    dataDir,
    dbPath,
    masterKey,
    apiKey,
    enableDemo,
    workspaceRoot,
  };
}
