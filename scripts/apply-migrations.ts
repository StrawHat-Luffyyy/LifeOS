import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL || 'postgresql://lifeos:lifeos_dev@localhost:5432/lifeos';
const sql = postgres(dbUrl);

async function runMigrations() {
  console.log('Connecting to database...');
  const drizzleDir = fs.existsSync(path.resolve('packages/backend/drizzle'))
    ? path.resolve('packages/backend/drizzle')
    : path.resolve('drizzle');
  const files = fs.readdirSync(drizzleDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log('Migration files found:', files);

  // Ensure vector extension exists
  await sql.unsafe('CREATE EXTENSION IF NOT EXISTS vector;');

  for (const file of files) {
    console.log(`Applying migration: ${file}...`);
    const content = fs.readFileSync(path.join(drizzleDir, file), 'utf8');
    
    // Split statements separated by --> statement-breakpoint
    const statements = content.split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      try {
        await sql.unsafe(statement);
      } catch (err: any) {
        // If type or table already exists, continue, otherwise rethrow
        if (err.message.includes('already exists')) {
          console.log(`  Notice: already exists, skipping (${err.message})`);
        } else {
          console.error(`  Error running statement in ${file}:`, err.message);
          throw err;
        }
      }
    }
    console.log(`Migration ${file} applied successfully.`);
  }

  const tables = await sql.unsafe("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  console.log('All migrations applied. Current tables:', tables.map((t: any) => t.table_name));

  await sql.end();
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
