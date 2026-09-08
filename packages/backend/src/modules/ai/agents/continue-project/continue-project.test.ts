import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateCitations,
  stripUngroundedClaims,
  buildEvidencePool,
} from './citation-validator.js';
import { runContinueProject } from './continue-project.graph.js';
import { setLLMProviderForTesting } from '../../gateway/index.js';
import { MockLLMProvider } from '../../gateway/mock.provider.js';
import * as projectService from '../../../projects/project.service.js';
import * as taskService from '../../../tasks/task.service.js';
import * as activityService from '../../../activity/activity.service.js';
import { hybridRetrievalService } from '../../retrieval/hybrid-retrieval.service.js';

vi.mock('../../../projects/project.service.js');
vi.mock('../../../tasks/task.service.js');
vi.mock('../../../activity/activity.service.js');
vi.mock('../../retrieval/hybrid-retrieval.service.js');
vi.mock('../agent-runs/agent-run.service.js', () => ({
  createAgentRun: vi.fn().mockResolvedValue({ id: 'run-123' }),
  finalizeAgentRun: vi.fn().mockResolvedValue({ id: 'run-123' }),
}));

describe('Continue Project Agent & Citation Enforcement (P4-3, OD-3)', () => {
  const userId = 'user-1';
  const projectId = 'proj-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Citation Validator Unit Tests', () => {
    it('passes when all citations exist and substantive claims cite evidence', () => {
      const summary = `### Current State
LifeOS authentication is currently implemented using JWT refresh tokens [E1].

### Recent Progress
- Added Docker Compose configuration [E2].
- Integrated BullMQ background queue [E3].`;

      const result = validateCitations(summary, 5);
      expect(result.valid).toBe(true);
      expect(result.invalidIndices).toEqual([]);
      expect(result.uncitedClaims).toEqual([]);
    });

    it('detects nonexistent citation index (e.g. [E99] when max is 5)', () => {
      const summary = `### Current State
System is running on Kubernetes cluster [E99].`;

      const result = validateCitations(summary, 5);
      expect(result.valid).toBe(false);
      expect(result.invalidIndices).toContain(99);
    });

    it('detects uncited substantive claims (B-4 sentence-level heuristic)', () => {
      const summary = `### Current State
This is an ungrounded claim that does not contain any citation at all.`;

      const result = validateCitations(summary, 5);
      expect(result.valid).toBe(false);
      expect(result.uncitedClaims).toHaveLength(1);
    });

    it('strips ungrounded claims and non-existent citations, appending lack-of-grounding notice', () => {
      const summary = `### Current State
Valid grounded claim about auth [E1].
This is an invented hallucination with no grounding anywhere.
Another claim with bad citation [E99].

### Suggested Next Step
Start phase 4 [E2].`;

      const stripped = stripUngroundedClaims(summary, 5);
      expect(stripped.strippedCount).toBe(2);
      expect(stripped.cleanedText).toContain('Valid grounded claim about auth [E1].');
      expect(stripped.cleanedText).toContain('Start phase 4 [E2].');
      expect(stripped.cleanedText).not.toContain('invented hallucination');
      expect(stripped.cleanedText).not.toContain('Another claim with bad citation');
      expect(stripped.cleanedText).toContain('*(Note: Some statements were omitted due to lack of grounding evidence.)*');
    });
  });

  describe('Graph Execution with Mock LLM (OD-3 Acceptance Criteria)', () => {
    it('P4-3 Acceptance Criterion: retry-then-strip triggers when model cites nonexistent evidence index', async () => {
      vi.mocked(projectService.getProject).mockResolvedValue({
        id: projectId,
        name: 'LifeOS Core',
        description: 'Personal operating system',
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
            title: 'Task 1',
            description: null,
            priority: 'high',
            status: 'todo',
            dueDate: null,
            projectId,
            userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });

      vi.mocked(activityService.listProjectActivity).mockResolvedValue({
        success: true,
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });

      vi.mocked(hybridRetrievalService.retrieve).mockResolvedValue([]);

      // Mock provider returns an initial invalid citation [E99], and on retry STILL returns [E99]
      const mockProvider = new MockLLMProvider([
        // Turn 1: Initial synthesis with invalid index [E99]
        {
          events: [
            {
              type: 'token',
              content: `### Current State
LifeOS uses quantum encryption modules [E99].

### Recent Progress
No recorded evidence.

### Open Tasks
- Work on Task 1 [E2].

### Recent Decisions
No recorded evidence.

### Blockers
No recorded evidence.

### Suggested Next Step
Deploy to space station [E99].`,
            },
            {
              type: 'done',
              finishReason: 'stop',
              usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            },
          ],
        },
        // Turn 2 (retry): Still has invalid citation [E99]
        {
          events: [
            {
              type: 'token',
              content: `### Current State
LifeOS uses quantum encryption modules [E99].

### Recent Progress
No recorded evidence.

### Open Tasks
- Work on Task 1 [E2].

### Recent Decisions
No recorded evidence.

### Blockers
No recorded evidence.

### Suggested Next Step
Deploy to space station [E99].`,
            },
            {
              type: 'done',
              finishReason: 'stop',
              usage: { promptTokens: 150, completionTokens: 50, totalTokens: 200 },
            },
          ],
        },
      ]);

      setLLMProviderForTesting(mockProvider);

      const result = await runContinueProject(userId, projectId);

      expect(result.status).toBe('completed');
      expect(result.result?.citationStatus).toBe('claim_stripped');
      // The invalid claims [E99] should be stripped
      expect(result.result?.currentState).not.toContain('quantum encryption modules');
      expect(result.result?.suggestedNextStep).not.toContain('space station');
      // Valid claim [E2] remains
      expect(result.result?.openTasks).toContain('Work on Task 1 [E2].');
      expect(result.result?.suggestedNextStep).toContain('Some statements were omitted due to lack of grounding evidence');

      setLLMProviderForTesting(null);
    });

    it('returns clean summary when initial synthesis is fully grounded and valid', async () => {
      vi.mocked(projectService.getProject).mockResolvedValue({
        id: projectId,
        name: 'LifeOS Core',
        description: 'Personal operating system',
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
            title: 'Build Planner Agent',
            description: null,
            priority: 'urgent',
            status: 'in-progress',
            dueDate: null,
            projectId,
            userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });

      vi.mocked(activityService.listProjectActivity).mockResolvedValue({
        success: true,
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });

      vi.mocked(hybridRetrievalService.retrieve).mockResolvedValue([]);

      const mockProvider = new MockLLMProvider([
        {
          events: [
            {
              type: 'token',
              content: `### Current State
LifeOS Core is an active personal operating system project [E1].

### Recent Progress
No recorded evidence.

### Open Tasks
- Build Planner Agent is currently in-progress with urgent priority [E2].

### Recent Decisions
No recorded evidence.

### Blockers
No recorded evidence.

### Suggested Next Step
Continue implementation of Build Planner Agent [E2].`,
            },
            {
              type: 'done',
              finishReason: 'stop',
              usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
            },
          ],
        },
      ]);

      setLLMProviderForTesting(mockProvider);

      const result = await runContinueProject(userId, projectId);

      expect(result.status).toBe('completed');
      expect(result.result?.citationStatus).toBe('clean');
      expect(result.result?.currentState).toContain('LifeOS Core is an active personal operating system project [E1].');
      expect(result.result?.openTasks).toContain('Build Planner Agent is currently in-progress with urgent priority [E2].');

      setLLMProviderForTesting(null);
    });
  });
});
