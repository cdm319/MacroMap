import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalDatabase } from './index.js';
import { readMigrationFiles } from './migration-files.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (databaseUrl === undefined) {
  describe.skip('local PostgreSQL adapter', () => {
    it('requires TEST_DATABASE_URL to run', () => undefined);
  });
} else {
  describe('local PostgreSQL adapter', () => {
    const client = createLocalDatabase(databaseUrl);

    beforeAll(async () => {
      await client.pool.query(`create table if not exists macromap_migration (
        name text primary key,
        applied_at timestamptz not null default now()
      )`);

      for (const migration of await readMigrationFiles()) {
        const existing = await client.pool.query(
          'select 1 from macromap_migration where name = $1',
          [migration.name],
        );
        if (existing.rowCount !== 0) continue;

        const connection = await client.pool.connect();
        try {
          await connection.query('begin');
          for (const statement of migration.statements) {
            await connection.query(statement);
          }
          await connection.query(
            'insert into macromap_migration (name) values ($1)',
            [migration.name],
          );
          await connection.query('commit');
        } catch (error) {
          await connection.query('rollback');
          throw error;
        } finally {
          connection.release();
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

    it('bootstraps the singleton household and planning profiles', async () => {
      const result = await client.pool.query<{
        display_name: string;
        household_name: string;
        slug: string;
      }>(
        `select p.display_name, h.display_name as household_name, p.slug
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
          slug: 'chris',
        },
        {
          display_name: 'Alex',
          household_name: 'Chris & Alex',
          slug: 'alex',
        },
      ]);
    });
  });
}
