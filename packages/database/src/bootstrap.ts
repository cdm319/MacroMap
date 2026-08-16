import { readFile } from 'node:fs/promises';
import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required.`);
  }
  return value;
}

const subjectIndex = process.argv.indexOf('--subject');
const subject = subjectIndex < 0 ? undefined : process.argv[subjectIndex + 1];
if (subject === undefined || subject.trim() === '' || subject.length > 128) {
  throw new Error('A Cognito subject is required with --subject.');
}

const database = requiredEnvironment('DATABASE_NAME');
const resourceArn = requiredEnvironment('DATABASE_RESOURCE_ARN');
const secretArn = requiredEnvironment('DATABASE_SECRET_ARN');
const client = new RDSDataClient({});
const transaction = await client.send(
  new BeginTransactionCommand({ database, resourceArn, secretArn }),
);
const transactionId = transaction.transactionId;
if (transactionId === undefined) throw new Error('Could not start bootstrap.');

try {
  const schema = await readFile(
    new URL('../sql/initial-schema.sql', import.meta.url),
    'utf8',
  );
  const statements = schema
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const sql of statements) {
    await client.send(
      new ExecuteStatementCommand({
        database,
        resourceArn,
        secretArn,
        sql,
        transactionId,
      }),
    );
  }
  await client.send(
    new ExecuteStatementCommand({
      database,
      parameters: [{ name: 'subject', value: { stringValue: subject } }],
      resourceArn,
      secretArn,
      sql: `insert into account_identity (cognito_subject, household_id)
        select :subject, id from household where slug = 'default'`,
      transactionId,
    }),
  );
  await client.send(
    new CommitTransactionCommand({ resourceArn, secretArn, transactionId }),
  );
  console.log(
    'Created the initial schema, household, profiles, and login link.',
  );
} catch (error) {
  await client.send(
    new RollbackTransactionCommand({ resourceArn, secretArn, transactionId }),
  );
  throw error;
}
