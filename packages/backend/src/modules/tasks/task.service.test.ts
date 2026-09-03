import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the database module before importing the service
// ---------------------------------------------------------------------------

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockTransaction = vi.fn();

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

// Import after mocks are set up
const { createTask } = await import('./task.service.js');

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
  });
});
