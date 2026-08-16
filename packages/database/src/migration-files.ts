import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationNamePattern = /^\d{4}_[a-z0-9_]+\.sql$/u;
const statementBreakpoint = '--> statement-breakpoint';

export interface MigrationFile {
  readonly name: string;
  readonly statements: readonly string[];
}

export const migrationsDirectory = fileURLToPath(
  new URL('../migrations/', import.meta.url),
);

export function splitMigrationStatements(contents: string): readonly string[] {
  return contents
    .split(statementBreakpoint)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export async function readMigrationFiles(
  directory: string = migrationsDirectory,
): Promise<readonly MigrationFile[]> {
  const names = (await readdir(directory))
    .filter((name) => migrationNamePattern.test(name))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    names.map(async (name) => ({
      name,
      statements: splitMigrationStatements(
        await readFile(join(directory, name), 'utf8'),
      ),
    })),
  );
}
