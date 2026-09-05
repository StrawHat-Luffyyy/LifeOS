import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TOOL_REGISTRY, TOOL_DEFINITIONS } from './tool.registry.js';
import * as taskService from '../../tasks/task.service.js';
import * as noteService from '../../notes/note.service.js';
import * as projectService from '../../projects/project.service.js';
import * as activityService from '../../activity/activity.service.js';
import { NotFoundError } from '../../../lib/errors.js';

vi.mock('../../tasks/task.service.js');
vi.mock('../../notes/note.service.js');
vi.mock('../../projects/project.service.js');
vi.mock('../../activity/activity.service.js');

describe('Tool Registry (P2-4, A-3, A-4)', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const conversationId = '22222222-2222-2222-2222-222222222222';
  const context = { userId, conversationId };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose strictly 4 tools and correct risk tiers', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(4);
    expect(Object.keys(TOOL_REGISTRY)).toEqual([
      'createTask',
      'createNote',
      'updateTaskStatus',
      'getProjectContext',
    ]);

    expect(TOOL_REGISTRY['createTask']?.riskTier).toBe('WRITE');
    expect(TOOL_REGISTRY['createNote']?.riskTier).toBe('WRITE');
    expect(TOOL_REGISTRY['updateTaskStatus']?.riskTier).toBe('WRITE');
    expect(TOOL_REGISTRY['getProjectContext']?.riskTier).toBe('READ_ONLY');
  });

  describe('createTask', () => {
    it('should invoke taskService.createTask with source: ai context (A-3)', async () => {
      const mockTask = { id: 'task-1', title: 'Plan Sprint' };
      vi.mocked(taskService.createTask).mockResolvedValue(mockTask as any);

      const result = await TOOL_REGISTRY['createTask']!.handler(
        { title: 'Plan Sprint', priority: 'high' },
        context,
      );

      expect(taskService.createTask).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ title: 'Plan Sprint', priority: 'high' }),
        { source: 'ai', conversationId },
      );
      expect(result).toEqual({ success: true, task: mockTask });
    });
  });

  describe('createNote', () => {
    it('should invoke noteService.createNote with source: ai context (A-3)', async () => {
      const mockNote = { id: 'note-1', title: 'Meeting Notes' };
      vi.mocked(noteService.createNote).mockResolvedValue(mockNote as any);

      const result = await TOOL_REGISTRY['createNote']!.handler(
        { title: 'Meeting Notes', content: 'Discuss architecture', tags: ['work', 'ai'] },
        context,
      );

      expect(noteService.createNote).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          title: 'Meeting Notes',
          content: 'Discuss architecture',
          tags: ['work', 'ai'],
        }),
        { source: 'ai', conversationId },
      );
      expect(result).toEqual({ success: true, note: mockNote });
    });
  });

  describe('updateTaskStatus', () => {
    it('should invoke taskService.updateTask with source: ai context (A-3)', async () => {
      const mockTask = { id: 'task-1', status: 'done' };
      vi.mocked(taskService.updateTask).mockResolvedValue(mockTask as any);

      const result = await TOOL_REGISTRY['updateTaskStatus']!.handler(
        { taskId: 'task-1', status: 'done' },
        context,
      );

      expect(taskService.updateTask).toHaveBeenCalledWith(
        userId,
        'task-1',
        { status: 'done' },
        { source: 'ai', conversationId },
      );
      expect(result).toEqual({ success: true, task: mockTask });
    });
  });

  describe('getProjectContext (A-4 ownership check)', () => {
    it('should return consolidated project context when project belongs to user', async () => {
      const projectId = 'proj-123';
      const mockProject = { id: projectId, name: 'LifeOS' };
      const mockTasks = {
        data: [
          { id: 't1', title: 'Task 1', priority: 'high', status: 'todo' },
          { id: 't2', title: 'Task 2', priority: 'low', status: 'done' }, // filtered out
        ],
      };
      const mockNotes = {
        data: [{ id: 'n1', title: 'Note 1', tags: ['v1'] }],
      };
      const mockActivity = {
        data: [{ id: 'a1', summary: 'Created task', createdAt: '2025-01-01T00:00:00Z' }],
      };

      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any);
      vi.mocked(taskService.listTasks).mockResolvedValue(mockTasks as any);
      vi.mocked(noteService.listNotes).mockResolvedValue(mockNotes as any);
      vi.mocked(activityService.listProjectActivity).mockResolvedValue(mockActivity as any);

      const result = await TOOL_REGISTRY['getProjectContext']!.handler(
        { projectId },
        context,
      );

      expect(projectService.getProject).toHaveBeenCalledWith(userId, projectId);
      expect(result).toEqual({
        success: true,
        project: mockProject,
        openTasksCount: 1,
        openTasks: [{ id: 't1', title: 'Task 1', priority: 'high', status: 'todo' }],
        recentNotes: [{ id: 'n1', title: 'Note 1', tags: ['v1'] }],
        recentActivity: [{ id: 'a1', summary: 'Created task', createdAt: '2025-01-01T00:00:00Z' }],
      });
    });

    it('should throw 404 when project does not exist or belongs to another user (A-4)', async () => {
      const foreignProjectId = 'foreign-proj-456';
      vi.mocked(projectService.getProject).mockRejectedValue(
        new NotFoundError('Project not found'),
      );

      await expect(
        TOOL_REGISTRY['getProjectContext']!.handler({ projectId: foreignProjectId }, context),
      ).rejects.toThrow('Project not found');

      expect(projectService.getProject).toHaveBeenCalledWith(userId, foreignProjectId);
      // Ensures no downstream service calls were made
      expect(taskService.listTasks).not.toHaveBeenCalled();
    });
  });
});
