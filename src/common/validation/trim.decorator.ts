import { Transform } from 'class-transformer';

/**
 * Removes leading and trailing spaces before validation, so "  " counts as empty.
 * Anything that isn't a string passes through and then fails @IsString().
 */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
