import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 100;

/** ?page=1&limit=20. Every list endpoint is paginated; nothing returns an unbounded list. */
export class PaginationQueryDto {
  /** 1-based page number. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  /** Items per page, at most 100. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = 20;
}

export class PageMetaDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const pageMeta = (
  query: PaginationQueryDto,
  total: number,
): PageMetaDto => ({
  page: query.page,
  limit: query.limit,
  total,
  totalPages: Math.ceil(total / query.limit),
});

/** TypeORM skip/take for a page. */
export const pageWindow = (
  query: PaginationQueryDto,
): { skip: number; take: number } => ({
  skip: (query.page - 1) * query.limit,
  take: query.limit,
});
