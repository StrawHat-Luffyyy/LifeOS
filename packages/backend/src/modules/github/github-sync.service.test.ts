import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncLinkedRepo, getProjectGitHubData } from './github-sync.service.js';
import * as linkRepoModule from './github-link.repository.js';
import * as syncRepoModule from './github-sync.repository.js';
import * as projectRepoModule from '../projects/project.repository.js';
import * as integrationService from '../integrations/integration.service.js';
import { githubClient } from '../../lib/github-client.js';
import { NotFoundError } from '../../lib/errors.js';

const { mockTransaction } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: mockTransaction,
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  projectGithubLinks: {},
  githubIssues: {},
  githubPullRequests: {},
  activityEvents: {},
}));

vi.mock('./github-link.repository.js', () => ({
  findLinkByProjectId: vi.fn(),
  listAllLinks: vi.fn(),
}));

vi.mock('./github-sync.repository.js', () => ({
  upsertIssues: vi.fn(),
  upsertPullRequests: vi.fn(),
  listIssuesByProjectId: vi.fn(),
  listPullRequestsByProjectId: vi.fn(),
}));

vi.mock('../projects/project.repository.js', () => ({
  findProjectByIdOrThrow: vi.fn(),
}));

vi.mock('../integrations/integration.service.js', () => ({
  getDecryptedToken: vi.fn(),
}));

vi.mock('../../lib/github-client.js', () => ({
  githubClient: {
    listIssues: vi.fn(),
    listPullRequests: vi.fn(),
  },
}));

describe('GitHubSyncService', () => {
  const userId = 'user-111-uuid';
  const projectId = 'proj-222-uuid';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('syncLinkedRepo', () => {
    it('fetches remote issues and PRs, upserts to cache, and writes activity event with source: github_sync', async () => {
      vi.mocked(linkRepoModule.findLinkByProjectId).mockResolvedValue({
        id: 'link-1',
        projectId,
        userId,
        repoOwner: 'StrawHat-Luffyyy',
        repoName: 'LifeOS',
        repoUrl: 'https://github.com/StrawHat-Luffyyy/LifeOS',
        linkedAt: new Date('2026-09-09T10:00:00Z'),
        createdAt: new Date('2026-09-09T10:00:00Z'),
        updatedAt: new Date('2026-09-09T10:00:00Z'),
      });

      vi.mocked(integrationService.getDecryptedToken).mockResolvedValue('ghp_secretToken');

      vi.mocked(githubClient.listIssues).mockResolvedValue([
        {
          number: 1,
          title: 'Bug report',
          state: 'open',
          url: 'https://github.com/StrawHat-Luffyyy/LifeOS/issues/1',
          author: 'alice',
          labels: ['bug'],
          updatedAt: '2026-09-09T11:00:00Z',
        },
      ]);

      vi.mocked(githubClient.listPullRequests).mockResolvedValue([
        {
          number: 2,
          title: 'feat: add github sync',
          state: 'open',
          url: 'https://github.com/StrawHat-Luffyyy/LifeOS/pull/2',
          author: 'bob',
          isDraft: false,
          updatedAt: '2026-09-09T12:00:00Z',
        },
      ]);

      let loggedActivity: any = null;
      mockTransaction.mockImplementation(async (cb: any) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((val) => {
              loggedActivity = val;
              return Promise.resolve();
            }),
          }),
        };
        return cb(tx);
      });

      const res = await syncLinkedRepo(userId, projectId);

      expect(res.issueCount).toBe(1);
      expect(res.prCount).toBe(1);
      expect(syncRepoModule.upsertIssues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            projectId,
            number: 1,
            title: 'Bug report',
          }),
        ]),
        expect.anything(),
      );
      expect(syncRepoModule.upsertPullRequests).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            projectId,
            number: 2,
            isDraft: false,
          }),
        ]),
        expect.anything(),
      );

      // Verify activity event has source: 'github_sync'
      expect(loggedActivity).toBeDefined();
      expect(loggedActivity.eventType).toBe('GITHUB_SYNC_COMPLETED');
      expect(loggedActivity.metadata?.source).toBe('github_sync');
      expect(loggedActivity.metadata?.issueCount).toBe(1);
      expect(loggedActivity.metadata?.prCount).toBe(1);
    });

    it('throws NotFoundError if project is not linked to any repository', async () => {
      vi.mocked(linkRepoModule.findLinkByProjectId).mockResolvedValue(undefined);

      await expect(syncLinkedRepo(userId, projectId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getProjectGitHubData', () => {
    it('returns link, cached issues, and cached PRs', async () => {
      vi.mocked(projectRepoModule.findProjectByIdOrThrow).mockResolvedValue({ id: projectId } as any);

      vi.mocked(linkRepoModule.findLinkByProjectId).mockResolvedValue({
        id: 'link-1',
        projectId,
        userId,
        repoOwner: 'owner',
        repoName: 'repo',
        repoUrl: 'https://github.com/owner/repo',
        linkedAt: new Date('2026-09-09T10:00:00Z'),
      } as any);

      vi.mocked(syncRepoModule.listIssuesByProjectId).mockResolvedValue([
        {
          id: 'issue-1',
          projectId,
          userId,
          number: 10,
          title: 'Issue 10',
          state: 'open',
          url: 'https://github.com/owner/repo/issues/10',
          labels: ['p1'],
          author: 'alice',
          lastSyncedAt: new Date('2026-09-09T12:00:00Z'),
        } as any,
      ]);

      vi.mocked(syncRepoModule.listPullRequestsByProjectId).mockResolvedValue([
        {
          id: 'pr-1',
          projectId,
          userId,
          number: 20,
          title: 'PR 20',
          state: 'open',
          url: 'https://github.com/owner/repo/pull/20',
          author: 'bob',
          isDraft: true,
          lastSyncedAt: new Date('2026-09-09T12:00:00Z'),
        } as any,
      ]);

      const data = await getProjectGitHubData(userId, projectId);

      expect(data.link?.repoOwner).toBe('owner');
      expect(data.issues).toHaveLength(1);
      expect(data.issues[0]!.number).toBe(10);
      expect(data.pullRequests).toHaveLength(1);
      expect(data.pullRequests[0]!.isDraft).toBe(true);
    });

    it('returns empty data when project is not linked', async () => {
      vi.mocked(projectRepoModule.findProjectByIdOrThrow).mockResolvedValue({ id: projectId } as any);
      vi.mocked(linkRepoModule.findLinkByProjectId).mockResolvedValue(undefined);

      const data = await getProjectGitHubData(userId, projectId);

      expect(data.link).toBeNull();
      expect(data.issues).toEqual([]);
      expect(data.pullRequests).toEqual([]);
    });

    it('enforces tenant isolation — throws 404 for unowned projects', async () => {
      vi.mocked(projectRepoModule.findProjectByIdOrThrow).mockRejectedValue(new NotFoundError('Project', projectId));

      await expect(getProjectGitHubData(userId, projectId)).rejects.toThrow(NotFoundError);
    });
  });
});
