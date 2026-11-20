import { DefaultNamingStrategy, type Table } from 'typeorm';

// Postgres cuts identifiers longer than this.
const MAX_IDENTIFIER_LENGTH = 63;

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
 *
 * Constraint and index names are readable too ("FK_refresh_tokens_user_id"
 * instead of TypeORM's default hash), so migrations and database errors are easy to read.
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

  override primaryKeyName(tableOrName: Table | string): string {
    return this.constraintName('PK', tableOrName, []);
  }

  override uniqueConstraintName(
    tableOrName: Table | string,
    columnNames: string[],
  ): string {
    return this.constraintName('UQ', tableOrName, columnNames);
  }

  override foreignKeyName(
    tableOrName: Table | string,
    columnNames: string[],
  ): string {
    return this.constraintName('FK', tableOrName, columnNames);
  }

  override indexName(
    tableOrName: Table | string,
    columnNames: string[],
  ): string {
    return this.constraintName('IDX', tableOrName, columnNames);
  }

  /** "FK" + "refresh_tokens" + ["user_id"] -> "FK_refresh_tokens_user_id" */
  private constraintName(
    prefix: string,
    tableOrName: Table | string,
    columnNames: string[],
  ): string {
    // "public.users" -> "users"
    const table = this.getTableName(tableOrName).split('.').pop() ?? '';
    return [prefix, table, ...columnNames]
      .join('_')
      .slice(0, MAX_IDENTIFIER_LENGTH);
  }
}
