import type { ApplicationDto } from '@/applications/dto/application-response.dto';
import { MerchantOwner } from '@/applications/entities/merchant-owner.entity';
import { FieldEncryptionService } from '@/crypto/field-encryption.service';
import { ownerBody, processingBody, secondOwnerBody } from './utils/fixtures';
import {
  api,
  createApplication,
  createTestContext,
  type TestContext,
} from './utils/test-app';

/** PATCH sends the whole owners list, matched by id (docs/design/api.html). */
describe('Editing owners (e2e)', () => {
  let ctx: TestContext;

  /** An owner from a response, turned back into request shape (without nationalId). */
  const asInput = (owner: ApplicationDto['owners'][number]) => ({
    id: owner.id,
    fullName: owner.fullName,
    email: owner.email,
    phone: owner.phone,
    ownershipPercent: owner.ownershipPercent,
    isPrimaryContact: owner.isPrimaryContact,
  });

  const patchOwners = (id: string, owners: object[]) =>
    api(ctx, 'sita').patch(`/applications/${id}`, { owners });

  const byName = (app: ApplicationDto, name: string) => {
    const owner = app.owners.find((o) => o.fullName === name);
    if (!owner) throw new Error(`No owner ${name}`);
    return owner;
  };

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(() => ctx.app.close());

  it('updates an owner and keeps the stored national ID when none is sent', async () => {
    const app = await createApplication(ctx, 'sita');
    const a = byName(app, 'Owner A');
    const b = byName(app, 'Owner B');

    const res = await patchOwners(app.id, [
      { ...asInput(a), fullName: 'Owner A Renamed' },
      asInput(b),
    ]).expect(200);

    const renamed = byName(res.body, 'Owner A Renamed');
    expect(renamed.id).toBe(a.id);
    expect(renamed.nationalIdMasked).toBe('•••••6789');
  });

  it('replaces the national ID when a new one is sent (encrypted again)', async () => {
    const app = await createApplication(ctx, 'sita');
    const a = byName(app, 'Owner A');

    const res = await patchOwners(app.id, [
      { ...asInput(a), nationalId: '99-88-77-05555' },
      asInput(byName(app, 'Owner B')),
    ]).expect(200);

    expect(byName(res.body, 'Owner A').nationalIdMasked).toBe('•••••5555');
    const row = await ctx.dataSource
      .getRepository(MerchantOwner)
      .findOneByOrFail({ id: a.id });
    expect(
      ctx.app.get(FieldEncryptionService).decrypt(row.nationalIdEncrypted),
    ).toBe('99-88-77-05555');
  });

  it('adds owners without an id and removes owners left out', async () => {
    const app = await createApplication(ctx, 'sita');
    const a = byName(app, 'Owner A');

    const res = await patchOwners(app.id, [
      { ...asInput(a), ownershipPercent: 50 },
      secondOwnerBody({
        fullName: 'Owner C',
        ownershipPercent: 50,
        nationalId: '12-34-56-07777',
      }),
    ]).expect(200);

    expect(
      res.body.owners.map((o: { fullName: string }) => o.fullName).sort(),
    ).toEqual(['Owner A', 'Owner C']);
    const rows = await ctx.dataSource
      .getRepository(MerchantOwner)
      .findBy({ applicationId: app.id });
    expect(rows).toHaveLength(2);
  });

  it('can move the primary contact from one owner to another', async () => {
    const app = await createApplication(ctx, 'sita');

    const res = await patchOwners(app.id, [
      { ...asInput(byName(app, 'Owner A')), isPrimaryContact: false },
      { ...asInput(byName(app, 'Owner B')), isPrimaryContact: true },
    ]).expect(200);

    expect(byName(res.body, 'Owner B').isPrimaryContact).toBe(true);
    expect(byName(res.body, 'Owner A').isPrimaryContact).toBe(false);
  });

  describe('rejects an invalid owner list with 400', () => {
    let app: ApplicationDto;

    beforeAll(async () => {
      app = await createApplication(ctx, 'sita');
    });

    const expectInvalid = async (
      owners: object[],
      field: string,
      message: string | RegExp,
    ) => {
      const res = await patchOwners(app.id, owners).expect(400);
      const detail = (
        res.body.details as { field: string; messages: string[] }[]
      ).find((d) => d.field === field);
      expect(detail?.messages).toContainEqual(
        typeof message === 'string' ? message : expect.stringMatching(message),
      );
    };

    it('a new owner without a national ID', () =>
      expectInvalid(
        [
          asInput(byName(app, 'Owner A')),
          { ...secondOwnerBody(), nationalId: undefined },
        ],
        'owners.1.nationalId',
        /nationalId/,
      ));

    it('the same id twice', () =>
      expectInvalid(
        [
          asInput(byName(app, 'Owner A')),
          { ...asInput(byName(app, 'Owner A')), isPrimaryContact: false },
        ],
        'owners.1.id',
        'id is listed twice',
      ));

    it('more than 100% in total', () =>
      expectInvalid(
        [
          { ...asInput(byName(app, 'Owner A')), ownershipPercent: 70 },
          asInput(byName(app, 'Owner B')),
        ],
        'owners',
        "Total ownership is 110%, it can't be more than 100%",
      ));

    it('no primary contact, or two', async () => {
      await expectInvalid(
        [
          { ...asInput(byName(app, 'Owner A')), isPrimaryContact: false },
          asInput(byName(app, 'Owner B')),
        ],
        'owners',
        'Exactly one owner must be the primary contact (got 0)',
      );
      await expectInvalid(
        [
          asInput(byName(app, 'Owner A')),
          { ...asInput(byName(app, 'Owner B')), isPrimaryContact: true },
        ],
        'owners',
        'Exactly one owner must be the primary contact (got 2)',
      );
    });

    it('more than 10 owners, or none', async () => {
      const eleven = Array.from({ length: 11 }, (_, i) =>
        ownerBody({ isPrimaryContact: i === 0, ownershipPercent: 5 }),
      );
      await expectInvalid(
        eleven,
        'owners',
        'owners must contain no more than 10 elements',
      );
      await expectInvalid(
        [],
        'owners',
        'owners must contain at least 1 elements',
      );
    });

    it('the stored list is unchanged after a rejected edit', async () => {
      const after = await api(ctx, 'sita')
        .get(`/applications/${app.id}`)
        .expect(200);
      expect(after.body.owners).toEqual(app.owners);
    });
  });

  describe('other fields', () => {
    it('processing is replaced as a whole group', async () => {
      const app = await createApplication(ctx, 'sita');

      const res = await api(ctx, 'sita')
        .patch(`/applications/${app.id}`, {
          processing: processingBody({ channels: ['ECOMMERCE', 'RECURRING'] }),
        })
        .expect(200);
      expect(res.body.processing.channels).toEqual(['ECOMMERCE', 'RECURRING']);

      const partial = await api(ctx, 'sita')
        .patch(`/applications/${app.id}`, {
          processing: { channels: ['ECOMMERCE'] },
        })
        .expect(400);
      expect(
        partial.body.details.map((d: { field: string }) => d.field),
      ).toEqual(
        expect.arrayContaining([
          'processing.expectedMonthlyVolumeMinor',
          'processing.averageTransactionMinor',
        ]),
      );
    });

    it.each([
      ['businessName', null],
      ['businessName', '   '],
      ['industry', 'CASINO'],
      ['processing', { ...processingBody(), expectedMonthlyVolumeMinor: 12.5 }],
      ['processing', { ...processingBody(), channels: [] }],
    ])('rejects %s = %j', async (field, value) => {
      const app = await createApplication(ctx, 'sita');
      const res = await api(ctx, 'sita')
        .patch(`/applications/${app.id}`, { [field]: value })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });
});
