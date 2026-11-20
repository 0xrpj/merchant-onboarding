import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/config/env.schema';
import { decryptField, encryptField } from '@/crypto/field-encryption';

/**
 * Encrypts and decrypts sensitive fields (owner national IDs).
 * Services call it explicitly, so it is visible where encryption happens.
 * Only the risk worker ever calls decrypt().
 */
@Injectable()
export class FieldEncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    // The env schema already guarantees exactly 32 bytes.
    this.key = Buffer.from(
      config.get('FIELD_ENCRYPTION_KEY', { infer: true }),
      'base64',
    );
  }

  encrypt(plaintext: string): string {
    return encryptField(this.key, plaintext);
  }

  decrypt(payload: string): string {
    return decryptField(this.key, payload);
  }
}
