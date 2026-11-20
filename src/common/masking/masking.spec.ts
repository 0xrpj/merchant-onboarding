import {
  lastFour,
  maskEmail,
  maskNationalId,
  maskPhone,
  redactMetadata,
} from '@/common/masking/masking';

describe('masking', () => {
  it('keeps only the last four letters or digits of an ID', () => {
    expect(lastFour('00-00-00-06789')).toBe('6789');
    expect(maskNationalId(lastFour('00-00-00-06789'))).toBe('•••••6789');
  });

  it('masks an email down to its first letter and domain', () => {
    expect(maskEmail('owner.a@himalbrew.example')).toBe(
      'o***@himalbrew.example',
    );
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('masks a phone number except its last four digits', () => {
    expect(maskPhone('+9779800000001')).toBe('**********0001');
    expect(maskPhone('123')).toBe('****');
  });

  it('drops sensitive keys from audit metadata, also when nested', () => {
    expect(
      redactMetadata({
        changedFields: ['owners'],
        password: 'x',
        refreshToken: 'y',
        nested: { nationalId: 'z', status: 'DRAFT' },
      }),
    ).toEqual({ changedFields: ['owners'], nested: { status: 'DRAFT' } });
  });
});
