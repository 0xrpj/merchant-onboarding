import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MerchantApplication } from '@/applications/entities/merchant-application.entity';
import { numericToNumber } from '@/database/transformers';

/** A person who owns part of the business. Only changed through their application. */
@Entity('merchant_owners')
@Index('IDX_merchant_owners_application', ['applicationId'])
// At most one primary contact per application, enforced by the database.
// ("Exactly one" is checked in code, because "at least one" can't be a simple constraint.)
@Index('UQ_merchant_owners_one_primary_contact', ['applicationId'], {
  unique: true,
  where: `"is_primary_contact"`,
})
@Check(
  'CHK_merchant_owners_ownership_range',
  `"ownership_percent" > 0 AND "ownership_percent" <= 100`,
)
export class MerchantOwner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => MerchantApplication, (application) => application.owners)
  @JoinColumn({ name: 'application_id' })
  application?: MerchantApplication;

  @Column({ type: 'varchar', length: 100 })
  fullName: string;

  @Column({ type: 'varchar', length: 254 })
  email: string;

  /** International format. Fake numbers only. */
  @Column({ type: 'varchar', length: 20 })
  phone: string;

  /** 0.01 to 100, two decimals. */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericToNumber,
  })
  ownershipPercent: number;

  @Column({ type: 'boolean', default: false })
  isPrimaryContact: boolean;

  /**
   * AES-256-GCM ciphertext ("v1:iv:tag:ciphertext"), never plain text.
   * Only the risk worker decrypts it. See FieldEncryptionService.
   */
  @Column({ type: 'text' })
  nationalIdEncrypted: string;

  /** Only for masked display: •••••6789. */
  @Column({ type: 'char', length: 4 })
  nationalIdLast4: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
