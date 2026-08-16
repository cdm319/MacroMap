import {
  ExecuteStatementCommand,
  RDSDataClient,
} from '@aws-sdk/client-rds-data';

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required.`);
  }
  return value;
}

const subjectIndex = process.argv.indexOf('--subject');
const subject =
  subjectIndex === -1 ? undefined : process.argv[subjectIndex + 1];
if (subject === undefined || subject.trim() === '' || subject.length > 128) {
  throw new Error('A Cognito subject is required with --subject.');
}

const database = requireEnvironment('DATABASE_NAME');
const resourceArn = requireEnvironment('DATABASE_RESOURCE_ARN');
const secretArn = requireEnvironment('DATABASE_SECRET_ARN');
const client = new RDSDataClient({});
const common = { database, resourceArn, secretArn } as const;

const existingResponse = await client.send(
  new ExecuteStatementCommand({
    ...common,
    formatRecordsAs: 'JSON',
    sql: 'select cognito_subject from account_identity order by cognito_subject',
  }),
);
const existing = JSON.parse(
  existingResponse.formattedRecords ?? '[]',
) as Array<{
  cognito_subject: string;
}>;

if (existing.length === 0) {
  await client.send(
    new ExecuteStatementCommand({
      ...common,
      parameters: [{ name: 'subject', value: { stringValue: subject } }],
      sql: `insert into account_identity (cognito_subject, household_id)
        select :subject, id from household where slug = 'default'`,
    }),
  );
  console.log('Bound the Cognito identity to the MacroMap household.');
} else if (existing.length === 1 && existing[0]?.cognito_subject === subject) {
  console.log('The Cognito identity is already bound.');
} else {
  throw new Error(
    'A different Cognito identity is already bound to this household.',
  );
}
