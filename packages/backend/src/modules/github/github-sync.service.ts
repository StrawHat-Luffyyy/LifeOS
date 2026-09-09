import { db } from '../../db/index.js';
import { activityEvents } from '../../db/schema/index.js';
import * as linkRepo from './github-link.repository.js';
import * as syncRepo from './github-sync.repository.js';
import { findProjectByIdOrThrow } from '../projects/project.repository.js';
import { getDecryptedToken } from '../integrations/integration.service.js';
import { githubClient } from '../../lib/github-client.js';
import { NotFoundError } from '../../lib/errors.js';
import {
  type ProjectGitHubDataDto,
  type GitHubIssueDto,
  type GitHubPullRequestDto,
  type ProjectGitHubLinkDto,
  type EventType,
  type EntityType,
} from '@lifeos/shared';

function toIssueDto(row: syncRepo.GitHubIssueRow): GitHubIssueDto {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    number: row.number,
    title: row.title,
    state: row.state,
    url: row.url,
    labels: (row.labels as string[]) ?? [],
    author: row.author,
    lastSyncedAt: row.lastSyncedAt.toISOString(),
  };
}

function toPRDto(row: syncRepo.GitHubPullRequestRow): GitHubPullRequestDto {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    number: row.number,
    title: row.title,
    state: row.state,
    url: row.url,
    author: row.author,
    isDraft: row.isDraft,
    lastSyncedAt: row.lastSyncedAt.toISOString(),
  };
}

function toLinkDto(row: linkRepo.ProjectGithubLinkRow): ProjectGitHubLinkDto {
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
 * Synchronizes issues and pull requests from GitHub for a linked project.
 * Upserts cached data and logs a GITHUB_SYNC_COMPLETED event with source: 'github_sync'.
 */
export async function syncLinkedRepo(
  userId: string,
  projectId: string,
): Promise<{ syncedAt: string; issueCount: number; prCount: number }> {
  // 1. Locate repository link
  const link = await linkRepo.findLinkByProjectId(projectId);
  if (!link) {
    throw new NotFoundError('Linked GitHub repository for this project');
  }

  // 2. Fetch decrypted user token
  const token = await getDecryptedToken(userId);

  // 3. Fetch remote issues and PRs from GitHub API
  const [issues, prs] = await Promise.all([
    githubClient.listIssues(token, link.repoOwner, link.repoName),
    githubClient.listPullRequests(token, link.repoOwner, link.repoName),
  ]);

  const now = new Date();

  // 4. Upsert into database cache
  await db.transaction(async (tx) => {
    if (issues.length > 0) {
      await syncRepo.upsertIssues(
        issues.map((i) => ({
          projectId,
          userId,
          number: i.number,
          title: i.title,
          state: i.state,
          url: i.url,
          labels: i.labels,
          author: i.author,
          lastSyncedAt: now,
        })),
        tx,
      );
    }
    await syncRepo.pruneClosedIssues(projectId, issues.map((i) => i.number), tx);

    if (prs.length > 0) {
      await syncRepo.upsertPullRequests(
        prs.map((p) => ({
          projectId,
          userId,
          number: p.number,
          title: p.title,
          state: p.state,
          url: p.url,
          author: p.author,
          isDraft: p.isDraft,
          lastSyncedAt: now,
        })),
        tx,
      );
    }
    await syncRepo.pruneClosedPullRequests(projectId, prs.map((p) => p.number), tx);

    // 5. Append activity log with metadata.source: 'github_sync'
    await tx.insert(activityEvents).values({
      userId,
      eventType: 'GITHUB_SYNC_COMPLETED' satisfies EventType,
      entityType: 'project' satisfies EntityType,
      entityId: projectId,
      projectId,
      summary: `Synced GitHub repository: ${issues.length} issues, ${prs.length} pull requests`,
      metadata: {
        source: 'github_sync',
        repoOwner: link.repoOwner,
        repoName: link.repoName,
        issueCount: issues.length,
        prCount: prs.length,
      },
    });
  });

  return {
    syncedAt: now.toISOString(),
    issueCount: issues.length,
    prCount: prs.length,
  };
}

/**
 * Iterates through all linked repositories and runs syncLinkedRepo for each.
 * Used by the recurring BullMQ background sync worker.
 */
export async function syncAllLinkedRepos(): Promise<{ totalProcessed: number; failed: number }> {
  const allLinks = await linkRepo.listAllLinks();
  let failed = 0;

  for (const link of allLinks) {
    try {
      await syncLinkedRepo(link.userId, link.projectId);
    } catch (err) {
      failed++;
      console.error(`[GitHubSyncWorker] Failed to sync ${link.repoOwner}/${link.repoName} for project ${link.projectId}:`, err);
    }
  }

  return { totalProcessed: allLinks.length, failed };
}

/**
 * Returns the cached GitHub data (link, open issues, pull requests) for a project.
 */
export async function getProjectGitHubData(
  userId: string,
  projectId: string,
): Promise<ProjectGitHubDataDto> {
  await findProjectByIdOrThrow(projectId, userId);

  const link = await linkRepo.findLinkByProjectId(projectId);
  if (!link) {
    return {
      link: null,
      issues: [],
      pullRequests: [],
      lastSyncedAt: null,
    };
  }

  const [issues, prs] = await Promise.all([
    syncRepo.listIssuesByProjectId(projectId),
    syncRepo.listPullRequestsByProjectId(projectId),
  ]);

  return {
    link: toLinkDto(link),
    issues: issues.map(toIssueDto),
    pullRequests: prs.map(toPRDto),
    lastSyncedAt: issues[0]?.lastSyncedAt?.toISOString() ?? link.linkedAt.toISOString(),
  };
}
