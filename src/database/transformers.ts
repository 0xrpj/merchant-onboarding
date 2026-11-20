import type { ValueTransformer } from 'typeorm';

/**
 * Postgres returns bigint as a string, because it can hold numbers larger than
 * JavaScript can represent exactly (above 2^53). Our amounts in paisa stay far
 * below that, so they become numbers, but a value that would lose precision
 * throws instead of silently changing.
 */
export const bigintToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null): number | null => {
    if (value === null) {
      return null;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error('bigint value is too large to be a JavaScript number');
    }
    return parsed;
  },
};

/** Postgres returns numeric(5,2) as a string such as "60.00". */
export const numericToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null): number | null =>
    value === null ? null : Number(value),
};
