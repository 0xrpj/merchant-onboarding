import { randomUUID } from 'node:crypto';
import { AuditLog } from '@/audit/audit-log.entity';
import type { AuditLogDto } from '@/audit/dto/audit-log.dto';
import { applicationBody } from './utils/fixtures';
import {
  api,
  applicationInReview,
  createApplication,
  createTestContext,
  type TestContext,
} from './utils/test-app';

describe('Audit trail (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(() => ctx.app.close());

  it('records creation, submission, risk result, assignment and decision, with who did it', async () => {
    const app = await applicationInReview(ctx, {
      owner: 'sita',
      reviewer: 'ram',
    });
    await api(ctx, 'ram')
      .post(`/applications/${app.id}/decisions`, { decision: 'APPROVE' })
      .expect(200);

    const res = await api(ctx, 'maya')
      .get(`/applications/${app.id}/audit-logs`)
      .expect(200);
    const trail = (res.body.data as AuditLogDto[]).reverse();

    expect(
      trail.map((log) => [log.action, log.actorRole, log.actorId]),
    ).toEqual([
      ['APPLICATION_CREATED', 'SALES', ctx.staff.sita.id],
      ['APPLICATION_SUBMITTED', 'SALES', ctx.staff.sita.id],
      ['RISK_ASSESSMENT_COMPLETED', 'SYSTEM', null],
      ['REVIEWER_ASSIGNED', 'ADMIN', ctx.staff.maya.id],
      ['DECISION_RECORDED', 'REVIEWER', ctx.staff.ram.id],
    ]);
    expect(trail[4].metadata).toMatchObject({
      decision: 'APPROVE',
      from: 'IN_REVIEW',
      to: 'APPROVED',
    });
    expect(res.body.meta).toMatchObject({ total: 5 });
  });

  it('ties each entry to the X-Request-Id of the request that caused it', async () => {
    const requestId = `test-${randomUUID()}`;
    const created = await api(ctx, 'sita')
      .post('/applications', applicationBody())
      .set('X-Request-Id', requestId)
      .expect(201);

    expect(created.headers['x-request-id']).toBe(requestId);
    const log = await ctx.dataSource
      .getRepository(AuditLog)
      .findOneByOrFail({ entityId: created.body.id });
    expect(log.requestId).toBe(requestId);
  });

  it('logs the names of edited fields, never their values or national IDs', async () => {
    const app = await createApplication(ctx, 'sita');
    await api(ctx, 'sita')
      .patch(`/applications/${app.id}`, {
        businessName: 'Secret New Name',
        industry: 'RETAIL',
      })
      .expect(200);

    const logs = await ctx.dataSource
      .getRepository(AuditLog)
      .findBy({ entityId: app.id });
    const updated = logs.find((log) => log.action === 'APPLICATION_UPDATED');

    expect(updated?.metadata).toEqual({
      status: 'DRAFT',
      changedFields: ['businessName', 'industry'],
    });
    const everything = JSON.stringify(logs);
    expect(everything).not.toContain('Secret New Name');
    expect(everything).not.toContain('06789');
  });

  it('is append-only: the database refuses UPDATE and DELETE', async () => {
    const app = await createApplication(ctx, 'sita');

    await expect(
      ctx.dataSource.query(
        `UPDATE audit_logs SET actor_role = 'ADMIN' WHERE entity_id = $1`,
        [app.id],
      ),
    ).rejects.toThrow('audit_logs is append-only: UPDATE is not allowed');
    await expect(
      ctx.dataSource.query(`DELETE FROM audit_logs WHERE entity_id = $1`, [
        app.id,
      ]),
    ).rejects.toThrow('audit_logs is append-only: DELETE is not allowed');
  });

  it('is paginated, newest first', async () => {
    const app = await applicationInReview(ctx);

    const res = await api(ctx, 'maya')
      .get(`/applications/${app.id}/audit-logs?limit=2`)
      .expect(200);

    expect(res.body.meta).toEqual({
      page: 1,
      limit: 2,
      total: 4,
      totalPages: 2,
    });
    expect(res.body.data.map((log: AuditLogDto) => log.action)).toEqual([
      'REVIEWER_ASSIGNED',
      'RISK_ASSESSMENT_COMPLETED',
    ]);
  });

  it('only ADMIN can read it, and an unknown application is 404', async () => {
    const app = await createApplication(ctx, 'sita');

    await api(ctx, 'sita')
      .get(`/applications/${app.id}/audit-logs`)
      .expect(403);
    await api(ctx, 'maya')
      .get(`/applications/${randomUUID()}/audit-logs`)
      .expect(404);
  });
});
