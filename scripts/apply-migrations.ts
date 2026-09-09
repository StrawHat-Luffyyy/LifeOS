import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbUrl = process.env.DATABASE_URL || 'postgresql://lifeos:lifeos_dev@localhost:5432/lifeos';
const sql = postgres(dbUrl, { max: 1 });

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

async function runMigrations() {
  console.log('Connecting to database...');

  // Deterministically find drizzle directory relative to script or cwd
  const candidateDirs = [
    path.resolve(__dirname, '../packages/backend/drizzle'),
    path.resolve(process.cwd(), 'packages/backend/drizzle'),
    path.resolve(process.cwd(), 'drizzle'),
  ];

  const drizzleDir = candidateDirs.find((dir) => fs.existsSync(dir));
  if (!drizzleDir) {
    throw new Error(`Cannot locate drizzle migrations directory. Checked: ${candidateDirs.join(', ')}`);
  }

  console.log(`Using drizzle directory: ${drizzleDir}`);

  // Ensure pgvector extension and drizzle schema/table exist
  await sql.unsafe('CREATE EXTENSION IF NOT EXISTS vector;');
  await sql.unsafe('CREATE SCHEMA IF NOT EXISTS drizzle;');
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `);

  const journalPath = path.join(drizzleDir, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    throw new Error(`Cannot find meta/_journal.json in ${drizzleDir}`);
  }

  const journal: Journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  console.log(`Found ${journal.entries.length} migration entries in journal.`);

  // Query already applied migrations
  const appliedRows = await sql.unsafe<{ created_at: string | number }[]>(
    'SELECT created_at FROM drizzle.__drizzle_migrations',
  );
  const appliedTimestamps = new Set(appliedRows.map((r) => Number(r.created_at)));

  for (const entry of journal.entries) {
    const isApplied = appliedTimestamps.has(entry.when);
    const sqlFile = path.join(drizzleDir, `${entry.tag}.sql`);

    if (!fs.existsSync(sqlFile)) {
      throw new Error(`Migration file missing: ${sqlFile}`);
    }

    const fileContent = fs.readFileSync(sqlFile, 'utf8');
    const hash = crypto.createHash('sha256').update(fileContent).digest('hex');

    if (isApplied) {
      console.log(`  [SKIPPED] Migration ${entry.tag} (already recorded in drizzle.__drizzle_migrations)`);
      continue;
    }

    console.log(`  [APPLYING] Migration ${entry.tag}...`);
    const statements = fileContent
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      try {
        await sql.unsafe(statement);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Allow idempotent reruns if objects were previously created
        if (
          msg.includes('already exists') ||
          msg.includes('multiple primary keys') ||
          msg.includes('duplicate key') ||
          (statement.toUpperCase().includes('RENAME') && msg.includes('does not exist'))
        ) {
          console.log(`    Notice: object already exists or already renamed, skipping statement: ${msg.split('\n')[0]}`);
        } else {
          console.error(`    Error executing statement in ${entry.tag}:`, msg);
          throw err;
        }
      }
    }

    // Record in drizzle.__drizzle_migrations
    await sql.unsafe(
      'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
      [hash, entry.when],
    );

    console.log(`  [DONE] Migration ${entry.tag} applied and recorded.`);
  }

  const tables = await sql.unsafe<{ table_name: string }[]>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  console.log(`\nAll migrations up to date. Public tables (${tables.length}):`, tables.map((t) => t.table_name));
}

runMigrations()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end();
  });
