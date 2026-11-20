import {
  SnakeNamingStrategy,
  toSnakeCase,
} from '@/database/snake-naming.strategy';

describe('toSnakeCase', () => {
  it.each([
    ['createdAt', 'created_at'],
    ['riskScore', 'risk_score'],
    ['nationalIdLast4', 'national_id_last4'],
    ['HTTPStatus', 'http_status'],
    ['status', 'status'],
  ])('%s -> %s', (input, expected) => {
    expect(toSnakeCase(input)).toBe(expected);
  });
});

describe('SnakeNamingStrategy', () => {
  const strategy = new SnakeNamingStrategy();

  it('turns property names into snake_case columns', () => {
    expect(strategy.columnName('submittedAt', undefined, [])).toBe(
      'submitted_at',
    );
  });

  it('keeps a column name given explicitly', () => {
    expect(strategy.columnName('submittedAt', 'sent_at', [])).toBe('sent_at');
  });

  it('names foreign key columns <relation>_<column>', () => {
    expect(strategy.joinColumnName('assignedReviewer', 'id')).toBe(
      'assigned_reviewer_id',
    );
  });
});
