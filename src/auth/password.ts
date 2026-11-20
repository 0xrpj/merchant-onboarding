import bcrypt from 'bcryptjs';

export const hashPassword = (plain: string, rounds: number): Promise<string> =>
  bcrypt.hash(plain, rounds);

/** Constant-time comparison, done by bcrypt. */
export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);
