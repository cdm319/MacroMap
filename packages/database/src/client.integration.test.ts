import { afterAll, describe, expect, it } from 'vitest';
import { createLocalDatabase } from './index.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (databaseUrl === undefined) {
  describe.skip('local PostgreSQL adapter', () => {
    it('requires TEST_DATABASE_URL to run', () => undefined);
  });
} else {
  describe('local PostgreSQL adapter', () => {
    const client = createLocalDatabase(databaseUrl);

    afterAll(async () => {
      await client.close();
    });

    it('connects to PostgreSQL', async () => {
      const result = await client.pool.query<{ connected: number }>(
        'select 1::int as connected',
      );

      expect(result.rows).toEqual([{ connected: 1 }]);
    });
  });
}
