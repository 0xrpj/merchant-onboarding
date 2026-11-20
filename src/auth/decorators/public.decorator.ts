import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skips the global JWT guard. Every route needs a valid token unless it has this. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
