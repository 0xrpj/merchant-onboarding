import { randomUUID } from 'node:crypto';
import type { ApplicationDto } from '@/applications/dto/application-response.dto';
import { MerchantApplication } from '@/applications/entities/merchant-application.entity';
import { MerchantOwner } from '@/applications/entities/merchant-owner.entity';
import { FieldEncryptionService } from '@/crypto/field-encryption.service';
import { applicationBody, ownerBody } from './utils/fixtures';
import {
  api,
  applicationInReview,
  createApplication,
  createTestContext,
  type TestContext,
} from './utils/test-app';

/**
 * Object-level authorization (IDOR / BOLA): a user must never read or change
 * an application they aren't allowed to see, even with its exact ID.
 * See docs/design/access.html for the rules these tests check.
 */
describe('Access control (e2e)', () => {
  let ctx: TestContext;
  let haris: ApplicationDto; // Hari's DRAFT
  let sitas: ApplicationDto; // Sita's, IN_REVIEW, assigned to Ram

  beforeAll(async () => {
    ctx = await createTestContext();
    haris = await createApplication(ctx, 'hari', {
      businessName: 'Hari Hardware',
    });
    sitas = await applicationInReview(ctx, { owner: 'sita', reviewer: 'ram' });
  });

  afterAll(() => ctx.app.close());

  describe("SALES cannot read or change another sales user's application by ID", () => {
    it('GET returns 404, exactly like an ID that does not exist', async () => {
      const theirs = await api(ctx, 'sita')
        .get(`/applications/${haris.id}`)
        .expect(404);
      const missing = await api(ctx, 'sita')
        .get(`/applications/${randomUUID()}`)
        .expect(404);

      expect(theirs.body).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Application not found',
      });
      expect(theirs.body.message).toBe(missing.body.message);
      expect(JSON.stringify(theirs.body)).not.toContain('Hari Hardware');
    });

    it('PATCH returns 404 and changes nothing', async () => {
      await api(ctx, 'sita')
        .patch(`/applications/${haris.id}`, { businessName: 'Taken over' })
        .expect(404);

      const row = await ctx.dataSource
        .getRepository(MerchantApplication)
        .findOneByOrFail({ id: haris.id });
      expect(row.businessName).toBe('Hari Hardware');
    });

    it('submit returns 404 and the application stays DRAFT', async () => {
      await api(ctx, 'sita')
        .post(`/applications/${haris.id}/submit`)
        .expect(404);

      const row = await ctx.dataSource
        .getRepository(MerchantApplication)
        .findOneByOrFail({ id: haris.id });
      expect(row.status).toBe('DRAFT');
    });

    it('the list only contains their own applications, whatever the filters', async () => {
      const plain = await api(ctx, 'sita').get('/applications').expect(200);
      const filtered = await api(ctx, 'sita')
        .get(
          `/applications?assignedReviewerId=${ctx.staff.ram.id}&status=DRAFT,IN_REVIEW`,
        )
        .expect(200);

      for (const res of [plain, filtered]) {
        const ids = (res.body.data as ApplicationDto[]).map((app) => app.id);
        expect(ids).toEqual([sitas.id]);
      }
      const harisList = await api(ctx, 'hari').get('/applications').expect(200);
      expect(harisList.body.data.map((app: ApplicationDto) => app.id)).toEqual([
        haris.id,
      ]);
    });

    it("cannot move another application's owner into their own application", async () => {
      const harisOwner = haris.owners[0];
      const draft = await createApplication(ctx, 'sita');

      const res = await api(ctx, 'sita')
        .patch(`/applications/${draft.id}`, {
          owners: [
            {
              ...ownerBody({ ownershipPercent: 100 }),
              id: harisOwner.id,
              nationalId: undefined,
            },
          ],
        })
        .expect(400);

      expect(res.body.details).toEqual([
        {
          field: 'owners.0.id',
          messages: ['id is not an owner of this application'],
        },
      ]);
      const owner = await ctx.dataSource
        .getRepository(MerchantOwner)
        .findOneByOrFail({ id: harisOwner.id });
      expect(owner.applicationId).toBe(haris.id);
    });
  });

  describe('REVIEWER only sees applications assigned to them', () => {
    it('the assigned reviewer can read it', async () => {
      await api(ctx, 'ram').get(`/applications/${sitas.id}`).expect(200);
    });

    it('another reviewer gets 404 for reading and for deciding', async () => {
      await api(ctx, 'gita').get(`/applications/${sitas.id}`).expect(404);
      await api(ctx, 'gita')
        .post(`/applications/${sitas.id}/decisions`, { decision: 'APPROVE' })
        .expect(404);
    });

    it('their list only has assigned applications', async () => {
      const ram = await api(ctx, 'ram').get('/applications').expect(200);
      const gita = await api(ctx, 'gita').get('/applications').expect(200);

      expect(ram.body.data.map((app: ApplicationDto) => app.id)).toEqual([
        sitas.id,
      ]);
      expect(gita.body.data).toEqual([]);
    });
  });

  describe('roles that can never do an action get 403', () => {
    it.each([
      ['sita', 'post', 'decisions', { decision: 'APPROVE' }],
      ['maya', 'post', 'decisions', { decision: 'APPROVE' }],
      ['sita', 'post', 'assign', { reviewerId: randomUUID() }],
      ['ram', 'post', 'assign', { reviewerId: randomUUID() }],
      ['sita', 'post', 'risk-assessments/retry', {}],
      ['ram', 'post', 'submit', {}],
      ['ram', 'patch', '', { businessName: 'x' }],
      ['sita', 'get', 'audit-logs', undefined],
    ] as const)('%s: %s .../%s', async (who, method, action, body) => {
      const path = `/applications/${sitas.id}${action ? `/${action}` : ''}`;
      const client = api(ctx, who);
      const res =
        method === 'get'
          ? await client.get(path)
          : method === 'patch'
            ? await client.patch(path, body ?? {})
            : await client.post(path, body ?? {});

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('a REVIEWER cannot create applications', async () => {
      await api(ctx, 'ram').post('/applications', {}).expect(403);
    });

    it('the role check comes before input validation (403, not 400)', async () => {
      const res = await api(ctx, 'sita')
        .post(`/applications/${sitas.id}/decisions`, {
          decision: 'NOT_A_DECISION',
        })
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('only ADMIN can list users', async () => {
      await api(ctx, 'sita').get('/users').expect(403);
      await api(ctx, 'maya').get('/users?role=REVIEWER').expect(200);
    });
  });

  describe('need-to-know and mass assignment', () => {
    it('SALES see the risk level but not the score or reasons', async () => {
      const asSales = await api(ctx, 'sita')
        .get(`/applications/${sitas.id}`)
        .expect(200);
      const asAdmin = await api(ctx, 'maya')
        .get(`/applications/${sitas.id}`)
        .expect(200);

      expect(asSales.body.riskAssessments[0]).toMatchObject({
        riskLevel: 'LOW',
      });
      expect(asSales.body.riskAssessments[0]).not.toHaveProperty('riskScore');
      expect(asSales.body.riskAssessments[0]).not.toHaveProperty('reasons');
      expect(asAdmin.body.riskAssessments[0]).toMatchObject({
        riskScore: expect.any(Number),
        reasons: expect.any(Array),
      });
    });

    it.each([
      ['status', 'APPROVED'],
      ['createdById', randomUUID()],
      ['assignedReviewerId', randomUUID()],
      ['riskLevel', 'LOW'],
    ])('a client cannot set "%s" on create or edit', async (field, value) => {
      const draft = await createApplication(ctx, 'sita');

      const created = await api(ctx, 'sita')
        .post('/applications', { ...applicationBody(), [field]: value })
        .expect(400);
      const edited = await api(ctx, 'sita')
        .patch(`/applications/${draft.id}`, { [field]: value })
        .expect(400);

      for (const res of [created, edited]) {
        expect(res.body.details).toContainEqual({
          field,
          messages: [`property ${field} should not exist`],
        });
      }
    });

    it('never returns a full national ID, and stores only ciphertext', async () => {
      const app = await createApplication(ctx, 'sita');
      const body = JSON.stringify(
        await api(ctx, 'sita').get(`/applications/${app.id}`),
      );

      expect(body).not.toContain('00-00-00-06789');
      expect(app.owners[0]).not.toHaveProperty('nationalId');
      expect(app.owners[0]).not.toHaveProperty('nationalIdEncrypted');
      expect(app.owners.map((owner) => owner.nationalIdMasked).sort()).toEqual([
        '•••••1234',
        '•••••6789',
      ]);

      const rows = await ctx.dataSource
        .getRepository(MerchantOwner)
        .findBy({ applicationId: app.id });
      const encryption = ctx.app.get(FieldEncryptionService);
      const decrypted = rows.map((row) => {
        expect(row.nationalIdEncrypted).toMatch(/^v1:/);
        expect(row.nationalIdEncrypted).not.toContain('00-00-00');
        return encryption.decrypt(row.nationalIdEncrypted);
      });
      expect(decrypted.sort()).toEqual(['00-00-00-01234', '00-00-00-06789']);
    });

    it('every application endpoint needs a token (401)', async () => {
      await api(ctx).get('/applications').expect(401);
      await api(ctx).get(`/applications/${sitas.id}`).expect(401);
      await api(ctx).post('/applications', {}).expect(401);
    });
  });
});
