import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enforcePlannerConstraints } from './planner-constraint.js';
import { runPlanner } from './planner.graph.js';
import { acceptRecommendation, rejectRecommendation } from './planner.service.js';
import { setLLMProviderForTesting } from '../../gateway/index.js';
import { MockLLMProvider } from '../../gateway/mock.provider.js';
import * as projectContextModule from '../context/project-context.engine.js';
import * as taskService from '../../../tasks/task.service.js';

const { mockInsert } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
}));

vi.mock('../../../../db/index.js', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: mockInsert.mockReturnValue({
        returning: vi.fn().mockResolvedValue([{}]),
      }),
    }),
  },
}));

vi.mock('../../../../db/schema/index.js', () => ({
  activityEvents: {},
}));

vi.mock('../agent-runs/agent-run.service.js', () => ({
  createAgentRun: vi.fn().mockResolvedValue({ id: 'planner-run-1' }),
  finalizeAgentRun: vi.fn().mockResolvedValue({ id: 'planner-run-1' }),
}));

describe('Planner Agent & Hard Constraints (P4-4, B-3)', () => {
  const userId = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Constraint Enforcement Unit Tests', () => {
    it('P4-4 Acceptance Criterion: 5 tasks scenario confirms blocked task is NEVER ranked first', () => {
      const recs = [
        {
          taskId: 'task-urgent-blocked',
          taskTitle: 'Urgent task blocked by backend',
          priority: 'urgent' as const,
          status: 'todo' as const,
          dueDate: null,
          rank: 1,
          rationale: 'Urgent priority',
          isBlocked: true, // BLOCKED
          blockingTaskTitles: ['Deploy backend'],
        },
        {
          taskId: 'task-medium-unblocked',
          taskTitle: 'Write unit tests',
          priority: 'medium' as const,
          status: 'todo' as const,
          dueDate: null,
          rank: 2,
          rationale: 'Ready to work on',
          isBlocked: false, // UNBLOCKED
          blockingTaskTitles: [],
        },
        {
          taskId: 'task-high-unblocked',
          taskTitle: 'Fix UI alignment',
          priority: 'high' as const,
          status: 'todo' as const,
          dueDate: null,
          rank: 3,
          rationale: 'High priority',
          isBlocked: false,
          blockingTaskTitles: [],
        },
        {
          taskId: 'task-low-blocked',
          taskTitle: 'Update logo',
          priority: 'low' as const,
          status: 'todo' as const,
          dueDate: null,
          rank: 4,
          rationale: 'Low priority',
          isBlocked: true,
          blockingTaskTitles: ['Design approval'],
        },
        {
          taskId: 'task-low-unblocked',
          taskTitle: 'Refactor styles',
          priority: 'low' as const,
          status: 'todo' as const,
          dueDate: null,
          rank: 5,
          rationale: 'Low priority clean up',
          isBlocked: false,
          blockingTaskTitles: [],
        },
      ];

      // Run code constraint enforcement
      const { recommendations, constraintEnforced } = enforcePlannerConstraints(recs);

      expect(constraintEnforced).toBe(true);
      // Top task MUST be unblocked
      expect(recommendations[0]?.isBlocked).toBe(false);
      expect(recommendations[0]?.taskId).toBe('task-medium-unblocked');
      expect(recommendations[0]?.rank).toBe(1);

      // The blocked task should now be at position 1 (rank 2)
      expect(recommendations[1]?.taskId).toBe('task-urgent-blocked');
      expect(recommendations[1]?.rank).toBe(2);

      // All ranks sequential 1..5
      expect(recommendations.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    });

    it('does not alter ranking if the top recommendation is already unblocked', () => {
      const recs = [
        {
          taskId: 'task-unblocked',
          taskTitle: 'Do first',
          priority: 'urgent' as const,
          status: 'todo' as const,
          dueDate: null,
          rank: 1,
          rationale: 'Top priority',
          isBlocked: false,
          blockingTaskTitles: [],
        },
        {
          taskId: 'task-blocked',
          taskTitle: 'Wait for first',
          priority: 'urgent' as const,
          status: 'todo' as const,
          dueDate: null,
          rank: 2,
          rationale: 'Blocked',
          isBlocked: true,
          blockingTaskTitles: ['Do first'],
        },
      ];

      const { recommendations, constraintEnforced } = enforcePlannerConstraints(recs);
      expect(constraintEnforced).toBe(false);
      expect(recommendations[0]?.taskId).toBe('task-unblocked');
      expect(recommendations[0]?.rank).toBe(1);
    });
  });

  describe('Graph Execution with Mock LLM (Hard Constraint in Full Workflow)', () => {
    it('promotes unblocked task to #1 even when raw LLM output explicitly placed blocked task at #1', async () => {
      vi.spyOn(projectContextModule.projectContextEngine, 'getStructuredContext').mockResolvedValue({
        project: {
          id: 'proj-1',
          name: 'Project 1',
          description: null,
          status: 'active',
        },
        openTasks: [
          {
            id: 'task-blocked',
            title: 'Blocked Task',
            priority: 'urgent',
            status: 'todo',
            dueDate: null,
            isBlocked: true,
            blockingTaskTitles: ['Prereq'],
            dependencies: [],
          },
          {
            id: 'task-unblocked',
            title: 'Unblocked Task',
            priority: 'high',
            status: 'todo',
            dueDate: null,
            isBlocked: false,
            blockingTaskTitles: [],
            dependencies: [],
          },
        ],
        recentActivity: [],
      });

      vi.spyOn(projectContextModule.projectContextEngine, 'getPlannerMemories').mockResolvedValue([]);

      // LLM proposes blocked task as rank 1
      const mockProvider = new MockLLMProvider([
        {
          events: [
            {
              type: 'token',
              content: JSON.stringify({
                rationale: 'Ranked by urgency regardless of dependency.',
                recommendations: [
                  { taskId: 'task-blocked', rank: 1, rationale: 'Most urgent' },
                  { taskId: 'task-unblocked', rank: 2, rationale: 'High priority' },
                ],
              }),
            },
            {
              type: 'done',
              finishReason: 'stop',
              usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
            },
          ],
        },
      ]);

      setLLMProviderForTesting(mockProvider);

      const result = await runPlanner(userId, 'proj-1');

      expect(result.status).toBe('completed');
      expect(result.result?.recommendations).toHaveLength(2);
      // Hard constraint caught it and placed unblocked task at rank 1!
      expect(result.result?.recommendations[0]?.taskId).toBe('task-unblocked');
      expect(result.result?.recommendations[0]?.rank).toBe(1);
      expect(result.result?.recommendations[0]?.isBlocked).toBe(false);

      expect(result.result?.recommendations[1]?.taskId).toBe('task-blocked');
      expect(result.result?.recommendations[1]?.rank).toBe(2);
      expect(result.result?.recommendations[1]?.isBlocked).toBe(true);

      setLLMProviderForTesting(null);
    });
  });

  describe('Accept & Reject Follow-up Actions (FR-PLAN-3, B-3)', () => {
    it('acceptRecommendation explicitly sets task status to in-progress and logs activity (B-3)', async () => {
      const mockTask = {
        id: 'task-10',
        title: 'Build feature',
        description: null,
        dueDate: null,
        priority: 'high' as const,
        status: 'todo' as const,
        projectId: 'proj-1',
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(taskService, 'getTask').mockResolvedValue(mockTask);
      vi.spyOn(taskService, 'updateTask').mockResolvedValue({
        ...mockTask,
        status: 'in-progress',
      });

      const res = await acceptRecommendation(userId, 'task-10', 'Good recommendation');

      expect(res.success).toBe(true);
      expect(res.task.status).toBe('in-progress');
      expect(taskService.updateTask).toHaveBeenCalledWith(userId, 'task-10', {
        status: 'in-progress',
      });
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          eventType: 'PLANNER_RECOMMENDATION_ACCEPTED',
          summary: expect.stringContaining('Accepted recommendation and moved task to in-progress'),
          metadata: expect.objectContaining({
            action: 'ACCEPT_AND_START',
            newStatus: 'in-progress',
          }),
        }),
      );
    });

    it('rejectRecommendation logs PLANNER_RECOMMENDATION_REJECTED without changing task status', async () => {
      const mockTask = {
        id: 'task-20',
        title: 'Skip feature',
        description: null,
        dueDate: null,
        priority: 'low' as const,
        status: 'todo' as const,
        projectId: 'proj-1',
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(taskService, 'getTask').mockResolvedValue(mockTask);
      vi.spyOn(taskService, 'updateTask').mockResolvedValue(mockTask);

      const res = await rejectRecommendation(userId, 'task-20', 'Not needed today');

      expect(res.success).toBe(true);
      expect(taskService.updateTask).not.toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          eventType: 'PLANNER_RECOMMENDATION_REJECTED',
          summary: expect.stringContaining('Rejected planner recommendation for task: "Skip feature"'),
          metadata: expect.objectContaining({
            action: 'REJECT_RECOMMENDATION',
          }),
        }),
      );
    });
  });
});
