import {
  type Priority,
  type TaskStatus,
  type RetrievalResultDto,
  type MemoryDto,
} from '@lifeos/shared';
import * as projectService from '../../../projects/project.service.js';
import * as taskService from '../../../tasks/task.service.js';
import * as activityService from '../../../activity/activity.service.js';
import * as memoryService from '../../../memory/memory.service.js';
import { hybridRetrievalService } from '../../retrieval/hybrid-retrieval.service.js';

export interface StructuredProjectContext {
  project: {
    id: string | null;
    name: string;
    description: string | null;
    status: string;
  };
  openTasks: Array<{
    id: string;
    title: string;
    priority: Priority;
    status: TaskStatus;
    dueDate: string | null;
    isBlocked: boolean;
    blockingTaskTitles: string[];
    dependencies: Array<{
      id: string;
      taskId: string;
      dependsOnTaskId: string;
      dependsOnTaskTitle?: string;
    }>;
  }>;
  recentActivity: Array<{
    id: string;
    summary: string;
    eventType: string;
    createdAt: string;
  }>;
}

export interface SemanticProjectContext {
  notes: Array<{ id: string; title: string; content: string; score: number }>;
  documents: Array<{ id: string; title: string; content: string; score: number }>;
  memories: Array<{ id: string; content: string; score: number }>;
  rawResults: RetrievalResultDto[];
}

/**
 * Shared Project Context Engine (P4-2).
 * Consumed by both Continue Project and Planner Agent graphs to provide unified
 * structured context and semantic context (reusing HybridRetrievalService).
 */
export class ProjectContextEngine {
  /**
   * Fetch structured context: project metadata, open tasks (with dependency status), and recent activity.
   */
  async getStructuredContext(
    userId: string,
    projectId?: string | null,
  ): Promise<StructuredProjectContext> {
    let projectInfo: {
      id: string | null;
      name: string;
      description: string | null;
      status: string;
    } = {
      id: null,
      name: 'General Workspace',
      description: 'All tasks and activities across your workspace',
      status: 'active',
    };

    if (projectId) {
      const proj = await projectService.getProject(userId, projectId);
      projectInfo = {
        id: proj.id,
        name: proj.name,
        description: proj.description ?? null,
        status: proj.status,
      };
    }

    // Fetch open tasks with dependencies
    const tasksRes = await taskService.listTasks(userId, {
      projectId: projectId || undefined,
      limit: 100,
      page: 1,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    const openTasks = tasksRes.data
      .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
      .map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
        isBlocked: t.isBlocked ?? false,
        blockingTaskTitles: t.blockedBy ?? [],
        dependencies: t.dependencies ?? [],
      }));

    // Fetch recent activity
    let recentActivity: Array<{
      id: string;
      summary: string;
      eventType: string;
      createdAt: string;
    }> = [];

    if (projectId) {
      const actRes = await activityService.listProjectActivity(userId, projectId, {
        limit: 10,
        page: 1,
      });
      recentActivity = actRes.data.map((a) => ({
        id: a.id,
        summary: a.summary,
        eventType: a.eventType,
        createdAt: a.createdAt,
      }));
    } else {
      const actRes = await activityService.listActivity(userId, {
        limit: 10,
        page: 1,
      });
      recentActivity = actRes.data.map((a) => ({
        id: a.id,
        summary: a.summary,
        eventType: a.eventType,
        createdAt: a.createdAt,
      }));
    }

    return {
      project: projectInfo,
      openTasks,
      recentActivity,
    };
  }

  /**
   * Fetch semantic context using Phase 3's HybridRetrievalService (P4-2).
   */
  async getSemanticContext(
    userId: string,
    query: string,
    projectId?: string | null,
    limit = 6,
  ): Promise<SemanticProjectContext> {
    const rawResults = await hybridRetrievalService.retrieve({
      userId,
      query,
      projectId: projectId || undefined,
      limit,
    });

    const notes: SemanticProjectContext['notes'] = [];
    const documents: SemanticProjectContext['documents'] = [];
    const memories: SemanticProjectContext['memories'] = [];

    for (const res of rawResults) {
      if (res.entityType === 'note') {
        notes.push({
          id: res.entityId,
          title: res.title,
          content: res.content,
          score: res.score,
        });
      } else if (res.entityType === 'document') {
        documents.push({
          id: res.entityId,
          title: res.title,
          content: res.content,
          score: res.score,
        });
      } else if (res.entityType === 'memory') {
        memories.push({
          id: res.entityId,
          content: res.content,
          score: res.score,
        });
      }
    }

    return {
      notes,
      documents,
      memories,
      rawResults,
    };
  }

  /**
   * Fetch active explicit memories (especially goals & preferences) for the planner.
   */
  async getPlannerMemories(userId: string): Promise<MemoryDto[]> {
    const allMemories = await memoryService.listMemories(userId, {
      page: 1,
      limit: 20,
      activeOnly: true,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    // Filter to goals and preferences, or return all active memories
    return allMemories.data.filter(
      (m) => m.category === 'goal' || m.category === 'preference' || m.category === 'decision',
    );
  }
}

export const projectContextEngine = new ProjectContextEngine();
