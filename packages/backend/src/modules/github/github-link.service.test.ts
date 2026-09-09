import { describe, it, expect, vi, beforeEach } from 'vitest';
import { linkRepo, unlinkRepo, getLink } from './github-link.service.js';
import * as linkRepoModule from './github-link.repository.js';
import * as syncRepoModule from './github-sync.repository.js';
import * as projectRepoModule from '../projects/project.repository.js';
import * as integrationService from '../integrations/integration.service.js';
import { githubClient } from '../../lib/github-client.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';

const { mockTransaction } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: mockTransaction,
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  projectGithubLinks: { id: 'id', projectId: 'project_id', userId: 'user_id' },
  githubIssues: {},
  githubPullRequests: {},
  activityEvents: {},
}));

vi.mock('./github-link.repository.js', () => ({
  findLinkByProjectId: vi.fn(),
  insertLink: vi.fn(),
  deleteLinkByProjectId: vi.fn(),
}));

vi.mock('./github-sync.repository.js', () => ({
  deleteIssuesByProjectId: vi.fn(),
  deletePullRequestsByProjectId: vi.fn(),
}));

vi.mock('../projects/project.repository.js', () => ({
  findProjectByIdOrThrow: vi.fn(),
}));

vi.mock('../integrations/integration.service.js', () => ({
  getDecryptedToken: vi.fn(),
}));

vi.mock('../../lib/github-client.js', () => ({
  githubClient: {
    getRepo: vi.fn(),
  },
}));

vi.mock('./github-sync.queue.js', () => ({
  enqueueGitHubSync: vi.fn().mockResolvedValue('job-123'),
}));

describe('GitHubLinkService', () => {
  const userId = 'user-111-uuid';
  const projectId = 'proj-222-uuid';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('linkRepo', () => {
    it('verifies project, token, and repo, then persists link and logs activity', async () => {
      vi.mocked(projectRepoModule.findProjectByIdOrThrow).mockResolvedValue({
        id: projectId,
        userId,
        name: 'My Project',
      } as any);

      vi.mocked(integrationService.getDecryptedToken).mockResolvedValue('ghp_secretToken');
      vi.mocked(linkRepoModule.findLinkByProjectId).mockResolvedValue(undefined);

      vi.mocked(githubClient.getRepo).mockResolvedValue({
        owner: 'StrawHat-Luffyyy',
        name: 'LifeOS',
        fullName: 'StrawHat-Luffyyy/LifeOS',
        htmlUrl: 'https://github.com/StrawHat-Luffyyy/LifeOS',
        isPrivate: false,
        description: 'Self-hosted system',
      });

      let insertedLink: any = null;
      let loggedActivity: any = null;

      vi.mocked(linkRepoModule.insertLink).mockImplementation(async (data) => {
        insertedLink = data;
        return {
          id: 'link-uuid-1',
          ...data,
          linkedAt: new Date('2026-09-09T10:00:00Z'),
          createdAt: new Date('2026-09-09T10:00:00Z'),
          updatedAt: new Date('2026-09-09T10:00:00Z'),
        } as any;
      });

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

      const result = await linkRepo(userId, projectId, 'StrawHat-Luffyyy', 'LifeOS');

      expect(projectRepoModule.findProjectByIdOrThrow).toHaveBeenCalledWith(projectId, userId);
      expect(integrationService.getDecryptedToken).toHaveBeenCalledWith(userId);
      expect(githubClient.getRepo).toHaveBeenCalledWith('ghp_secretToken', 'StrawHat-Luffyyy', 'LifeOS');
      expect(insertedLink.repoOwner).toBe('StrawHat-Luffyyy');
      expect(insertedLink.repoName).toBe('LifeOS');
      expect(loggedActivity.eventType).toBe('GITHUB_REPO_LINKED');
      expect(loggedActivity.projectId).toBe(projectId);
      expect(result.repoUrl).toBe('https://github.com/StrawHat-Luffyyy/LifeOS');
    });

    it('rejects with ConflictError if project already has a linked repository', async () => {
      vi.mocked(projectRepoModule.findProjectByIdOrThrow).mockResolvedValue({ id: projectId } as any);
      vi.mocked(integrationService.getDecryptedToken).mockResolvedValue('ghp_token');
      vi.mocked(githubClient.getRepo).mockResolvedValue({
        owner: 'StrawHat-Luffyyy',
        name: 'LifeOS',
      } as any);
      vi.mocked(linkRepoModule.findLinkByProjectId).mockResolvedValue({ id: 'existing-link' } as any);

      await expect(linkRepo(userId, projectId, 'StrawHat-Luffyyy', 'LifeOS')).rejects.toThrow(ConflictError);
    });

    it('throws NotFoundError when user does not own project (tenant isolation)', async () => {
      vi.mocked(projectRepoModule.findProjectByIdOrThrow).mockRejectedValue(new NotFoundError('Project', projectId));

      await expect(linkRepo(userId, projectId, 'owner', 'repo')).rejects.toThrow(NotFoundError);
      expect(githubClient.getRepo).not.toHaveBeenCalled();
    });
  });

  describe('unlinkRepo', () => {
    it('deletes link, deletes cached issues/PRs, and logs activity', async () => {
      vi.mocked(projectRepoModule.findProjectByIdOrThrow).mockResolvedValue({ id: projectId } as any);
      vi.mocked(linkRepoModule.findLinkByProjectId).mockResolvedValue({
        id: 'link-123',
        repoOwner: 'StrawHat-Luffyyy',
        repoName: 'LifeOS',
      } as any);

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

      const res = await unlinkRepo(userId, projectId);
      expect(res).toEqual({ unlinked: true });
      expect(linkRepoModule.deleteLinkByProjectId).toHaveBeenCalledWith(projectId, expect.anything());
      expect(syncRepoModule.deleteIssuesByProjectId).toHaveBeenCalledWith(projectId, expect.anything());
      expect(syncRepoModule.deletePullRequestsByProjectId).toHaveBeenCalledWith(projectId, expect.anything());
      expect(loggedActivity.eventType).toBe('GITHUB_REPO_UNLINKED');
    });

    it('throws NotFoundError if no link exists to unlink', async () => {
      vi.mocked(projectRepoModule.findProjectByIdOrThrow).mockResolvedValue({ id: projectId } as any);
      vi.mocked(linkRepoModule.findLinkByProjectId).mockResolvedValue(undefined);

      await expect(unlinkRepo(userId, projectId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getLink', () => {
    it('returns linked repository DTO', async () => {
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

      const res = await getLink(userId, projectId);
      expect(res?.repoOwner).toBe('owner');
      expect(res?.repoName).toBe('repo');
    });

    it('returns null if no repository is linked', async () => {
      vi.mocked(projectRepoModule.findProjectByIdOrThrow).mockResolvedValue({ id: projectId } as any);
      vi.mocked(linkRepoModule.findLinkByProjectId).mockResolvedValue(undefined);

      const res = await getLink(userId, projectId);
      expect(res).toBeNull();
    });
  });
});
