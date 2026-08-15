import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export function createLocalDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    idleTimeoutMillis: 1_000,
    max: 2,
  });

  return {
    close: () => pool.end(),
    database: drizzle({ client: pool }),
    pool,
  };
}
