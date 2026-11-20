import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/auth/decorators/roles.decorator';
import { ListUsersQueryDto, UserListResponseDto } from '@/users/dto/user.dto';
import { UserRole } from '@/users/user-role.enum';
import { UsersService } from '@/users/users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Staff list, e.g. ?role=REVIEWER&isActive=true to find someone to assign. ADMIN only. */
  @Get()
  @Roles(UserRole.ADMIN)
  list(@Query() query: ListUsersQueryDto): Promise<UserListResponseDto> {
    return this.users.list(query);
  }
}
