import { eq } from 'drizzle-orm';
import { db, type Database } from '../../db/index.js';
import { projectGithubLinks } from '../../db/schema/index.js';

export type ProjectGithubLinkRow = typeof projectGithubLinks.$inferSelect;
export type ProjectGithubLinkInsert = typeof projectGithubLinks.$inferInsert;

export async function findLinkByProjectId(
  projectId: string,
  tx: Database = db,
): Promise<ProjectGithubLinkRow | undefined> {
  const [row] = await tx
    .select()
    .from(projectGithubLinks)
    .where(eq(projectGithubLinks.projectId, projectId));
  return row;
}

export async function insertLink(
  data: ProjectGithubLinkInsert,
  tx: Database = db,
): Promise<ProjectGithubLinkRow> {
  const [row] = await tx
    .insert(projectGithubLinks)
    .values(data)
    .returning();

  if (!row) {
    throw new Error('Failed to insert project GitHub link');
  }

  return row;
}

export async function deleteLinkByProjectId(
  projectId: string,
  tx: Database = db,
): Promise<ProjectGithubLinkRow | undefined> {
  const [row] = await tx
    .delete(projectGithubLinks)
    .where(eq(projectGithubLinks.projectId, projectId))
    .returning();

  return row;
}

export async function listAllLinks(
  tx: Database = db,
): Promise<ProjectGithubLinkRow[]> {
  return tx.select().from(projectGithubLinks);
}

export async function listLinksForUser(
  userId: string,
  tx: Database = db,
): Promise<ProjectGithubLinkRow[]> {
  return tx
    .select()
    .from(projectGithubLinks)
    .where(eq(projectGithubLinks.userId, userId));
}
