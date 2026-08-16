import { describe, expect, it } from 'vitest';
import {
  readMigrationFiles,
  splitMigrationStatements,
} from './migration-files.js';

describe('migration files', () => {
  it('splits only at explicit statement breakpoints', () => {
    expect(
      splitMigrationStatements(`
        create table example (id text primary key);
        --> statement-breakpoint
        insert into example (id) values ('one');
      `),
    ).toEqual([
      'create table example (id text primary key);',
      "insert into example (id) values ('one');",
    ]);
  });

  it('lists the reviewed migrations in order', async () => {
    const migrations = await readMigrationFiles();

    expect(migrations.map(({ name }) => name)).toEqual([
      '0001_household_session.sql',
    ]);
    expect(migrations[0]?.statements.length).toBeGreaterThan(1);
  });
});
