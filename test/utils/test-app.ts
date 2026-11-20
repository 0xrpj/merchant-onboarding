import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import type { ApplicationDto } from '@/applications/dto/application-response.dto';
import { hashPassword } from '@/auth/password';
import { KYB_PROVIDER, type KybProvider } from '@/risk/kyb/kyb-provider';
import { User } from '@/users/user.entity';
import { UserRole } from '@/users/user-role.enum';
import { applicationBody } from './fixtures';
import { waitFor } from './wait-for';

const STAFF = {
  maya: { fullName: 'Maya Admin', role: UserRole.ADMIN, isActive: true },
  ram: { fullName: 'Ram Reviewer', role: UserRole.REVIEWER, isActive: true },
  gita: { fullName: 'Gita Reviewer', role: UserRole.REVIEWER, isActive: true },
  sita: { fullName: 'Sita Sales', role: UserRole.SALES, isActive: true },
  hari: { fullName: 'Hari Sales', role: UserRole.SALES, isActive: true },
  formerReviewer: {
    fullName: 'Former Reviewer',
    role: UserRole.REVIEWER,
    isActive: false,
  },
} as const;

export type StaffName = keyof typeof STAFF;
/** Everyone who can log in. */
export type ActiveStaff = Exclude<StaffName, 'formerReviewer'>;
type StaffUser = { id: string; email: string; role: UserRole };

export type TestContext = {
  app: INestApplication<App>;
  dataSource: DataSource;
  staff: Record<StaffName, StaffUser>;
  tokens: Record<ActiveStaff, string>;
  /** Random per run, never committed. */
  password: string;
};

const TABLES = [
  'audit_logs',
  'review_decisions',
  'risk_assessments',
  'merchant_owners',
  'merchant_applications',
  'refresh_tokens',
  'users',
];

/**
 * Empties every table. TRUNCATE skips the audit log's row-level
 * "no DELETE" trigger; production would use a database role without TRUNCATE.
 */
const resetDatabase = async (dataSource: DataSource): Promise<void> => {
  await dataSource.query(
    `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`,
  );
};

const createStaff = async (
  dataSource: DataSource,
  password: string,
): Promise<Record<StaffName, StaffUser>> => {
  const passwordHash = await hashPassword(password, 4);
  const entries = await Promise.all(
    (Object.keys(STAFF) as StaffName[]).map(async (name) => {
      const user = await dataSource.getRepository(User).save({
        ...STAFF[name],
        email: `${name.toLowerCase()}@example.com`,
        passwordHash,
      });
      return [
        name,
        { id: user.id, email: user.email, role: user.role },
      ] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<StaffName, StaffUser>;
};

export const login = async (
  app: INestApplication<App>,
  email: string,
  password: string,
): Promise<string> => {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return (res.body as { accessToken: string }).accessToken;
};

/**
 * A fresh app on the test database: tables emptied, fake staff created and
 * logged in. One per test file (beforeAll); close it in afterAll.
 */
export const createTestContext = async (
  options: {
    kyb?: KybProvider;
    override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  } = {},
): Promise<TestContext> => {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.kyb) {
    builder = builder.overrideProvider(KYB_PROVIDER).useValue(options.kyb);
  }
  if (options.override) {
    builder = options.override(builder);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  await resetDatabase(dataSource);
  const password = randomBytes(12).toString('base64url');
  const staff = await createStaff(dataSource, password);

  const active: ActiveStaff[] = ['maya', 'ram', 'gita', 'sita', 'hari'];
  const tokens = Object.fromEntries(
    await Promise.all(
      active.map(async (name) => [
        name,
        await login(app, staff[name].email, password),
      ]),
    ),
  ) as Record<ActiveStaff, string>;

  return { app, dataSource, staff, tokens, password };
};

/** HTTP calls under /api/v1, logged in as `who` (or anonymous). */
export const api = (ctx: TestContext, who?: ActiveStaff) => {
  const server = ctx.app.getHttpServer();
  const auth = (test: request.Test): request.Test =>
    who ? test.set('Authorization', `Bearer ${ctx.tokens[who]}`) : test;
  return {
    get: (path: string) => auth(request(server).get(`/api/v1${path}`)),
    post: (path: string, body: object = {}) =>
      auth(request(server).post(`/api/v1${path}`)).send(body),
    patch: (path: string, body: object) =>
      auth(request(server).patch(`/api/v1${path}`)).send(body),
  };
};

// --- Common flows ---

export const createApplication = async (
  ctx: TestContext,
  who: ActiveStaff,
  overrides: Record<string, unknown> = {},
): Promise<ApplicationDto> => {
  const res = await api(ctx, who)
    .post('/applications', applicationBody(overrides))
    .expect(201);
  return res.body as ApplicationDto;
};

export const getApplication = async (
  ctx: TestContext,
  who: ActiveStaff,
  id: string,
): Promise<ApplicationDto> =>
  (await api(ctx, who).get(`/applications/${id}`).expect(200))
    .body as ApplicationDto;

/** Waits until the background risk check moved the application on. */
export const waitForApplication = (
  ctx: TestContext,
  id: string,
  done: (app: ApplicationDto) => boolean,
): Promise<ApplicationDto> =>
  waitFor(() => getApplication(ctx, 'maya', id), done);

export const submitAndWaitForReview = async (
  ctx: TestContext,
  who: ActiveStaff,
  id: string,
): Promise<ApplicationDto> => {
  await api(ctx, who).post(`/applications/${id}/submit`).expect(202);
  return waitForApplication(ctx, id, (app) => app.status === 'IN_REVIEW');
};

export const assignReviewer = async (
  ctx: TestContext,
  id: string,
  reviewer: StaffName,
): Promise<ApplicationDto> =>
  (
    await api(ctx, 'maya')
      .post(`/applications/${id}/assign`, {
        reviewerId: ctx.staff[reviewer].id,
      })
      .expect(200)
  ).body as ApplicationDto;

/** Created by `owner`, risk-checked, assigned to `reviewer`: ready for a decision. */
export const applicationInReview = async (
  ctx: TestContext,
  {
    owner = 'sita',
    reviewer = 'ram',
    overrides = {},
  }: {
    owner?: ActiveStaff;
    reviewer?: StaffName;
    overrides?: Record<string, unknown>;
  } = {},
): Promise<ApplicationDto> => {
  const app = await createApplication(ctx, owner, overrides);
  await submitAndWaitForReview(ctx, owner, app.id);
  return assignReviewer(ctx, app.id, reviewer);
};
