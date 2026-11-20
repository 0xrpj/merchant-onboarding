import { DefaultNamingStrategy } from 'typeorm';

/** "createdAt" -> "created_at", "riskScore" -> "risk_score", "HTTPStatus" -> "http_status" */
export const toSnakeCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

/**
 * TypeScript properties are camelCase, Postgres columns are snake_case.
 * This maps one to the other, so entities don't need `name:` on every column.
 * Table names are always given explicitly, e.g. @Entity('merchant_applications').
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy {
  override columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    return (
      customName || toSnakeCase([...embeddedPrefixes, propertyName].join('_'))
    );
  }

  override relationName(propertyName: string): string {
    return toSnakeCase(propertyName);
  }

  // A relation `application` pointing at `id` gets the column `application_id`.
  override joinColumnName(
    relationName: string,
    referencedColumnName: string,
  ): string {
    return toSnakeCase(`${relationName}_${referencedColumnName}`);
  }
}
