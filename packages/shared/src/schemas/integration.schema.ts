import { z } from 'zod';

// ---------------------------------------------------------------------------
// GitHub & Integration Validation Schemas (Phase 5a)
// ---------------------------------------------------------------------------

/** Schema for connecting a GitHub Personal Access Token. */
export const connectGitHubSchema = z.object({
  body: z.object({
    token: z.string().trim().min(1, 'Personal Access Token is required'),
  }),
});

/** Schema for linking a GitHub repository to a project. */
export const linkRepoSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid project ID'),
  }),
  body: z.object({
    repoOwner: z
      .string()
      .trim()
      .min(1, 'Repository owner is required')
      .max(100, 'Repository owner must be 100 characters or fewer'),
    repoName: z
      .string()
      .trim()
      .min(1, 'Repository name is required')
      .max(100, 'Repository name must be 100 characters or fewer'),
  }),
});

/** Schema for unlinking a GitHub repository from a project. */
export const unlinkRepoSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid project ID'),
  }),
});

/** Schema for getting GitHub data for a project. */
export const getProjectGitHubSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid project ID'),
  }),
});

/** Schema for triggering a manual sync of a project's linked GitHub repository. */
export const syncProjectGitHubSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid project ID'),
  }),
});

/** Schema for linking a task to a GitHub issue. */
export const linkTaskToIssueSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid task ID'),
  }),
  body: z.object({
    githubIssueNumber: z.number().int().positive().nullable().optional(),
    githubIssueUrl: z.string().url().nullable().optional(),
  }),
});

// ---------------------------------------------------------------------------
// Inferred types for controllers / services
// ---------------------------------------------------------------------------

export type ConnectGitHubInput = z.input<typeof connectGitHubSchema>['body'];
export type LinkRepoInput = z.input<typeof linkRepoSchema>['body'];
export type LinkTaskToIssueInput = z.input<typeof linkTaskToIssueSchema>['body'];
