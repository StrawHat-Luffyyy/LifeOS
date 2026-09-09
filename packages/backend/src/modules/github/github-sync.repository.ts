import { eq, desc } from 'drizzle-orm';
import { db, type Database } from '../../db/index.js';
import { githubIssues, githubPullRequests } from '../../db/schema/index.js';

export type GitHubIssueRow = typeof githubIssues.$inferSelect;
export type GitHubIssueInsert = typeof githubIssues.$inferInsert;

export type GitHubPullRequestRow = typeof githubPullRequests.$inferSelect;
export type GitHubPullRequestInsert = typeof githubPullRequests.$inferInsert;

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export async function upsertIssues(
  dataList: GitHubIssueInsert[],
  tx: Database = db,
): Promise<GitHubIssueRow[]> {
  if (dataList.length === 0) return [];

  const results: GitHubIssueRow[] = [];
  // Upsert in batches or sequentially to ensure conflict target is respected
  for (const item of dataList) {
    const [row] = await tx
      .insert(githubIssues)
      .values(item)
      .onConflictDoUpdate({
        target: [githubIssues.projectId, githubIssues.number],
        set: {
          title: item.title,
          state: item.state,
          url: item.url,
          labels: item.labels,
          author: item.author,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    if (row) {
      results.push(row);
    }
  }

  return results;
}

export async function listIssuesByProjectId(
  projectId: string,
  tx: Database = db,
): Promise<GitHubIssueRow[]> {
  return tx
    .select()
    .from(githubIssues)
    .where(eq(githubIssues.projectId, projectId))
    .orderBy(desc(githubIssues.number));
}

export async function deleteIssuesByProjectId(
  projectId: string,
  tx: Database = db,
): Promise<void> {
  await tx.delete(githubIssues).where(eq(githubIssues.projectId, projectId));
}

// ---------------------------------------------------------------------------
// Pull Requests
// ---------------------------------------------------------------------------

export async function upsertPullRequests(
  dataList: GitHubPullRequestInsert[],
  tx: Database = db,
): Promise<GitHubPullRequestRow[]> {
  if (dataList.length === 0) return [];

  const results: GitHubPullRequestRow[] = [];
  for (const item of dataList) {
    const [row] = await tx
      .insert(githubPullRequests)
      .values(item)
      .onConflictDoUpdate({
        target: [githubPullRequests.projectId, githubPullRequests.number],
        set: {
          title: item.title,
          state: item.state,
          url: item.url,
          author: item.author,
          isDraft: item.isDraft,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    if (row) {
      results.push(row);
    }
  }

  return results;
}

export async function listPullRequestsByProjectId(
  projectId: string,
  tx: Database = db,
): Promise<GitHubPullRequestRow[]> {
  return tx
    .select()
    .from(githubPullRequests)
    .where(eq(githubPullRequests.projectId, projectId))
    .orderBy(desc(githubPullRequests.number));
}

export async function deletePullRequestsByProjectId(
  projectId: string,
  tx: Database = db,
): Promise<void> {
  await tx.delete(githubPullRequests).where(eq(githubPullRequests.projectId, projectId));
}
