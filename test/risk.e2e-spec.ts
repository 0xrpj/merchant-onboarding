import { getQueueToken } from '@nestjs/bullmq';
import { randomUUID } from 'node:crypto';
import type { Queue } from 'bullmq';
import { AuditLog } from '@/audit/audit-log.entity';
import { RiskAssessment } from '@/risk/risk-assessment.entity';
import { RiskAssessmentService } from '@/risk/risk-assessment.service';
import { RISK_QUEUE, type RiskJobData } from '@/risk/risk-queue.constants';
import { RiskQueueService } from '@/risk/risk-queue.service';
import { FakeKybProvider } from './utils/fake-kyb.provider';
import {
  api,
  assignReviewer,
  createApplication,
  createTestContext,
  submitAndWaitForReview,
  type TestContext,
  waitForApplication,
} from './utils/test-app';

/**
 * The background risk check (docs/design/flows.html): retries with backoff,
 * FAILED after the last attempt, ADMIN retry, and idempotency at all three
 * levels (queue job ID, worker check, row lock + unique constraint).
 * Tests run with RISK_JOB_ATTEMPTS=3 and a 50 ms backoff (test/test-env.ts).
 */
describe('Risk check (e2e)', () => {
  const kyb = new FakeKybProvider();
  let ctx: TestContext;

  const assessmentOf = (applicationId: string, submissionNumber = 1) =>
    ctx.dataSource
      .getRepository(RiskAssessment)
      .findOneByOrFail({ applicationId, submissionNumber });

  const auditActions = async (applicationId: string) =>
    (
      await ctx.dataSource.getRepository(AuditLog).find({
        where: { entityId: applicationId },
        order: { createdAt: 'ASC' },
      })
    ).map((log) => log.action);

  beforeAll(async () => {
    ctx = await createTestContext({ kyb });
  });

  beforeEach(() => kyb.reset());

  afterAll(() => ctx.app.close());

  describe('when the provider keeps failing', () => {
    let id: string;

    beforeAll(async () => {
      kyb.failNext = Infinity;
      id = (await createApplication(ctx, 'sita')).id;
      await api(ctx, 'sita').post(`/applications/${id}/submit`).expect(202);
      await waitForApplication(ctx, id, (app) => app.riskStatus === 'FAILED');
    });

    it('retries, then marks the check FAILED; the application stays SUBMITTED', async () => {
      const app = await api(ctx, 'maya').get(`/applications/${id}`).expect(200);
      const assessment = await assessmentOf(id);

      expect(app.body).toMatchObject({
        status: 'SUBMITTED',
        riskStatus: 'FAILED',
      });
      expect(assessment).toMatchObject({
        status: 'FAILED',
        attempts: 3,
        lastError: 'Fake provider failure',
      });
      expect(await auditActions(id)).toEqual([
        'APPLICATION_CREATED',
        'APPLICATION_SUBMITTED',
        'RISK_ASSESSMENT_FAILED',
      ]);
    });

    it('the assigned reviewer cannot decide while it is SUBMITTED (409)', async () => {
      await assignReviewer(ctx, id, 'ram');

      const res = await api(ctx, 'ram')
        .post(`/applications/${id}/decisions`, { decision: 'APPROVE' })
        .expect(409);

      expect(res.body.message).toBe(
        'Cannot approve an application in SUBMITTED state',
      );
    });

    it('ADMIN retries it with a new job, and this time it succeeds', async () => {
      kyb.failNext = 0;

      const res = await api(ctx, 'maya')
        .post(`/applications/${id}/risk-assessments/retry`)
        .expect(202);
      expect(res.body.riskStatus).toBe('PENDING');

      const app = await waitForApplication(
        ctx,
        id,
        (a) => a.status === 'IN_REVIEW',
      );
      expect(app.riskStatus).toBe('COMPLETED');
      expect(await assessmentOf(id)).toMatchObject({
        status: 'COMPLETED',
        attempts: 4,
        provider: 'FAKE_KYB',
      });
      expect(await auditActions(id)).toEqual(
        expect.arrayContaining([
          'RISK_ASSESSMENT_RETRIED',
          'RISK_ASSESSMENT_COMPLETED',
        ]),
      );
    });

    it('a check that is not FAILED cannot be retried (409)', async () => {
      const res = await api(ctx, 'maya')
        .post(`/applications/${id}/risk-assessments/retry`)
        .expect(409);
      expect(res.body.message).toBe(
        'Cannot retry the risk check of an application in IN_REVIEW state',
      );
    });
  });

  it('a check still PENDING cannot be retried (409)', async () => {
    kyb.delayMs = 1_000;
    const { id } = await createApplication(ctx, 'sita');
    await api(ctx, 'sita').post(`/applications/${id}/submit`).expect(202);

    const res = await api(ctx, 'maya')
      .post(`/applications/${id}/risk-assessments/retry`)
      .expect(409);

    expect(res.body.message).toBe('Cannot retry a risk check that is PENDING');
    await waitForApplication(ctx, id, (app) => app.status === 'IN_REVIEW');
  });

  it('a temporary failure is retried automatically after a backoff', async () => {
    kyb.failNext = 1;
    const { id } = await createApplication(ctx, 'sita');

    await submitAndWaitForReview(ctx, 'sita', id);

    expect(kyb.calls).toBe(2);
    expect(await assessmentOf(id)).toMatchObject({
      status: 'COMPLETED',
      attempts: 2,
      lastError: 'Fake provider failure',
    });
  });

  describe('idempotency: running a job twice has the effect of running it once', () => {
    it('worker level: a submission that already has a result is skipped', async () => {
      const { id } = await createApplication(ctx, 'sita');
      await submitAndWaitForReview(ctx, 'sita', id);
      const callsBefore = kyb.calls;

      const outcome = await ctx.app
        .get(RiskAssessmentService)
        .run({ applicationId: id, submissionNumber: 1 }, true);

      expect(outcome).toBe('DUPLICATE');
      expect(kyb.calls).toBe(callsBefore);
      const completed = (await auditActions(id)).filter(
        (action) => action === 'RISK_ASSESSMENT_COMPLETED',
      );
      expect(completed).toHaveLength(1);
    });

    it('row lock: three runs at the same moment save one result', async () => {
      kyb.delayMs = 300;
      const { id } = await createApplication(ctx, 'sita');
      const job: RiskJobData = { applicationId: id, submissionNumber: 1 };
      const service = ctx.app.get(RiskAssessmentService);

      // The queued job plus two direct runs, all waiting on the slow provider together.
      await api(ctx, 'sita').post(`/applications/${id}/submit`).expect(202);
      const outcomes = await Promise.all([
        service.run(job, true),
        service.run(job, true),
      ]);
      await waitForApplication(ctx, id, (app) => app.status === 'IN_REVIEW');

      expect(
        outcomes.filter((o) => o === 'COMPLETED').length,
      ).toBeLessThanOrEqual(1);
      expect(
        outcomes.every((o) => o === 'COMPLETED' || o === 'DUPLICATE'),
      ).toBe(true);
      expect((await assessmentOf(id)).attempts).toBe(1);
      const completed = (await auditActions(id)).filter(
        (action) => action === 'RISK_ASSESSMENT_COMPLETED',
      );
      expect(completed).toHaveLength(1);
    });

    it('stale job: a job for a submission that is not current changes nothing', async () => {
      const { id } = await createApplication(ctx, 'sita');
      await submitAndWaitForReview(ctx, 'sita', id);

      const outcome = await ctx.app
        .get(RiskAssessmentService)
        .run({ applicationId: id, submissionNumber: 7 }, true);

      expect(outcome).toBe('STALE');
    });

    it('queue level: a second job with the same ID is ignored by BullMQ', async () => {
      const queue = ctx.app.get<Queue<RiskJobData>>(getQueueToken(RISK_QUEUE));
      const jobId = `risk-${randomUUID()}-1`;
      // An application that doesn't exist: the worker will just skip it (STALE).
      const applicationId = randomUUID();

      await ctx.app
        .get(RiskQueueService)
        .enqueue({ applicationId, submissionNumber: 1 }, jobId);
      await ctx.app
        .get(RiskQueueService)
        .enqueue({ applicationId, submissionNumber: 99 }, jobId);

      const job = await queue.getJob(jobId);
      expect(job?.data.submissionNumber).toBe(1);
    });

    it('database level: one risk_assessments row per submission', async () => {
      const { id } = await createApplication(ctx, 'sita');
      await submitAndWaitForReview(ctx, 'sita', id);

      await expect(
        ctx.dataSource.getRepository(RiskAssessment).insert({
          applicationId: id,
          submissionNumber: 1,
          provider: 'FAKE_KYB',
        }),
      ).rejects.toThrow(/UQ_risk_assessments_application_submission/);
    });
  });
});

describe('Risk check when Redis is unavailable (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext({
      override: (builder) =>
        builder.overrideProvider(RiskQueueService).useValue({
          enqueue: () => Promise.reject(new Error('Redis is down')),
          ping: () => Promise.reject(new Error('Redis is down')),
        }),
    });
  });

  afterAll(() => ctx.app.close());

  it('the submit still succeeds (202) and the check is FAILED, ready for an ADMIN retry', async () => {
    const { id } = await createApplication(ctx, 'sita');

    const res = await api(ctx, 'sita')
      .post(`/applications/${id}/submit`)
      .expect(202);

    expect(res.body).toMatchObject({
      status: 'SUBMITTED',
      riskStatus: 'FAILED',
    });
    const logs = await ctx.dataSource.getRepository(AuditLog).findBy({
      entityId: id,
      action: 'RISK_ASSESSMENT_FAILED' as AuditLog['action'],
    });
    expect(logs[0]?.metadata).toMatchObject({ reason: 'QUEUE_UNAVAILABLE' });
  });

  it('/health reports Redis down with 503', async () => {
    const res = await api(ctx).get('/health').expect(503);
    expect(res.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});
