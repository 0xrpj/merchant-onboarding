import type { ValidationError } from '@nestjs/common';
import { flattenValidationErrors } from '@/common/errors/validation-errors';

describe('flattenValidationErrors', () => {
  it('returns one entry per invalid field', () => {
    const errors: ValidationError[] = [
      {
        property: 'businessName',
        constraints: { isString: 'businessName must be a string' },
        children: [],
      },
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'businessName', messages: ['businessName must be a string'] },
    ]);
  });

  it('uses dotted paths for nested fields', () => {
    const errors: ValidationError[] = [
      {
        property: 'owners',
        children: [
          {
            property: '0',
            children: [
              {
                property: 'fullName',
                constraints: {
                  isNotEmpty: 'fullName should not be empty',
                  maxLength: 'fullName must be shorter than 200 characters',
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      {
        field: 'owners.0.fullName',
        messages: [
          'fullName should not be empty',
          'fullName must be shorter than 200 characters',
        ],
      },
    ]);
  });
});
