import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';
import { readMigrationFiles } from './migration-files.js';

interface MigrationEnvironment {
  readonly databaseName: string;
  readonly resourceArn: string;
  readonly secretArn: string;
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function readEnvironment(): MigrationEnvironment {
  return {
    databaseName: requireEnvironment('DATABASE_NAME'),
    resourceArn: requireEnvironment('DATABASE_RESOURCE_ARN'),
    secretArn: requireEnvironment('DATABASE_SECRET_ARN'),
  };
}

async function execute(
  client: RDSDataClient,
  environment: MigrationEnvironment,
  sql: string,
  transactionId?: string,
) {
  return client.send(
    new ExecuteStatementCommand({
      database: environment.databaseName,
      resourceArn: environment.resourceArn,
      secretArn: environment.secretArn,
      sql,
      ...(transactionId === undefined ? {} : { transactionId }),
    }),
  );
}

export async function runMigrations(
  client: RDSDataClient,
  environment: MigrationEnvironment,
): Promise<readonly string[]> {
  await execute(
    client,
    environment,
    `create table if not exists macromap_migration (
      name text primary key,
      applied_at timestamptz not null default now()
    )`,
  );

  const appliedResponse = await client.send(
    new ExecuteStatementCommand({
      database: environment.databaseName,
      formatRecordsAs: 'JSON',
      resourceArn: environment.resourceArn,
      secretArn: environment.secretArn,
      sql: 'select name from macromap_migration order by name',
    }),
  );
  const appliedRows = JSON.parse(
    appliedResponse.formattedRecords ?? '[]',
  ) as Array<{
    name: string;
  }>;
  const applied = new Set(appliedRows.map(({ name }) => name));
  const completed: string[] = [];

  for (const migration of await readMigrationFiles()) {
    if (applied.has(migration.name)) continue;

    const transaction = await client.send(
      new BeginTransactionCommand({
        database: environment.databaseName,
        resourceArn: environment.resourceArn,
        secretArn: environment.secretArn,
      }),
    );
    if (transaction.transactionId === undefined) {
      throw new Error(`Could not start migration ${migration.name}.`);
    }

    try {
      for (const statement of migration.statements) {
        await execute(
          client,
          environment,
          statement,
          transaction.transactionId,
        );
      }
      await client.send(
        new ExecuteStatementCommand({
          database: environment.databaseName,
          parameters: [
            { name: 'name', value: { stringValue: migration.name } },
          ],
          resourceArn: environment.resourceArn,
          secretArn: environment.secretArn,
          sql: 'insert into macromap_migration (name) values (:name)',
          transactionId: transaction.transactionId,
        }),
      );
      await client.send(
        new CommitTransactionCommand({
          resourceArn: environment.resourceArn,
          secretArn: environment.secretArn,
          transactionId: transaction.transactionId,
        }),
      );
      completed.push(migration.name);
    } catch (error) {
      await client.send(
        new RollbackTransactionCommand({
          resourceArn: environment.resourceArn,
          secretArn: environment.secretArn,
          transactionId: transaction.transactionId,
        }),
      );
      throw error;
    }
  }

  return completed;
}

const completed = await runMigrations(new RDSDataClient({}), readEnvironment());
console.log(
  completed.length === 0
    ? 'No pending migrations.'
    : `Applied migrations: ${completed.join(', ')}`,
);
