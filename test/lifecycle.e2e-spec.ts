import { randomUUID } from 'node:crypto';
import type { ApplicationDto } from '@/applications/dto/application-response.dto';
import { ReviewDecision } from '@/applications/entities/review-decision.entity';
import { RiskAssessment } from '@/risk/risk-assessment.entity';
import { highRiskOverrides } from './utils/fixtures';
import {
  api,
  applicationInReview,
  assignReviewer,
  createApplication,
  createTestContext,
  submitAndWaitForReview,
  type TestContext,
  waitForApplication,
} from './utils/test-app';

/** The state machine from docs/design/lifecycle.html, end to end. */
describe('Application lifecycle (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(() => ctx.app.close());

  it('happy path: DRAFT -> SUBMITTED -> IN_REVIEW -> APPROVED', async () => {
    const draft = await createApplication(ctx, 'sita');
    expect(draft).toMatchObject({
      status: 'DRAFT',
      riskStatus: 'NOT_STARTED',
      riskLevel: null,
      submissionCount: 0,
      createdBy: { id: ctx.staff.sita.id, fullName: 'Sita Sales' },
      assignedReviewer: null,
    });

    const submitted = await api(ctx, 'sita')
      .post(`/applications/${draft.id}/submit`)
      .expect(202);
    expect(submitted.body).toMatchObject({
      status: 'SUBMITTED',
      riskStatus: 'PENDING',
      submissionCount: 1,
    });
    expect(submitted.body.submittedAt).toEqual(expect.any(String));

    const reviewed = await waitForApplication(
      ctx,
      draft.id,
      (app) => app.status === 'IN_REVIEW',
    );
    expect(reviewed).toMatchObject({
      riskStatus: 'COMPLETED',
      riskLevel: 'LOW',
    });

    await assignReviewer(ctx, draft.id, 'ram');
    const approved = await api(ctx, 'ram')
      .post(`/applications/${draft.id}/decisions`, { decision: 'APPROVE' })
      .expect(200);

    expect(approved.body).toMatchObject({ status: 'APPROVED' });
    expect(approved.body.decidedAt).toEqual(expect.any(String));
    expect(approved.body.decisions).toEqual([
      expect.objectContaining({
        decision: 'APPROVE',
        note: null,
        submissionNumber: 1,
        riskLevelAtDecision: 'LOW',
        reviewer: { id: ctx.staff.ram.id, fullName: 'Ram Reviewer' },
      }),
    ]);
  });

  it('request-info loop: INFO_REQUESTED -> edit -> resubmit -> new risk check -> REJECTED', async () => {
    const app = await applicationInReview(ctx);

    const asked = await api(ctx, 'ram')
      .post(`/applications/${app.id}/decisions`, {
        decision: 'REQUEST_INFO',
        note: "Registration number doesn't match the registry",
      })
      .expect(200);
    expect(asked.body.status).toBe('INFO_REQUESTED');
    expect(asked.body.decidedAt).toBeNull();

    // Sita reads Ram's note and fixes the data.
    const seen = await api(ctx, 'sita')
      .get(`/applications/${app.id}`)
      .expect(200);
    expect(seen.body.decisions[0].note).toBe(
      "Registration number doesn't match the registry",
    );
    await api(ctx, 'sita')
      .patch(`/applications/${app.id}`, { registrationNumber: 'REG-112' })
      .expect(200);

    const resubmitted = await submitAndWaitForReview(ctx, 'sita', app.id);
    expect(resubmitted.submissionCount).toBe(2);
    expect(resubmitted.riskAssessments.map((a) => a.submissionNumber)).toEqual([
      1, 2,
    ]);
    // The reviewer stays assigned across the resubmission.
    expect(resubmitted.assignedReviewer?.id).toBe(ctx.staff.ram.id);

    const rejected = await api(ctx, 'ram')
      .post(`/applications/${app.id}/decisions`, {
        decision: 'REJECT',
        note: 'Still does not match',
      })
      .expect(200);
    expect(rejected.body.status).toBe('REJECTED');
    expect(
      rejected.body.decisions.map(
        (d: { submissionNumber: number }) => d.submissionNumber,
      ),
    ).toEqual([1, 2]);
  });

  describe('invalid transitions are refused with 409', () => {
    it('edit and submit again while SUBMITTED', async () => {
      const app = await createApplication(ctx, 'sita');
      await api(ctx, 'sita').post(`/applications/${app.id}/submit`).expect(202);

      const edit = await api(ctx, 'sita')
        .patch(`/applications/${app.id}`, { businessName: 'New name' })
        .expect(409);
      const submit = await api(ctx, 'sita')
        .post(`/applications/${app.id}/submit`)
        .expect(409);

      expect(edit.body).toMatchObject({
        code: 'INVALID_STATE_TRANSITION',
        message: expect.stringMatching(
          /^Cannot edit an application in (SUBMITTED|IN_REVIEW) state$/,
        ),
      });
      expect(submit.body.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('assign a reviewer to a DRAFT', async () => {
      const app = await createApplication(ctx, 'sita');

      const res = await api(ctx, 'maya')
        .post(`/applications/${app.id}/assign`, {
          reviewerId: ctx.staff.ram.id,
        })
        .expect(409);

      expect(res.body.message).toBe(
        'Cannot assign a reviewer to an application in DRAFT state',
      );
    });

    // "Decide while SUBMITTED" is in risk.e2e-spec.ts, where a failing provider
    // keeps the application SUBMITTED for as long as the test needs.

    it('nothing at all is allowed on a final application', async () => {
      const app = await applicationInReview(ctx);
      await api(ctx, 'ram')
        .post(`/applications/${app.id}/decisions`, { decision: 'APPROVE' })
        .expect(200);

      const attempts = await Promise.all([
        api(ctx, 'sita').patch(`/applications/${app.id}`, {
          businessName: 'x',
        }),
        api(ctx, 'sita').post(`/applications/${app.id}/submit`),
        api(ctx, 'maya').post(`/applications/${app.id}/assign`, {
          reviewerId: ctx.staff.gita.id,
        }),
        api(ctx, 'ram').post(`/applications/${app.id}/decisions`, {
          decision: 'REJECT',
          note: 'x',
        }),
        api(ctx, 'maya').post(`/applications/${app.id}/risk-assessments/retry`),
      ]);

      expect(attempts.map((res) => res.status)).toEqual([
        409, 409, 409, 409, 409,
      ]);
      expect(attempts[3].body.message).toBe(
        'Cannot reject an application in APPROVED state',
      );
    });
  });

  describe('notes', () => {
    it.each(['REJECT', 'REQUEST_INFO'])(
      '%s without a note is 400 NOTE_REQUIRED',
      async (decision) => {
        const app = await applicationInReview(ctx);

        const res = await api(ctx, 'ram')
          .post(`/applications/${app.id}/decisions`, { decision, note: '   ' })
          .expect(400);

        expect(res.body.code).toBe('NOTE_REQUIRED');
      },
    );

    it('approving a HIGH-risk application needs a note; a LOW one does not', async () => {
      const high = await applicationInReview(ctx, {
        overrides: highRiskOverrides,
      });
      expect(high.riskLevel).toBe('HIGH');

      await api(ctx, 'ram')
        .post(`/applications/${high.id}/decisions`, { decision: 'APPROVE' })
        .expect(400);
      const approved = await api(ctx, 'ram')
        .post(`/applications/${high.id}/decisions`, {
          decision: 'APPROVE',
          note: 'Volume confirmed with bank statements',
        })
        .expect(200);

      expect(approved.body.decisions[0]).toMatchObject({
        riskLevelAtDecision: 'HIGH',
        note: 'Volume confirmed with bank statements',
      });
    });
  });

  describe('assigning reviewers', () => {
    it.each([
      ['an inactive reviewer', 'formerReviewer'],
      ['a SALES user', 'sita'],
      ['an ADMIN', 'maya'],
    ] as const)('refuses %s with 400 INVALID_REVIEWER', async (_label, who) => {
      const app = await applicationInReview(ctx);

      const res = await api(ctx, 'maya')
        .post(`/applications/${app.id}/assign`, {
          reviewerId: ctx.staff[who].id,
        })
        .expect(400);

      expect(res.body.code).toBe('INVALID_REVIEWER');
    });

    it('refuses an ID that is not a user', async () => {
      const app = await applicationInReview(ctx);
      await api(ctx, 'maya')
        .post(`/applications/${app.id}/assign`, { reviewerId: randomUUID() })
        .expect(400);
    });

    it('an unassigned application cannot be decided by any reviewer', async () => {
      const app = await createApplication(ctx, 'sita');
      await submitAndWaitForReview(ctx, 'sita', app.id);

      await api(ctx, 'ram')
        .post(`/applications/${app.id}/decisions`, { decision: 'APPROVE' })
        .expect(404);
    });

    it('reassigning moves the decision to the new reviewer', async () => {
      const app = await applicationInReview(ctx, { reviewer: 'ram' });
      await assignReviewer(ctx, app.id, 'gita');

      await api(ctx, 'ram')
        .post(`/applications/${app.id}/decisions`, { decision: 'APPROVE' })
        .expect(404);
      await api(ctx, 'gita')
        .post(`/applications/${app.id}/decisions`, { decision: 'APPROVE' })
        .expect(200);
    });
  });

  describe('simultaneous actions: only one wins', () => {
    it('two decisions at the same moment: one 200, one 409, one decision row', async () => {
      const app = await applicationInReview(ctx);

      const results = await Promise.all([
        api(ctx, 'ram').post(`/applications/${app.id}/decisions`, {
          decision: 'APPROVE',
        }),
        api(ctx, 'ram').post(`/applications/${app.id}/decisions`, {
          decision: 'REJECT',
          note: 'Changed my mind',
        }),
      ]);

      expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      const decisions = await ctx.dataSource
        .getRepository(ReviewDecision)
        .findBy({ applicationId: app.id });
      expect(decisions).toHaveLength(1);
    });

    it('a double-clicked submit: one 202, one 409, one risk check', async () => {
      const app = await createApplication(ctx, 'sita');

      const results = await Promise.all([
        api(ctx, 'sita').post(`/applications/${app.id}/submit`),
        api(ctx, 'sita').post(`/applications/${app.id}/submit`),
      ]);

      expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([
        202, 409,
      ]);
      const assessments = await ctx.dataSource
        .getRepository(RiskAssessment)
        .findBy({ applicationId: app.id });
      expect(assessments).toHaveLength(1);
    });
  });

  describe('listing', () => {
    let hariIds: string[];

    beforeAll(async () => {
      // Hari's applications only, so this block knows exactly what to expect.
      const first = await createApplication(ctx, 'hari', {
        businessName: 'Hari One',
      });
      const second = await createApplication(ctx, 'hari', {
        businessName: 'Hari Two',
      });
      const third = await createApplication(ctx, 'hari', {
        businessName: 'Hari Three',
        ...highRiskOverrides,
      });
      await submitAndWaitForReview(ctx, 'hari', third.id);
      hariIds = [first.id, second.id, third.id];
    });

    it('pages newest first, with meta', async () => {
      const page1 = await api(ctx, 'hari')
        .get('/applications?limit=2&page=1')
        .expect(200);
      const page2 = await api(ctx, 'hari')
        .get('/applications?limit=2&page=2')
        .expect(200);

      expect(page1.body.meta).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
      const ids = [...page1.body.data, ...page2.body.data].map(
        (app: ApplicationDto) => app.id,
      );
      expect(ids).toEqual([...hariIds].reverse());
    });

    it('list items are summaries without owners or risk details', async () => {
      const res = await api(ctx, 'hari')
        .get('/applications?limit=1')
        .expect(200);

      expect(res.body.data[0]).not.toHaveProperty('owners');
      expect(res.body.data[0]).not.toHaveProperty('riskAssessments');
    });

    it('filters by status, risk level and assignment', async () => {
      const drafts = await api(ctx, 'hari')
        .get('/applications?status=DRAFT')
        .expect(200);
      const high = await api(ctx, 'hari')
        .get('/applications?riskLevel=HIGH')
        .expect(200);
      const unassignedInReview = await api(ctx, 'hari')
        .get('/applications?status=IN_REVIEW&unassigned=true')
        .expect(200);

      expect(drafts.body.meta.total).toBe(2);
      expect(
        high.body.data.map((app: ApplicationDto) => app.businessName),
      ).toEqual(['Hari Three']);
      expect(unassignedInReview.body.meta.total).toBe(1);
    });

    it.each([
      'limit=101',
      'page=0',
      'status=NOPE',
      'unassigned=yes',
      'riskLevel=low',
    ])('rejects ?%s with 400', async (query) => {
      const res = await api(ctx, 'hari')
        .get(`/applications?${query}`)
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });
});
