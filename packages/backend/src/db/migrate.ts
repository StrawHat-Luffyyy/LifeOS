/* eslint-disable no-console */
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, closeDb } from './index.js';

async function runMigration() {
  console.log('Running Drizzle migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied successfully!');
  await closeDb();
  process.exit(0);
}

runMigration().catch(async (err) => {
  console.error('Migration failed:', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
