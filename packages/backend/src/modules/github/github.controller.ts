import { type Response, type NextFunction } from 'express';
import { type ApiResponse, type ProjectGitHubDataDto, type ProjectGitHubLinkDto } from '@lifeos/shared';
import { type AuthenticatedRequest } from '../../middleware/auth.js';
import * as githubLinkService from './github-link.service.js';
import * as githubSyncService from './github-sync.service.js';

/**
 * POST /api/projects/:id/github/link
 */
export async function link(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { repoOwner, repoName } = req.body;
    const projectId = req.params['id'] as string;
    const link = await githubLinkService.linkRepo(req.user.sub, projectId, repoOwner, repoName);
    const response: ApiResponse<ProjectGitHubLinkDto> = { success: true, data: link };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/projects/:id/github/link
 */
export async function unlink(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const projectId = req.params['id'] as string;
    const result = await githubLinkService.unlinkRepo(req.user.sub, projectId);
    const response: ApiResponse<{ unlinked: true }> = { success: true, data: result };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/projects/:id/github
 */
export async function getData(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const projectId = req.params['id'] as string;
    const data = await githubSyncService.getProjectGitHubData(req.user.sub, projectId);
    const response: ApiResponse<ProjectGitHubDataDto> = { success: true, data };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/projects/:id/github/sync
 */
export async function sync(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const projectId = req.params['id'] as string;
    const result = await githubSyncService.syncLinkedRepo(req.user.sub, projectId);
    const response: ApiResponse<{ syncedAt: string; issueCount: number; prCount: number }> = {
      success: true,
      data: result,
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
