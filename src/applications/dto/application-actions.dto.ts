import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DecisionType } from '@/applications/application.enums';
import { Trim } from '@/common/validation/trim.decorator';

export class AssignReviewerDto {
  /** An active user with the REVIEWER role. */
  @IsUUID()
  reviewerId: string;
}

export class RecordDecisionDto {
  @IsEnum(DecisionType)
  decision: DecisionType;

  /**
   * Required for REJECT and REQUEST_INFO, and for APPROVE when the risk level
   * is HIGH. Up to 2,000 characters.
   * @example "Registration number doesn't match the company registry"
   */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
