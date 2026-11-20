import { Module } from '@nestjs/common';
import { FieldEncryptionService } from '@/crypto/field-encryption.service';

@Module({
  providers: [FieldEncryptionService],
  exports: [FieldEncryptionService],
})
export class CryptoModule {}
