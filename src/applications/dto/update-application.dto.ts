import { OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CreateApplicationDto,
  CreateOwnerDto,
  NATIONAL_ID,
} from '@/applications/dto/create-application.dto';
import { MAX_OWNERS, MIN_OWNERS } from '@/applications/domain/owner-rules';
import { Trim } from '@/common/validation/trim.decorator';

/**
 * One owner in a PATCH. The whole owners list is sent:
 * - with id: that owner is updated (leave nationalId out to keep the stored one)
 * - without id: a new owner is added (nationalId required)
 * - an existing owner left out of the list is removed
 */
export class UpdateOwnerDto extends OmitType(CreateOwnerDto, [
  'nationalId',
] as const) {
  /** An existing owner of THIS application. Leave out to add a new owner. */
  @IsOptional()
  @IsUUID()
  id?: string;

  /** Required for a new owner. Optional for an existing one. */
  @ValidateIf(
    (owner: UpdateOwnerDto) =>
      owner.id === undefined || owner.nationalId !== undefined,
  )
  @Trim()
  @IsString()
  @Matches(NATIONAL_ID, {
    message: 'nationalId must be 4 to 30 letters, digits, spaces or dashes',
  })
  nationalId?: string;
}

/**
 * Every field is optional; send only what changes. `processing` and `owners`
 * are groups: when sent, they replace the whole group.
 * skipNullProperties: false means `null` is validated (and rejected) instead
 * of slipping through as "not sent".
 */
export class UpdateApplicationDto extends PartialType(
  OmitType(CreateApplicationDto, ['owners'] as const),
  { skipNullProperties: false },
) {
  /** The complete new owner list. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(MIN_OWNERS)
  @ArrayMaxSize(MAX_OWNERS)
  @ValidateNested({ each: true })
  @Type(() => UpdateOwnerDto)
  owners?: UpdateOwnerDto[];
}
