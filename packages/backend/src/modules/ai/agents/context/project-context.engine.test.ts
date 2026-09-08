import { describe, it, expect, vi, beforeEach } from 'vitest';
import { projectContextEngine } from './project-context.engine.js';
import * as projectService from '../../../projects/project.service.js';
import * as taskService from '../../../tasks/task.service.js';
import * as activityService from '../../../activity/activity.service.js';
import { hybridRetrievalService } from '../../retrieval/hybrid-retrieval.service.js';

vi.mock('../../../projects/project.service.js');
vi.mock('../../../tasks/task.service.js');
vi.mock('../../../activity/activity.service.js');
vi.mock('../../../memory/memory.service.js');
vi.mock('../../retrieval/hybrid-retrieval.service.js');

describe('ProjectContextEngine (P4-2)', () => {
  const userId = 'user-1';
  const projectId = 'proj-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gathers structured context with project, open tasks (and dependency status), and activity', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue({
      id: projectId,
      name: 'Alpha Project',
      description: 'Main project',
      status: 'active',
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    vi.mocked(taskService.listTasks).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'task-1',
          title: 'Deploy backend',
          description: null,
          priority: 'high',
          status: 'todo',
          dueDate: null,
          projectId,
          userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isBlocked: true,
          blockedBy: ['Setup database'],
          dependencies: [],
        },
        {
          id: 'task-2',
          title: 'Setup database',
          description: null,
          priority: 'urgent',
          status: 'todo',
          dueDate: null,
          projectId,
          userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isBlocked: false,
          blockedBy: [],
          dependencies: [],
        },
        {
          id: 'task-3',
          title: 'Initial commit',
          description: null,
          priority: 'low',
          status: 'done', // Done task should be filtered out
          dueDate: null,
          projectId,
          userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      meta: { page: 1, limit: 100, total: 3, totalPages: 1 },
    });

    vi.mocked(activityService.listProjectActivity).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'act-1',
          userId,
          eventType: 'TASK_CREATED',
          entityType: 'task',
          entityId: 'task-1',
          projectId,
          summary: 'Created task Deploy backend',
          metadata: null,
          createdAt: new Date().toISOString(),
        },
      ],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const ctx = await projectContextEngine.getStructuredContext(userId, projectId);

    expect(ctx.project.name).toBe('Alpha Project');
    expect(ctx.openTasks).toHaveLength(2); // Only open tasks
    expect(ctx.openTasks[0]?.id).toBe('task-1');
    expect(ctx.openTasks[0]?.isBlocked).toBe(true);
    expect(ctx.openTasks[0]?.blockingTaskTitles).toEqual(['Setup database']);
    expect(ctx.recentActivity).toHaveLength(1);
    expect(ctx.recentActivity[0]?.summary).toBe('Created task Deploy backend');
  });

  it('gathers semantic context reusing HybridRetrievalService and categorizes results', async () => {
    vi.mocked(hybridRetrievalService.retrieve).mockResolvedValue([
      {
        entityType: 'note',
        entityId: 'note-1',
        title: 'Architecture Note',
        content: 'Use PostgreSQL with pgvector',
        score: 0.85,
      },
      {
        entityType: 'document',
        entityId: 'doc-1',
        title: 'PRD Document',
        content: 'Section 4: Agentic Intelligence',
        score: 0.75,
      },
      {
        entityType: 'memory',
        entityId: 'mem-1',
        title: 'Goal memory',
        content: 'Finish Phase 4 by end of week',
        score: 0.9,
      },
    ]);

    const ctx = await projectContextEngine.getSemanticContext(userId, 'architecture and goals', projectId);

    expect(ctx.notes).toHaveLength(1);
    expect(ctx.notes[0]?.title).toBe('Architecture Note');
    expect(ctx.documents).toHaveLength(1);
    expect(ctx.documents[0]?.title).toBe('PRD Document');
    expect(ctx.memories).toHaveLength(1);
    expect(ctx.memories[0]?.content).toBe('Finish Phase 4 by end of week');
    expect(ctx.rawResults).toHaveLength(3);
  });
});
