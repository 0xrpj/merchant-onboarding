import { Transform } from 'class-transformer';

/**
 * Query strings are text: "true"/"false" become real booleans.
 * Anything else is left alone, so @IsBoolean() rejects it (e.g. "yes").
 */
export const ToBoolean = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );
