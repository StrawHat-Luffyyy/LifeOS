import { describe, it, expect, vi } from 'vitest';
import { GitHubClient } from './github-client.js';
import { NotFoundError, UnauthorizedError, ValidationError } from './errors.js';

describe('GitHubClient', () => {
  const token = 'ghp_dummytoken123';

  it('validateToken returns GitHub user when token is valid', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        login: 'octocat',
        avatar_url: 'https://github.com/images/error/octocat_happy.gif',
        name: 'The Octocat',
      }),
    });

    const client = new GitHubClient({ fetchFn: mockFetch as unknown as typeof fetch });
    const user = await client.validateToken(token);

    expect(user.login).toBe('octocat');
    expect(user.avatarUrl).toBe('https://github.com/images/error/octocat_happy.gif');
    expect(user.name).toBe('The Octocat');
    expect(mockFetch).toHaveBeenCalledWith('https://api.github.com/user', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: `Bearer ${token}`,
      }),
    }));
  });

  it('validateToken throws UnauthorizedError on 401 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Bad credentials',
    });

    const client = new GitHubClient({ fetchFn: mockFetch as unknown as typeof fetch });
    await expect(client.validateToken(token)).rejects.toThrow(UnauthorizedError);
  });

  it('validateToken throws ValidationError when token is blank', async () => {
    const client = new GitHubClient();
    await expect(client.validateToken('   ')).rejects.toThrow(ValidationError);
  });

  it('getRepo returns repository metadata when accessible', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'LifeOS',
        full_name: 'StrawHat-Luffyyy/LifeOS',
        html_url: 'https://github.com/StrawHat-Luffyyy/LifeOS',
        private: false,
        description: 'Self-hosted life management system',
        owner: { login: 'StrawHat-Luffyyy' },
      }),
    });

    const client = new GitHubClient({ fetchFn: mockFetch as unknown as typeof fetch });
    const repo = await client.getRepo(token, 'StrawHat-Luffyyy', 'LifeOS');

    expect(repo.name).toBe('LifeOS');
    expect(repo.fullName).toBe('StrawHat-Luffyyy/LifeOS');
    expect(repo.owner).toBe('StrawHat-Luffyyy');
    expect(repo.isPrivate).toBe(false);
  });

  it('getRepo throws NotFoundError on 404', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Not Found',
    });

    const client = new GitHubClient({ fetchFn: mockFetch as unknown as typeof fetch });
    await expect(client.getRepo(token, 'StrawHat-Luffyyy', 'NonExistent')).rejects.toThrow(NotFoundError);
  });

  it('listIssues excludes pull requests and maps labels', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          number: 1,
          title: 'A regular issue',
          state: 'open',
          html_url: 'https://github.com/owner/repo/issues/1',
          user: { login: 'alice' },
          labels: [{ name: 'bug' }, 'enhancement'],
          updated_at: '2026-09-09T10:00:00Z',
        },
        {
          number: 2,
          title: 'A pull request returned by issues endpoint',
          state: 'open',
          html_url: 'https://github.com/owner/repo/pull/2',
          user: { login: 'bob' },
          labels: [],
          pull_request: { url: 'https://api.github.com/repos/owner/repo/pulls/2' },
          updated_at: '2026-09-09T11:00:00Z',
        },
      ],
    });

    const client = new GitHubClient({ fetchFn: mockFetch as unknown as typeof fetch });
    const issues = await client.listIssues(token, 'owner', 'repo');

    expect(issues).toHaveLength(1);
    expect(issues[0]!.number).toBe(1);
    expect(issues[0]!.title).toBe('A regular issue');
    expect(issues[0]!.author).toBe('alice');
    expect(issues[0]!.labels).toEqual(['bug', 'enhancement']);
  });

  it('listPullRequests maps draft and author information correctly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          number: 42,
          title: 'feat: add github sync',
          state: 'open',
          html_url: 'https://github.com/owner/repo/pull/42',
          user: { login: 'luffy' },
          draft: true,
          updated_at: '2026-09-09T12:00:00Z',
        },
      ],
    });

    const client = new GitHubClient({ fetchFn: mockFetch as unknown as typeof fetch });
    const prs = await client.listPullRequests(token, 'owner', 'repo');

    expect(prs).toHaveLength(1);
    expect(prs[0]!.number).toBe(42);
    expect(prs[0]!.title).toBe('feat: add github sync');
    expect(prs[0]!.author).toBe('luffy');
    expect(prs[0]!.isDraft).toBe(true);
  });
});
