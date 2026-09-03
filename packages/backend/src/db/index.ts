import { drizzle } from 'drizzle-orm/postgres-js';
import { type PgDatabase } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { config } from '../config/index.js';
import * as schema from './schema/index.js';

/**
 * PostgreSQL connection via the `postgres` driver.
 * The `max` option limits the connection pool size.
 * In tests, use `max: 1` to avoid parallel-query issues.
 */
const client = postgres(config.DATABASE_URL, {
  max: config.NODE_ENV === 'test' ? 1 : 10,
});

/**
 * Drizzle ORM instance with full schema for relational queries.
 * Import this wherever database access is needed.
 */
export const db = drizzle(client, { schema });

/**
 * Database type that accepts both the main `db` instance and
 * transaction objects (`tx`). Uses the base PgDatabase interface
 * so repository functions work seamlessly inside transactions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = PgDatabase<any, any, any>;

/**
 * Gracefully close the database connection pool.
 * Call this during server shutdown.
 */
export async function closeDb(): Promise<void> {
  await client.end();
}

