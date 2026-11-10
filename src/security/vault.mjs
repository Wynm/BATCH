import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

export function encryptSecret(plaintext, masterKey) {
  if (!plaintext) return null;
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) {
    throw new Error('masterKey must be a 32-byte Buffer');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: encrypted.toString('base64'),
  });
}

export function decryptSecret(payload, masterKey) {
  if (!payload) return null;
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) {
    throw new Error('masterKey must be a 32-byte Buffer');
  }
  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  if (!parsed || parsed.v !== 1 || !parsed.iv || !parsed.tag || !parsed.ct) {
    throw new Error('Invalid encrypted secret payload');
  }
  const decipher = crypto.createDecipheriv(ALGO, masterKey, Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.ct, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function maskSecret(secret) {
  if (!secret || typeof secret !== 'string') return '';
  if (secret.length <= 8) return '*'.repeat(secret.length);
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}
