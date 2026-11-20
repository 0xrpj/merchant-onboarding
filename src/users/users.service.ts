import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { pageMeta, pageWindow } from '@/common/pagination/pagination.dto';
import {
  ListUsersQueryDto,
  toUserDto,
  UserListResponseDto,
} from '@/users/dto/user.dto';
import { User } from '@/users/user.entity';
import { UserRole } from '@/users/user-role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findById(id: string, manager?: EntityManager): Promise<User | null> {
    const repo = manager ? manager.getRepository(User) : this.users;
    return repo.findOne({ where: { id } });
  }

  /** The only query that loads the password hash. Used by login. */
  findByEmailWithPasswordHash(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.trim().toLowerCase() })
      .getOne();
  }

  /** A user who can be assigned to review: exists, is a REVIEWER and is active. */
  findAssignableReviewer(
    id: string,
    manager: EntityManager,
  ): Promise<User | null> {
    return manager
      .getRepository(User)
      .findOne({ where: { id, role: UserRole.REVIEWER, isActive: true } });
  }

  async list(query: ListUsersQueryDto): Promise<UserListResponseDto> {
    // Only filters that were actually sent. (TypeORM 1.x throws on undefined
    // where-values, which protects against an accidental "match everything".)
    const where: FindOptionsWhere<User> = {};
    if (query.role !== undefined) where.role = query.role;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const [users, total] = await this.users.findAndCount({
      where,
      order: { fullName: 'ASC' },
      ...pageWindow(query),
    });

    return { data: users.map(toUserDto), meta: pageMeta(query, total) };
  }
}
