import { randomBytes } from 'node:crypto';
import { decryptField, encryptField } from '@/crypto/field-encryption';

describe('field encryption (AES-256-GCM)', () => {
  const key = randomBytes(32);

  it('decrypts what it encrypted', () => {
    const payload = encryptField(key, '00-00-00-06789');

    expect(decryptField(key, payload)).toBe('00-00-00-06789');
  });

  it('uses the v1:iv:tag:ciphertext format and never contains the plain value', () => {
    const payload = encryptField(key, '00-00-00-06789');

    expect(payload.split(':')).toHaveLength(4);
    expect(payload.startsWith('v1:')).toBe(true);
    expect(payload).not.toContain('06789');
  });

  it('encrypts the same value differently every time (random IV)', () => {
    expect(encryptField(key, 'same')).not.toBe(encryptField(key, 'same'));
  });

  it('fails if the stored ciphertext was tampered with', () => {
    const [version, iv, tag, ciphertext] = encryptField(key, 'secret').split(
      ':',
    );
    const flipped = Buffer.from(ciphertext, 'base64url');
    flipped[0] ^= 0xff;
    const tampered = [version, iv, tag, flipped.toString('base64url')].join(
      ':',
    );

    expect(() => decryptField(key, tampered)).toThrow();
  });

  it('fails with the wrong key', () => {
    const payload = encryptField(key, 'secret');

    expect(() => decryptField(randomBytes(32), payload)).toThrow();
  });

  it('rejects an unknown format', () => {
    expect(() => decryptField(key, 'plain-text')).toThrow(
      'Unsupported encrypted value format',
    );
  });
});
