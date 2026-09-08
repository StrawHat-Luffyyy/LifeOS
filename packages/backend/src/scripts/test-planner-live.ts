import { runPlanner } from '../modules/ai/agents/planner/planner.graph.js';
import { db } from '../db/index.js';
import { users, projects } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

async function main() {
  const [alice] = await db.select().from(users).where(eq(users.email, 'alice@example.com'));
  if (!alice) throw new Error('Alice not found');

  const [project] = await db.select().from(projects).where(eq(projects.userId, alice.id)).limit(1);

  console.log('Testing Planner on:', project?.name || 'Global');
  const t0 = Date.now();
  const res = await runPlanner(alice.id, project?.id);

  console.log(`\nFinished in: ${Date.now() - t0}ms`);
  console.log('Run ID:', res.runId);
  console.log('Status:', res.status);
  console.log('Tokens used:', res.tokensUsed);
  if (res.error) console.log('Error:', res.error);
  if (res.result) {
    console.log('Rationale:', res.result.rationale);
    console.log('Unblocked count:', res.result.unblockedCount);
    console.log('Blocked count:', res.result.blockedCount);
    console.log('Recommendations count:', res.result.recommendations?.length);
    for (const r of res.result.recommendations) {
      console.log(`  #${r.rank}: [${r.priority}] "${r.taskTitle}" (Blocked: ${r.isBlocked}) - ${r.rationale}`);
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
