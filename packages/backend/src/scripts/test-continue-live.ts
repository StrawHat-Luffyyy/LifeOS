/* eslint-disable no-console */
import { runContinueProject } from '../modules/ai/agents/continue-project/continue-project.graph.js';
import { db } from '../db/index.js';
import { users, projects } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

async function main() {
  const [alice] = await db.select().from(users).where(eq(users.email, 'alice@example.com'));
  if (!alice) throw new Error('Alice not found');

  const [project] = await db.select().from(projects).where(eq(projects.userId, alice.id)).limit(1);
  if (!project) throw new Error('Project not found');

  console.log('Testing Continue Project on:', project.name, `(${project.id})`);
  const t0 = Date.now();
  const result = await runContinueProject(alice.id, project.id);

  const duration = Date.now() - t0;
  console.log(`\nCompleted in ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
  console.log('Run ID:', result.runId);
  console.log('Status:', result.status);
  console.log('Tokens used:', result.tokensUsed);
  if (result.error) {
    console.log('Error:', result.error);
  }
  if (result.result) {
    console.log('Citation status:', result.result.citationStatus);
    console.log('Citations count:', result.result.citations?.length);
    console.log('\nSections:');
    console.log('Current State:', result.result.currentState);
    console.log('Recent Progress:', result.result.recentProgress);
    console.log('Open Tasks:', result.result.openTasks);
    console.log('Recent Decisions:', result.result.recentDecisions);
    console.log('Blockers:', result.result.blockers);
    console.log('Suggested Next Step:', result.result.suggestedNextStep);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
