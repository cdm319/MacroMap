import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createLocalDatabase } from './local.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (databaseUrl === undefined) {
  describe.skip('local PostgreSQL adapter', () => {
    it('requires TEST_DATABASE_URL to run', () => undefined);
  });
} else {
  describe('local PostgreSQL adapter', () => {
    const client = createLocalDatabase(databaseUrl);

    beforeAll(async () => {
      for (const filename of [
        'initial-schema.sql',
        'updates/001-person-macro-targets.sql',
      ]) {
        const sql = await readFile(
          new URL(`../sql/${filename}`, import.meta.url),
          'utf8',
        );
        for (const statement of sql.split('--> statement-breakpoint')) {
          if (statement.trim() !== '') await client.pool.query(statement);
        }
      }
    });

    afterAll(async () => {
      await client.close();
    });

    it('connects to PostgreSQL', async () => {
      const result = await client.pool.query<{ connected: number }>(
        'select 1::int as connected',
      );

      expect(result.rows).toEqual([{ connected: 1 }]);
    });

    it('creates the initial household and planning profiles', async () => {
      const result = await client.pool.query<{
        display_name: string;
        household_name: string;
        slug: string;
        snack_reserve: string;
        target_kcal: number | null;
      }>(
        `select p.display_name, h.display_name as household_name, p.slug,
                h.snack_reserve, p.target_kcal
         from person p
         inner join household h on h.id = p.household_id
         where p.household_id = $1
         order by p.sort_order`,
        ['00000000-0000-4000-8000-000000000001'],
      );

      expect(result.rows).toEqual([
        {
          display_name: 'Chris',
          household_name: 'Chris & Alex',
          snack_reserve: '0.1500',
          slug: 'chris',
          target_kcal: null,
        },
        {
          display_name: 'Alex',
          household_name: 'Chris & Alex',
          snack_reserve: '0.1500',
          slug: 'alex',
          target_kcal: null,
        },
      ]);
    });
  });
}
