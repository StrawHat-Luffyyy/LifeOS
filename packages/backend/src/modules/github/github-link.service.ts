import { db } from '../../db/index.js';
import { activityEvents } from '../../db/schema/index.js';
import * as githubLinkRepo from './github-link.repository.js';
import * as syncRepo from './github-sync.repository.js';
import { findProjectByIdOrThrow } from '../projects/project.repository.js';
import { getDecryptedToken } from '../integrations/integration.service.js';
import { githubClient } from '../../lib/github-client.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { enqueueGitHubSync } from './github-sync.queue.js';
import {
  type ProjectGitHubLinkDto,
  type EventType,
  type EntityType,
} from '@lifeos/shared';

function toLinkDto(row: githubLinkRepo.ProjectGithubLinkRow): ProjectGitHubLinkDto {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    repoOwner: row.repoOwner,
    repoName: row.repoName,
    repoUrl: row.repoUrl,
    linkedAt: row.linkedAt.toISOString(),
  };
}

/**
 * Links a GitHub repository to a project.
 * Validates project ownership, GitHub token connectivity, and repo existence.
 */
export async function linkRepo(
  userId: string,
  projectId: string,
  repoOwner: string,
  repoName: string,
): Promise<ProjectGitHubLinkDto> {
  // 1. Verify user owns the project
  await findProjectByIdOrThrow(projectId, userId);

  // 2. Verify user has GitHub connected & get decrypted token
  const token = await getDecryptedToken(userId);

  // 3. Verify repository exists and is accessible
  const repo = await githubClient.getRepo(token, repoOwner, repoName);

  // 4. Verify no repository is already linked
  const existing = await githubLinkRepo.findLinkByProjectId(projectId);
  if (existing) {
    throw new ConflictError('A GitHub repository is already linked to this project');
  }

  // 5. Insert link and log activity
  const link = await db.transaction(async (tx) => {
    const inserted = await githubLinkRepo.insertLink(
      {
        projectId,
        userId,
        repoOwner: repo.owner,
        repoName: repo.name,
        repoUrl: repo.htmlUrl,
        linkedAt: new Date(),
      },
      tx,
    );

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'GITHUB_REPO_LINKED' satisfies EventType,
      entityType: 'project' satisfies EntityType,
      entityId: projectId,
      projectId,
      summary: `Linked GitHub repository: ${repo.fullName}`,
      metadata: {
        provider: 'github',
        repoOwner: repo.owner,
        repoName: repo.name,
        repoUrl: repo.htmlUrl,
      },
    });

    return inserted;
  });

  // 6. Trigger immediate background sync
  try {
    await enqueueGitHubSync({ userId, projectId, type: 'single' });
  } catch (err) {
    // Non-fatal if Redis is unreachable in test environments
    console.warn('[GitHubLink] Warning: failed to enqueue initial sync:', err);
  }

  return toLinkDto(link);
}

/**
 * Unlinks a GitHub repository from a project and cleans up cached issues/PRs.
 */
export async function unlinkRepo(
  userId: string,
  projectId: string,
): Promise<{ unlinked: true }> {
  await findProjectByIdOrThrow(projectId, userId);

  const existing = await githubLinkRepo.findLinkByProjectId(projectId);
  if (!existing) {
    throw new NotFoundError('Linked GitHub repository for this project');
  }

  await db.transaction(async (tx) => {
    await githubLinkRepo.deleteLinkByProjectId(projectId, tx);
    await syncRepo.deleteIssuesByProjectId(projectId, tx);
    await syncRepo.deletePullRequestsByProjectId(projectId, tx);

    await tx.insert(activityEvents).values({
      userId,
      eventType: 'GITHUB_REPO_UNLINKED' satisfies EventType,
      entityType: 'project' satisfies EntityType,
      entityId: projectId,
      projectId,
      summary: `Unlinked GitHub repository: ${existing.repoOwner}/${existing.repoName}`,
      metadata: {
        provider: 'github',
        repoOwner: existing.repoOwner,
        repoName: existing.repoName,
      },
    });
  });

  return { unlinked: true };
}

/**
 * Retrieves the linked repository info for a project, if one exists.
 */
export async function getLink(
  userId: string,
  projectId: string,
): Promise<ProjectGitHubLinkDto | null> {
  await findProjectByIdOrThrow(projectId, userId);
  const link = await githubLinkRepo.findLinkByProjectId(projectId);
  return link ? toLinkDto(link) : null;
}
