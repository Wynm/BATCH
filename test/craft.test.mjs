import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { inspectWorkspace } from '../src/craft/inspector.mjs';

test('inspectWorkspace analyzes current repository safely', () => {
  const root = path.resolve(process.cwd());
  const report = inspectWorkspace(root, '.');
  assert.equal(report.type, 'directory');
  assert.ok(report.totalFilesScanned > 5);
  assert.ok(report.manifests.includes('package.json'));
  assert.equal(report.packageSummary?.name, 'batch-ai-gateway');
});

test('inspectWorkspace blocks path traversal outside workspace root', () => {
  const root = path.resolve(process.cwd());
  assert.throws(() => inspectWorkspace(root, '../../etc/passwd'), /escapes workspace root/i);
});
