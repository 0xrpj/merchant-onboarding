import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import {
  ApplicationStatus,
  RiskLevel,
  RiskStatus,
} from '@/applications/application.enums';
import { PaginationQueryDto } from '@/common/pagination/pagination.dto';
import { ToBoolean } from '@/common/validation/to-boolean.decorator';

/** ?status=A,B and ?status=A&status=B both become ["A", "B"]. */
const toList = ({ value }: { value: unknown }): unknown =>
  (Array.isArray(value) ? value : [value]).flatMap((item: unknown) =>
    typeof item === 'string'
      ? item
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : [item],
  );

/**
 * Filters only narrow what the caller can already see: a SALES user filtering
 * by someone else's reviewer still only gets their own applications.
 */
export class ListApplicationsQueryDto extends PaginationQueryDto {
  /** One or more, comma-separated. @example "IN_REVIEW,INFO_REQUESTED" */
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(Object.keys(ApplicationStatus).length)
  @IsEnum(ApplicationStatus, { each: true })
  status?: ApplicationStatus[];

  @IsOptional()
  @IsEnum(RiskStatus)
  riskStatus?: RiskStatus;

  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @IsOptional()
  @IsUUID()
  assignedReviewerId?: string;

  /** true: only applications with no reviewer. false: only assigned ones. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  unassigned?: boolean;
}
