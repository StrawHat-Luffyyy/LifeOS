import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  projects: { id: 'id', userId: 'user_id', deletedAt: 'deleted_at' },
  activityEvents: {},
}));

import { createProject, updateProject, deleteProject } from './project.service.js';
import * as projectRepo from './project.repository.js';

describe('ProjectService', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProject', () => {
    it('should create a project and return a DTO with correct shape', async () => {
      const mockProject = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Website Redesign',
        description: 'Revamping landing page',
        status: 'active',
        userId,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        deletedAt: null,
      };

      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([mockProject]),
            }),
          }),
        };
        return callback(tx);
      });

      const result = await createProject(userId, {
        name: 'Website Redesign',
        description: 'Revamping landing page',
      });

      expect(result).toMatchObject({
        id: mockProject.id,
        name: 'Website Redesign',
        description: 'Revamping landing page',
        status: 'active',
        userId,
      });
      expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z');
      expect(mockTransaction).toHaveBeenCalledOnce();
    });

    it('should execute 2 inserts inside transaction (project + activity event)', async () => {
      const mockProject = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'LifeOS Core',
        description: null,
        status: 'active',
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
                returning: vi.fn().mockResolvedValue([mockProject]),
              }),
            };
          }),
        };
        return callback(tx);
      });

      await createProject(userId, { name: 'LifeOS Core' });
      expect(insertCallCount).toBe(2);
    });
  });

  describe('updateProject', () => {
    it('should emit PROJECT_STATUS_CHANGED when status is updated', async () => {
      const existingProject = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Project',
        description: null,
        status: 'active',
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const updatedProject = {
        ...existingProject,
        status: 'archived',
      };

      vi.spyOn(projectRepo, 'findProjectByIdOrThrow').mockResolvedValue(existingProject);

      let activityValues: Record<string, unknown> | null = null;
      mockTransaction.mockImplementation(async (callback) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([updatedProject]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((vals) => {
              activityValues = vals;
              return { returning: vi.fn().mockResolvedValue([]) };
            }),
          }),
        };
        return callback(tx);
      });

      const result = await updateProject(userId, existingProject.id, { status: 'archived' });

      expect(result.status).toBe('archived');
      expect(activityValues).toMatchObject({
        eventType: 'PROJECT_STATUS_CHANGED',
        entityType: 'project',
        entityId: existingProject.id,
      });
    });
  });

  describe('deleteProject', () => {
    it('should soft delete project and emit PROJECT_DELETED event', async () => {
      const mockProject = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Delete Me',
        description: null,
        status: 'active',
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };

      vi.spyOn(projectRepo, 'softDeleteProject').mockResolvedValue(mockProject);

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

      const result = await deleteProject(userId, mockProject.id);
      expect(result.id).toBe(mockProject.id);
      expect(activityValues).toMatchObject({
        eventType: 'PROJECT_DELETED',
        entityType: 'project',
        entityId: mockProject.id,
      });
    });
  });
});
