import { readMigrationFiles } from './migration-files.js';

const migrations = await readMigrationFiles();
console.log(migrations.map(({ name }) => name).join('\n'));
