import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encryptSecret, decryptSecret, maskSecret } from '../src/security/vault.mjs';

test('encryptSecret and decryptSecret round-trip with AES-256-GCM', () => {
  const key = crypto.randomBytes(32);
  const secret = 'gsk_super_secret_token_1234567890';
  const encrypted = encryptSecret(secret, key);

  assert.ok(encrypted);
  assert.ok(!encrypted.includes(secret));
  assert.equal(decryptSecret(encrypted, key), secret);
});

test('decryptSecret fails on tampered ciphertext or wrong key', () => {
  const key = crypto.randomBytes(32);
  const wrongKey = crypto.randomBytes(32);
  const encrypted = encryptSecret('sk-test-abcdef', key);

  assert.throws(() => decryptSecret(encrypted, wrongKey));

  const parsed = JSON.parse(encrypted);
  parsed.ct = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptSecret(JSON.stringify(parsed), key));
});

test('maskSecret hides middle characters safely', () => {
  assert.equal(maskSecret('sk-proj-1234567890wxyz'), 'sk-p...wxyz');
  assert.equal(maskSecret('short'), '*****');
  assert.equal(maskSecret(''), '');
});
