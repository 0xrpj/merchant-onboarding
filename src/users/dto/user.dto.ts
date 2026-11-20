import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  PageMetaDto,
  PaginationQueryDto,
} from '@/common/pagination/pagination.dto';
import type { User } from '@/users/user.entity';
import { UserRole } from '@/users/user-role.enum';

/** A user as other records show it: just enough to recognise them. */
export class UserRefDto {
  id: string;
  fullName: string;
}

export class UserDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

export class UserListResponseDto {
  data: UserDto[];
  meta: PageMetaDto;
}

export class ListUsersQueryDto extends PaginationQueryDto {
  /** e.g. REVIEWER, to find someone to assign. */
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;
}

export const toUserDto = (user: User): UserDto => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  isActive: user.isActive,
});

export const toUserRef = (user: Pick<User, 'id' | 'fullName'>): UserRefDto => ({
  id: user.id,
  fullName: user.fullName,
});
