import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import type { Sql } from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  tables: string[];
}

/**
 * Loads .env file from project root or backend package into process.env if not already set.
 */
function loadEnv(): void {
  const candidateEnvFiles = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(process.cwd(), 'packages/backend/.env'),
    path.resolve(__dirname, '../packages/backend/.env'),
  ];

  for (const envFile of candidateEnvFiles) {
    if (fs.existsSync(envFile)) {
      try {
        const content = fs.readFileSync(envFile, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (key && process.env[key] === undefined) {
              process.env[key] = val;
            }
          }
        }
      } catch {
        // Ignore read errors
      }
      break;
    }
  }
}

/**
 * Dynamically resolves postgres module from node_modules or packages/backend/node_modules.
 */
async function getPostgresFactory(): Promise<typeof import('postgres')> {
  try {
    const mod = await import('postgres');
    return (mod.default || mod) as typeof import('postgres');
  } catch {
    const backendPkg = path.resolve(__dirname, '../packages/backend/package.json');
    if (fs.existsSync(backendPkg)) {
      const require = createRequire(backendPkg);
      return require('postgres');
    }
    throw new Error(
      "Cannot find 'postgres' package. Ensure dependencies are installed with 'pnpm install'."
    );
  }
}

/**
 * Runs Drizzle migrations idempotently and synchronizes drizzle.__drizzle_migrations.
 */
export async function runMigrations(customDbUrl?: string): Promise<MigrationResult> {
  loadEnv();

  const dbUrl =
    customDbUrl ||
    process.env['DATABASE_URL'] ||
    'postgresql://lifeos:lifeos_dev@localhost:5432/lifeos';

  console.log('Connecting to database...');
  const postgres = await getPostgresFactory();
  const sql: Sql = postgres(dbUrl, {
    max: 1,
    onnotice: () => {}, // Suppress noisy notice objects from PostgreSQL (e.g. extension already exists)
  });

  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    // Deterministically find drizzle directory relative to script or cwd
    const candidateDirs = [
      path.resolve(__dirname, '../packages/backend/drizzle'),
      path.resolve(process.cwd(), 'packages/backend/drizzle'),
      path.resolve(process.cwd(), 'drizzle'),
      path.resolve(__dirname, 'drizzle'),
      path.resolve(__dirname, '../drizzle'),
    ];

    const drizzleDir = candidateDirs.find((dir) => fs.existsSync(dir));
    if (!drizzleDir) {
      throw new Error(
        `Cannot locate drizzle migrations directory. Checked: ${candidateDirs.join(', ')}`
      );
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
    const sortedEntries = [...journal.entries].sort((a, b) => a.idx - b.idx);
    console.log(`Found ${sortedEntries.length} migration entries in journal.`);

    // Query already applied migrations
    const appliedRows = await sql.unsafe<{ created_at: string | number }[]>(
      'SELECT created_at FROM drizzle.__drizzle_migrations',
    );
    const appliedTimestamps = new Set(appliedRows.map((r) => Number(r.created_at)));

    for (const entry of sortedEntries) {
      const isApplied = appliedTimestamps.has(entry.when);
      const sqlFile = path.join(drizzleDir, `${entry.tag}.sql`);

      if (!fs.existsSync(sqlFile)) {
        throw new Error(`Migration file missing: ${sqlFile}`);
      }

      const fileContent = fs.readFileSync(sqlFile, 'utf8');
      const hash = crypto.createHash('sha256').update(fileContent).digest('hex');

      if (isApplied) {
        console.log(`  [SKIPPED] Migration ${entry.tag} (already recorded in drizzle.__drizzle_migrations)`);
        skipped.push(entry.tag);
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
            (statement.toUpperCase().includes('RENAME') && msg.includes('does not exist')) ||
            (statement.toUpperCase().includes('DROP') && msg.includes('does not exist'))
          ) {
            console.log(
              `    Notice: object already exists or already renamed, skipping statement: ${msg.split('\n')[0]}`
            );
          } else {
            console.error(`    Error executing statement in ${entry.tag}:`, msg);
            throw err;
          }
        }
      }

      // Record in drizzle.__drizzle_migrations idempotently
      await sql.unsafe(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
         SELECT $1, $2
         WHERE NOT EXISTS (
           SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = $2
         );`,
        [hash, entry.when],
      );

      applied.push(entry.tag);
      console.log(`  [DONE] Migration ${entry.tag} applied and recorded.`);
    }

    const tableRows = await sql.unsafe<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
    );
    const tables = tableRows.map((t) => t.table_name);
    console.log(`\nAll migrations up to date. Public tables (${tables.length}):`, tables);

    return { applied, skipped, tables };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Execute when run directly as CLI entrypoint
const isMain =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith('apply-migrations.ts') ||
    process.argv[1].endsWith('apply-migrations.js'));

if (isMain) {
  runMigrations()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
