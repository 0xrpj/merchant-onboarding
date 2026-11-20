/**
 * Masking for personal data that may be shown or logged.
 * The rule: show just enough to recognise the value, never enough to use it.
 */

/** "00-00-00-06789" -> "6789". Only letters and digits count. */
export const lastFour = (value: string): string =>
  value.replace(/[^0-9A-Za-z]/g, '').slice(-4);

/** "6789" -> "•••••6789" */
export const maskNationalId = (last4: string): string => `•••••${last4}`;

/** "owner.a@himalbrew.example" -> "o***@himalbrew.example" */
export const maskEmail = (email: string): string => {
  const at = email.lastIndexOf('@');
  if (at < 1) {
    return '***';
  }
  return `${email[0]}***${email.slice(at)}`;
};

/** "+9779800000001" -> "**********0001" */
export const maskPhone = (phone: string): string =>
  phone.length <= 4
    ? '****'
    : `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;

// Keys whose values must never be stored in logs or audit metadata.
const SENSITIVE_KEY = /password|token|secret|national_?id|authorization/i;

/**
 * Defence in depth for audit metadata: drops any sensitive-looking key,
 * even if a caller passed one by mistake.
 */
export const redactMetadata = (
  metadata: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, value]) => [
        key,
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? redactMetadata(value as Record<string, unknown>)
          : value,
      ]),
  );
