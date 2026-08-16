import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export * from './data-api.js';
export * from './schema.js';

export function createLocalDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    idleTimeoutMillis: 1_000,
    max: 2,
  });

  return {
    close: () => pool.end(),
    database: drizzle({ client: pool, schema }),
    pool,
  };
}
