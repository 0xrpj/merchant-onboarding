import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApplicationLifecycleService } from '@/applications/application-lifecycle.service';
import { ApplicationsService } from '@/applications/applications.service';
import {
  AssignReviewerDto,
  RecordDecisionDto,
} from '@/applications/dto/application-actions.dto';
import {
  ApplicationDto,
  ApplicationListResponseDto,
} from '@/applications/dto/application-response.dto';
import { CreateApplicationDto } from '@/applications/dto/create-application.dto';
import { ListApplicationsQueryDto } from '@/applications/dto/list-applications-query.dto';
import { UpdateApplicationDto } from '@/applications/dto/update-application.dto';
import { AuditLogListResponseDto } from '@/audit/dto/audit-log.dto';
import type { AuthUser } from '@/auth/auth-user';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Roles } from '@/auth/decorators/roles.decorator';
import { PaginationQueryDto } from '@/common/pagination/pagination.dto';
import { UserRole } from '@/users/user-role.enum';

/**
 * Request checks, in order: valid token (401) -> role allowed (403) ->
 * input valid (400) -> application visible to you (404) -> allowed in its
 * current state (409).
 */
@ApiTags('Applications')
@ApiBearerAuth()
@Controller('applications')
export class ApplicationsController {
  constructor(
    private readonly applications: ApplicationsService,
    private readonly lifecycle: ApplicationLifecycleService,
  ) {}

  /** Create a DRAFT. It belongs to the caller. */
  @Post()
  @Roles(UserRole.SALES, UserRole.ADMIN)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApplicationDto,
  ): Promise<ApplicationDto> {
    return this.applications.create(user, dto);
  }

  /** Applications you can see (ADMIN: all, SALES: yours, REVIEWER: assigned to you), newest first. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListApplicationsQueryDto,
  ): Promise<ApplicationListResponseDto> {
    return this.applications.list(user, query);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApplicationDto> {
    return this.applications.get(user, id);
  }

  /** Edit while DRAFT or INFO_REQUESTED. */
  @Patch(':id')
  @Roles(UserRole.SALES, UserRole.ADMIN)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
  ): Promise<ApplicationDto> {
    return this.applications.update(user, id, dto);
  }

  /** Submit or resubmit. 202: the risk check continues in the background. */
  @Post(':id/submit')
  @Roles(UserRole.SALES, UserRole.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApplicationDto> {
    return this.lifecycle.submit(user, id);
  }

  /** Assign or reassign the reviewer. */
  @Post(':id/assign')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignReviewerDto,
  ): Promise<ApplicationDto> {
    return this.lifecycle.assign(user, id, dto);
  }

  /** Approve, reject or request info. Only the assigned reviewer. */
  @Post(':id/decisions')
  @Roles(UserRole.REVIEWER)
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordDecisionDto,
  ): Promise<ApplicationDto> {
    return this.lifecycle.decide(user, id, dto);
  }

  /** Run a FAILED risk check again. 202: it runs in the background. */
  @Post(':id/risk-assessments/retry')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  retryRiskCheck(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApplicationDto> {
    return this.lifecycle.retryRiskCheck(user, id);
  }

  /** Who did what to this application, newest first. */
  @Get(':id/audit-logs')
  @Roles(UserRole.ADMIN)
  auditLogs(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<AuditLogListResponseDto> {
    return this.applications.auditTrail(user, id, query);
  }
}
