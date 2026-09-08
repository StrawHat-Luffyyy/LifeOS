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
  tasks: { id: 'id', userId: 'user_id', deletedAt: 'deleted_at' },
  taskDependencies: { id: 'id', taskId: 'task_id', dependsOnTaskId: 'depends_on_task_id' },
  activityEvents: {},
}));

import * as taskRepo from './task.repository.js';
import {
  addDependency,
  removeDependency,
  getTaskDependencies,
  getTask,
} from './task.service.js';
import { ValidationError, ConflictError, NotFoundError } from '../../lib/errors.js';

describe('Task Dependencies & Cycle Prevention (P4-1)', () => {
  const userId = 'user-1111-2222-3333-444444444444';
  const otherUserId = 'user-9999-8888-7777-666666666666';

  const taskA = {
    id: 'task-a',
    title: 'Task A',
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

  const taskB = {
    id: 'task-b',
    title: 'Task B',
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

  const taskC = {
    id: 'task-c',
    title: 'Task C',
    description: null,
    dueDate: null,
    priority: 'low',
    status: 'in-progress',
    projectId: null,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{}]),
      }),
    });
  });

  it('rejects self-dependency (A depends on A)', async () => {
    await expect(addDependency(userId, 'task-a', 'task-a')).rejects.toThrow(
      ValidationError,
    );
    await expect(addDependency(userId, 'task-a', 'task-a')).rejects.toThrow(
      /Cannot add self-dependency/i,
    );
  });

  it('rejects cross-user dependency if task does not belong to user', async () => {
    vi.spyOn(taskRepo, 'findTaskByIdOrThrow').mockImplementation(async (id, uId) => {
      if (uId !== userId) throw new NotFoundError('Task', id);
      if (id === 'task-a') return taskA;
      throw new NotFoundError('Task', id);
    });

    await expect(addDependency(userId, 'task-a', 'task-other')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('rejects duplicate dependency if link already exists', async () => {
    vi.spyOn(taskRepo, 'findTaskByIdOrThrow').mockImplementation(async (id) => {
      if (id === 'task-a') return taskA;
      if (id === 'task-b') return taskB;
      throw new NotFoundError('Task', id);
    });

    vi.spyOn(taskRepo, 'findTaskDependency').mockResolvedValue({
      id: 'dep-1',
      taskId: 'task-a',
      dependsOnTaskId: 'task-b',
      createdAt: new Date(),
    });

    await expect(addDependency(userId, 'task-a', 'task-b')).rejects.toThrow(
      ConflictError,
    );
  });

  it('successfully adds a valid dependency when no cycle is created', async () => {
    vi.spyOn(taskRepo, 'findTaskByIdOrThrow').mockImplementation(async (id) => {
      if (id === 'task-a') return taskA;
      if (id === 'task-b') return taskB;
      throw new NotFoundError('Task', id);
    });
    vi.spyOn(taskRepo, 'findTaskDependency').mockResolvedValue(undefined);
    vi.spyOn(taskRepo, 'listAllUserDependencies').mockResolvedValue([]);
    vi.spyOn(taskRepo, 'insertTaskDependency').mockResolvedValue({
      id: 'dep-ab',
      taskId: 'task-a',
      dependsOnTaskId: 'task-b',
      createdAt: new Date('2026-09-07T12:00:00Z'),
    });

    const result = await addDependency(userId, 'task-a', 'task-b');

    expect(result).toMatchObject({
      id: 'dep-ab',
      taskId: 'task-a',
      dependsOnTaskId: 'task-b',
      dependsOnTaskTitle: 'Task B',
      dependsOnTaskStatus: 'todo',
    });
    expect(mockInsert).toHaveBeenCalled();
  });

  it('P4-1 Acceptance Criterion: rejects a direct cycle (A->B, B->A)', async () => {
    // A already depends on B
    vi.spyOn(taskRepo, 'findTaskByIdOrThrow').mockImplementation(async (id) => {
      if (id === 'task-a') return taskA;
      if (id === 'task-b') return taskB;
      throw new NotFoundError('Task', id);
    });
    vi.spyOn(taskRepo, 'findTaskDependency').mockResolvedValue(undefined);

    // Existing: A depends on B
    vi.spyOn(taskRepo, 'listAllUserDependencies').mockResolvedValue([
      { taskId: 'task-a', dependsOnTaskId: 'task-b' },
    ]);

    // Attempting to add: B depends on A (creates cycle B -> A -> B)
    await expect(addDependency(userId, 'task-b', 'task-a')).rejects.toThrow(
      ValidationError,
    );
    await expect(addDependency(userId, 'task-b', 'task-a')).rejects.toThrow(
      /Circular dependency detected/i,
    );
  });

  it('P4-1 Acceptance Criterion: rejects a longer transitive cycle (A->B->C->A)', async () => {
    // Existing: A depends on B, B depends on C
    vi.spyOn(taskRepo, 'findTaskByIdOrThrow').mockImplementation(async (id) => {
      if (id === 'task-a') return taskA;
      if (id === 'task-b') return taskB;
      if (id === 'task-c') return taskC;
      throw new NotFoundError('Task', id);
    });
    vi.spyOn(taskRepo, 'findTaskDependency').mockResolvedValue(undefined);

    vi.spyOn(taskRepo, 'listAllUserDependencies').mockResolvedValue([
      { taskId: 'task-a', dependsOnTaskId: 'task-b' },
      { taskId: 'task-b', dependsOnTaskId: 'task-c' },
    ]);

    // Attempting to add: C depends on A (creates cycle C -> A -> B -> C)
    await expect(addDependency(userId, 'task-c', 'task-a')).rejects.toThrow(
      ValidationError,
    );
    await expect(addDependency(userId, 'task-c', 'task-a')).rejects.toThrow(
      /Circular dependency detected/i,
    );
  });

  it('allows complex non-cyclic branching dependencies (DAG)', async () => {
    // Existing: A depends on B, C depends on B
    // Adding: D depends on C (valid tree/DAG)
    const taskD = { ...taskA, id: 'task-d', title: 'Task D' };
    vi.spyOn(taskRepo, 'findTaskByIdOrThrow').mockImplementation(async (id) => {
      if (id === 'task-c') return taskC;
      if (id === 'task-d') return taskD;
      throw new NotFoundError('Task', id);
    });
    vi.spyOn(taskRepo, 'findTaskDependency').mockResolvedValue(undefined);

    vi.spyOn(taskRepo, 'listAllUserDependencies').mockResolvedValue([
      { taskId: 'task-a', dependsOnTaskId: 'task-b' },
      { taskId: 'task-c', dependsOnTaskId: 'task-b' },
    ]);
    vi.spyOn(taskRepo, 'insertTaskDependency').mockResolvedValue({
      id: 'dep-dc',
      taskId: 'task-d',
      dependsOnTaskId: 'task-c',
      createdAt: new Date(),
    });

    const result = await addDependency(userId, 'task-d', 'task-c');
    expect(result.taskId).toBe('task-d');
    expect(result.dependsOnTaskId).toBe('task-c');
  });

  it('removes a dependency link and logs an activity event', async () => {
    vi.spyOn(taskRepo, 'findTaskByIdOrThrow').mockImplementation(async (id) => {
      if (id === 'task-a') return taskA;
      if (id === 'task-b') return taskB;
      throw new NotFoundError('Task', id);
    });
    vi.spyOn(taskRepo, 'deleteTaskDependency').mockResolvedValue(true);

    const result = await removeDependency(userId, 'task-a', 'task-b');
    expect(result).toEqual({ success: true });
    expect(mockInsert).toHaveBeenCalled();
  });

  it('getTask reflects blocked status when prerequisite task is incomplete', async () => {
    vi.spyOn(taskRepo, 'findTaskByIdOrThrow').mockResolvedValue(taskA);
    vi.spyOn(taskRepo, 'listTaskPrerequisites').mockResolvedValue([
      {
        dependency: {
          id: 'dep-1',
          taskId: 'task-a',
          dependsOnTaskId: 'task-b',
          createdAt: new Date(),
        },
        task: taskB, // status: 'todo' (incomplete)
      },
    ]);

    const taskDto = await getTask(userId, 'task-a');
    expect(taskDto.isBlocked).toBe(true);
    expect(taskDto.blockedBy).toEqual(['Task B']);
    expect(taskDto.dependencies).toHaveLength(1);
    expect(taskDto.dependencies?.[0]?.dependsOnTaskTitle).toBe('Task B');
  });

  it('getTask reflects unblocked status when all prerequisites are done', async () => {
    vi.spyOn(taskRepo, 'findTaskByIdOrThrow').mockResolvedValue(taskA);
    vi.spyOn(taskRepo, 'listTaskPrerequisites').mockResolvedValue([
      {
        dependency: {
          id: 'dep-1',
          taskId: 'task-a',
          dependsOnTaskId: 'task-b',
          createdAt: new Date(),
        },
        task: { ...taskB, status: 'done' },
      },
    ]);

    const taskDto = await getTask(userId, 'task-a');
    expect(taskDto.isBlocked).toBe(false);
    expect(taskDto.blockedBy).toEqual([]);
  });
});
