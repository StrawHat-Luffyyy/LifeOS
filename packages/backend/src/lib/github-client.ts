import { AppError, NotFoundError, UnauthorizedError, ValidationError } from './errors.js';

export interface GitHubUser {
  login: string;
  avatarUrl: string;
  name?: string | null;
}

export interface GitHubRepo {
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  isPrivate: boolean;
  description: string | null;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  labels: string[];
  updatedAt: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  isDraft: boolean;
  updatedAt: string;
}

export interface GitHubClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class GitHubClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options?: GitHubClientOptions) {
    this.baseUrl = (options?.baseUrl ?? 'https://api.github.com').replace(/\/$/, '');
    this.fetchFn = options?.fetchFn ?? globalThis.fetch;
  }

  private getHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'LifeOS-App',
    };
  }

  /**
   * Validates a Personal Access Token by requesting the authenticated user's profile.
   * Throws UnauthorizedError if invalid.
   */
  async validateToken(token: string): Promise<GitHubUser> {
    if (!token || !token.trim()) {
      throw new ValidationError('Personal Access Token cannot be empty');
    }

    const res = await this.fetchFn(`${this.baseUrl}/user`, {
      method: 'GET',
      headers: this.getHeaders(token),
    });

    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedError('Invalid or expired GitHub Personal Access Token');
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new AppError(
        `GitHub API error (${res.status}): ${errorText || res.statusText}`,
        res.status,
        'GITHUB_API_ERROR',
        true,
      );
    }

    const data = (await res.json()) as {
      login: string;
      avatar_url?: string;
      name?: string | null;
    };

    return {
      login: data.login,
      avatarUrl: data.avatar_url ?? '',
      name: data.name ?? null,
    };
  }

  /**
   * Fetches repository details and verifies it exists and is accessible.
   */
  async getRepo(token: string, owner: string, name: string): Promise<GitHubRepo> {
    const encodedOwner = encodeURIComponent(owner.trim());
    const encodedName = encodeURIComponent(name.trim());
    const res = await this.fetchFn(`${this.baseUrl}/repos/${encodedOwner}/${encodedName}`, {
      method: 'GET',
      headers: this.getHeaders(token),
    });

    if (res.status === 404) {
      throw new NotFoundError(`GitHub repository '${owner}/${name}'`);
    }

    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedError(
        `Access denied to repository '${owner}/${name}'. Please ensure your PAT has repo read permissions.`,
      );
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new AppError(
        `GitHub API error (${res.status}): ${errorText || res.statusText}`,
        res.status,
        'GITHUB_API_ERROR',
        true,
      );
    }

    const data = (await res.json()) as {
      name: string;
      full_name: string;
      html_url: string;
      private: boolean;
      description?: string | null;
      owner: { login: string };
    };

    return {
      owner: data.owner.login,
      name: data.name,
      fullName: data.full_name,
      htmlUrl: data.html_url,
      isPrivate: data.private,
      description: data.description ?? null,
    };
  }

  /**
   * Lists issues for a repository (excluding pull requests).
   */
  async listIssues(
    token: string,
    owner: string,
    name: string,
    options?: { state?: 'open' | 'closed' | 'all'; since?: string; perPage?: number },
  ): Promise<GitHubIssue[]> {
    const encodedOwner = encodeURIComponent(owner.trim());
    const encodedName = encodeURIComponent(name.trim());
    const params = new URLSearchParams();
    params.set('state', options?.state ?? 'all');
    params.set('per_page', String(options?.perPage ?? 100));
    params.set('sort', 'updated');
    params.set('direction', 'desc');
    if (options?.since) {
      params.set('since', options.since);
    }

    const res = await this.fetchFn(
      `${this.baseUrl}/repos/${encodedOwner}/${encodedName}/issues?${params.toString()}`,
      {
        method: 'GET',
        headers: this.getHeaders(token),
      },
    );

    if (res.status === 404) {
      throw new NotFoundError(`GitHub repository '${owner}/${name}'`);
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new AppError(
        `GitHub API error (${res.status}): ${errorText || res.statusText}`,
        res.status,
        'GITHUB_API_ERROR',
        true,
      );
    }

    const rawList = (await res.json()) as Array<{
      number: number;
      title: string;
      state: string;
      html_url: string;
      user?: { login: string } | null;
      labels?: Array<{ name: string } | string>;
      pull_request?: unknown;
      updated_at: string;
    }>;

    // Filter out pull requests returned by the issues endpoint
    return rawList
      .filter((item) => item.pull_request === undefined)
      .map((item) => ({
        number: item.number,
        title: item.title,
        state: item.state,
        url: item.html_url,
        author: item.user?.login ?? 'ghost',
        labels: (item.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)),
        updatedAt: item.updated_at,
      }));
  }

  /**
   * Lists pull requests for a repository.
   */
  async listPullRequests(
    token: string,
    owner: string,
    name: string,
    options?: { state?: 'open' | 'closed' | 'all'; perPage?: number },
  ): Promise<GitHubPR[]> {
    const encodedOwner = encodeURIComponent(owner.trim());
    const encodedName = encodeURIComponent(name.trim());
    const params = new URLSearchParams();
    params.set('state', options?.state ?? 'all');
    params.set('per_page', String(options?.perPage ?? 100));
    params.set('sort', 'updated');
    params.set('direction', 'desc');

    const res = await this.fetchFn(
      `${this.baseUrl}/repos/${encodedOwner}/${encodedName}/pulls?${params.toString()}`,
      {
        method: 'GET',
        headers: this.getHeaders(token),
      },
    );

    if (res.status === 404) {
      throw new NotFoundError(`GitHub repository '${owner}/${name}'`);
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new AppError(
        `GitHub API error (${res.status}): ${errorText || res.statusText}`,
        res.status,
        'GITHUB_API_ERROR',
        true,
      );
    }

    const rawList = (await res.json()) as Array<{
      number: number;
      title: string;
      state: string;
      html_url: string;
      user?: { login: string } | null;
      draft?: boolean;
      updated_at: string;
    }>;

    return rawList.map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      url: item.html_url,
      author: item.user?.login ?? 'ghost',
      isDraft: Boolean(item.draft),
      updatedAt: item.updated_at,
    }));
  }
}

export const githubClient = new GitHubClient();
