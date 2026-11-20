import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO4217CurrencyCode,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  BusinessType,
  Industry,
  ProcessingChannel,
} from '@/applications/application.enums';
import { MAX_OWNERS, MIN_OWNERS } from '@/applications/domain/owner-rules';
import { Trim } from '@/common/validation/trim.decorator';

// "+" then 8 to 15 digits (E.164).
const PHONE = /^\+[1-9]\d{7,14}$/;
// 4 to 30 letters, digits, spaces or dashes, with at least 4 letters or digits.
export const NATIONAL_ID =
  /^(?=(?:[^A-Za-z0-9]*[A-Za-z0-9]){4})[A-Za-z0-9 -]{4,30}$/;
const REGISTRATION_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 /-]{0,49}$/;

export class CreateOwnerDto {
  /** @example "Owner A" */
  @Trim()
  @IsString()
  @Length(1, 100)
  fullName: string;

  /** @example "owner.a@himalbrew.example" */
  @Trim()
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** International format, fake numbers only. @example "+9779800000001" */
  @Matches(PHONE, {
    message: 'phone must be in international format, e.g. +9779800000001',
  })
  phone: string;

  /** More than 0, at most 100, up to 2 decimals. @example 60 */
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(100)
  ownershipPercent: number;

  /** Exactly one owner per application is the primary contact. */
  @IsBoolean()
  isPrimaryContact: boolean;

  /**
   * Stored encrypted. Responses only ever show the last 4 characters.
   * @example "00-00-00-06789"
   */
  @Trim()
  @IsString()
  @Matches(NATIONAL_ID, {
    message: 'nationalId must be 4 to 30 letters, digits, spaces or dashes',
  })
  nationalId: string;
}

/** Sent as a whole group: on update, every field is replaced. */
export class ProcessingDto {
  /** Whole paisa (1 NPR = 100 paisa). NPR 1,500,000 = 150000000. @example 150000000 */
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedMonthlyVolumeMinor: number;

  /** Whole paisa. NPR 650 = 65000. @example 65000 */
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  averageTransactionMinor: number;

  /** ISO 4217 code. @example "NPR" */
  @IsOptional()
  @IsISO4217CurrencyCode()
  currency: string = 'NPR';

  /** At least one. @example ["CARD_PRESENT"] */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(ProcessingChannel, { each: true })
  channels: ProcessingChannel[];
}

/**
 * A new application. Created as DRAFT, owned by the caller.
 * Unknown fields (status, createdById, ...) are rejected with 400.
 */
export class CreateApplicationDto {
  /** Trading name. @example "Himal Brew Café" */
  @Trim()
  @IsString()
  @Length(1, 200)
  businessName: string;

  /** Registered name. @example "Himal Brew Pvt. Ltd." */
  @Trim()
  @IsString()
  @Length(1, 200)
  legalBusinessName: string;

  @IsEnum(BusinessType)
  businessType: BusinessType;

  @IsEnum(Industry)
  industry: Industry;

  /** @example "REG-111" */
  @Trim()
  @IsString()
  @Matches(REGISTRATION_NUMBER, {
    message:
      'registrationNumber must be 1 to 50 letters, digits, spaces, dashes or slashes',
  })
  registrationNumber: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ProcessingDto)
  processing: ProcessingDto;

  /** 1 to 10 owners, total at most 100%, exactly one primary contact. */
  @IsArray()
  @ArrayMinSize(MIN_OWNERS)
  @ArrayMaxSize(MAX_OWNERS)
  @ValidateNested({ each: true })
  @Type(() => CreateOwnerDto)
  owners: CreateOwnerDto[];
}
