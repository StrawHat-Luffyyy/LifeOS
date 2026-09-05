import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the database module before importing the service
// ---------------------------------------------------------------------------

const { mockInsert, mockSelect, mockTransaction } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    transaction: mockTransaction,
    insert: mockInsert,
    select: mockSelect,
  },
}));

vi.mock('../../db/schema/index.js', () => ({
  tasks: { id: 'id', userId: 'user_id', deletedAt: 'deleted_at' },
  activityEvents: {},
}));

vi.mock('../projects/project.service.js', () => ({
  getProject: vi.fn(),
}));

import { activityEvents } from '../../db/schema/index.js';
import { createTask, updateTask, deleteTask } from './task.service.js';
import { getProject } from '../projects/project.service.js';
import * as taskRepo from './task.repository.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskService', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTask', () => {
    it('should create a task and return a DTO with the correct shape', async () => {
      const mockTask = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test task',
        description: null,
        dueDate: null,
        priority: 'medium',
        status: 'todo',
        projectId: null,
        userId,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        deletedAt: null,
      };

      // The transaction callback receives a `tx` object
      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockTask]),
            }),
          }),
        };
        return callback(tx);
      });

      const result = await createTask(userId, {
        title: 'Test task',
        priority: 'medium',
        status: 'todo',
      });

      expect(result).toMatchObject({
        id: mockTask.id,
        title: 'Test task',
        description: null,
        priority: 'medium',
        status: 'todo',
        userId,
      });
      expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z');
      expect(mockTransaction).toHaveBeenCalledOnce();
    });

    it('should call insert twice inside the transaction (task + activity event)', async () => {
      const mockTask = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Activity test',
        description: null,
        dueDate: null,
        priority: 'high',
        status: 'todo',
        projectId: null,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      let insertCallCount = 0;
      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockImplementation(() => {
            insertCallCount++;
            return {
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([mockTask]),
              }),
            };
          }),
        };
        return callback(tx);
      });

      await createTask(userId, {
        title: 'Activity test',
        priority: 'high',
        status: 'todo',
      });

      // Two inserts: one for the task, one for the activity event
      expect(insertCallCount).toBe(2);
    });

    it('should validate project ownership when projectId is provided', async () => {
      const projectId = '77777777-7777-7777-7777-777777777777';
      const mockTask = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Project task',
        description: null,
        dueDate: null,
        priority: 'medium',
        status: 'todo',
        projectId,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.mocked(getProject).mockResolvedValue({
        id: projectId,
        name: 'Project Alpha',
        description: null,
        status: 'active',
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockTask]),
            }),
          }),
        };
        return callback(tx);
      });

      const res = await createTask(userId, {
        title: 'Project task',
        projectId,
      });

      expect(getProject).toHaveBeenCalledWith(userId, projectId);
      expect(res.projectId).toBe(projectId);
    });

    it('should throw error when projectId does not belong to the user', async () => {
      const foreignProjectId = '88888888-8888-8888-8888-888888888888';
      vi.mocked(getProject).mockRejectedValue(new Error('Project not found'));

      await expect(
        createTask(userId, {
          title: 'Unauthorized project task',
          projectId: foreignProjectId,
        }),
      ).rejects.toThrow('Project not found');
    });

    it('should persist source: "ai" and conversationId in activity event metadata when context is provided', async () => {
      const mockTask = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'AI created task',
        description: null,
        dueDate: null,
        priority: 'high',
        status: 'todo',
        projectId: null,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      let activityEventValues: Record<string, unknown> | null = null;
      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockImplementation((table) => {
            return {
              values: vi.fn().mockImplementation((vals) => {
                if (table === activityEvents || !vals.title) {
                  activityEventValues = vals;
                }
                return {
                  returning: vi.fn().mockResolvedValue([mockTask]),
                };
              }),
            };
          }),
        };
        return callback(tx);
      });

      await createTask(
        userId,
        { title: 'AI created task', priority: 'high', status: 'todo' },
        { source: 'ai', conversationId: 'conv-test-999' },
      );

      expect(activityEventValues).not.toBeNull();
      expect((activityEventValues as any).metadata).toMatchObject({
        source: 'ai',
        conversationId: 'conv-test-999',
        priority: 'high',
        status: 'todo',
      });
    });
  });

  describe('updateTask', () => {
    it('should persist source: "ai" and conversationId in activity event metadata when context is provided', async () => {
      const mockTask = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Existing Task',
        description: null,
        dueDate: null,
        priority: 'medium',
        status: 'todo',
        projectId: null,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      vi.spyOn(taskRepo, 'findTaskByIdOrThrow').mockResolvedValue(mockTask);
      vi.spyOn(taskRepo, 'updateTask').mockResolvedValue({ ...mockTask, status: 'done' });

      let activityEventValues: Record<string, unknown> | null = null;
      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockImplementation(() => ({
            values: vi.fn().mockImplementation((vals) => {
              activityEventValues = vals;
              return { returning: vi.fn().mockResolvedValue([]) };
            }),
          })),
        };
        return callback(tx);
      });

      await updateTask(
        userId,
        mockTask.id,
        { status: 'done' },
        { source: 'ai', conversationId: 'conv-update-888' },
      );

      expect(activityEventValues).not.toBeNull();
      expect((activityEventValues as any).metadata).toMatchObject({
        source: 'ai',
        conversationId: 'conv-update-888',
      });
      expect((activityEventValues as any).eventType).toBe('TASK_COMPLETED');
    });
  });

  describe('deleteTask', () => {
    it('should soft delete task and emit TASK_DELETED event', async () => {
      const mockTask = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Delete Task',
        description: null,
        dueDate: null,
        priority: 'medium',
        status: 'todo',
        projectId: null,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };

      vi.spyOn(taskRepo, 'softDeleteTask').mockResolvedValue(mockTask);

      let activityValues: Record<string, unknown> | null = null;
      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((vals) => {
              activityValues = vals;
              return { returning: vi.fn().mockResolvedValue([]) };
            }),
          }),
        };
        return callback(tx);
      });

      const result = await deleteTask(userId, mockTask.id);
      expect(result.id).toBe(mockTask.id);
      expect(activityValues).toMatchObject({
        eventType: 'TASK_DELETED',
        entityType: 'task',
        entityId: mockTask.id,
      });
    });
  });
});
