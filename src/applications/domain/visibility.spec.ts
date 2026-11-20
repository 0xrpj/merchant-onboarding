import { visibilityScope } from '@/applications/domain/visibility';
import { UserRole } from '@/users/user-role.enum';

describe('visibilityScope', () => {
  const id = '6a1f3c2e-0000-4000-8000-000000000001';

  it('ADMIN sees every application', () => {
    expect(visibilityScope({ id, role: UserRole.ADMIN })).toEqual({});
  });

  it('SALES sees only applications they created', () => {
    expect(visibilityScope({ id, role: UserRole.SALES })).toEqual({
      createdById: id,
    });
  });

  it('REVIEWER sees only applications assigned to them', () => {
    expect(visibilityScope({ id, role: UserRole.REVIEWER })).toEqual({
      assignedReviewerId: id,
    });
  });

  it('refuses an unknown role instead of showing everything', () => {
    expect(() => visibilityScope({ id, role: 'AUDITOR' as UserRole })).toThrow(
      'No visibility rule for role AUDITOR',
    );
  });
});
