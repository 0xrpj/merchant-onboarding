import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12; // The standard IV size for GCM.
const AUTH_TAG_BYTES = 16;

/**
 * AES-256-GCM field encryption.
 * Output: "v1:<iv>:<authTag>:<ciphertext>", each part base64url.
 * - A fresh random IV every time, so the same value never encrypts to the same text.
 * - The auth tag makes decryption fail if anyone changed the stored ciphertext.
 * - "v1" names the key generation, so keys can be rotated to "v2" later.
 */
export const encryptField = (key: Buffer, plaintext: string): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
};

export const decryptField = (key: Buffer, payload: string): string => {
  const [version, iv, authTag, ciphertext] = payload.split(':');
  if (version !== VERSION || !iv || !authTag || !ciphertext) {
    throw new Error('Unsupported encrypted value format');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64url'),
    { authTagLength: AUTH_TAG_BYTES },
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

  // final() throws if the ciphertext or tag was tampered with, or the key is wrong.
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};
