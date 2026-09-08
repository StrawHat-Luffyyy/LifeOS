import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RunGuardrails,
  RunTimeoutError,
  RunBudgetExceededError,
} from './guardrails.js';
import { MockLLMProvider } from '../../gateway/mock.provider.js';
import { executeAgentWithGuardrails } from './base-agent.js';

// Mock agentRunService
vi.mock('../agent-runs/agent-run.service.js', () => ({
  createAgentRun: vi.fn().mockResolvedValue({ id: 'mock-run-id' }),
  finalizeAgentRun: vi.fn().mockResolvedValue({ id: 'mock-run-id' }),
}));

describe('Agent Guardrails (OD-7, B-1, B-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('B-1 Acceptance Criterion: accumulates exact promptTokens + completionTokens (real Ollama counts)', () => {
    const guardrails = new RunGuardrails({ tokenBudget: 8000 });

    // Call 1
    guardrails.recordTokens({ promptTokens: 350, completionTokens: 150 });
    expect(guardrails.tokensUsed).toBe(500);

    // Call 2
    guardrails.recordTokens({ promptTokens: 200, completionTokens: 300 });
    expect(guardrails.tokensUsed).toBe(1000);
  });

  it('B-2 Acceptance Criterion: budget is cumulative across multiple calls in a run, including retries', () => {
    // Budget set to 500
    const guardrails = new RunGuardrails({ tokenBudget: 500 });

    // Call 1 (initial synthesis): 300 tokens — passes
    guardrails.recordTokens({ promptTokens: 200, completionTokens: 100 });
    expect(guardrails.tokensUsed).toBe(300);

    // Call 2 (retry call): 250 tokens — cumulative becomes 550 > 500 ceiling
    expect(() => {
      guardrails.recordTokens({ promptTokens: 150, completionTokens: 100 });
    }).toThrow(RunBudgetExceededError);

    expect(guardrails.signal.aborted).toBe(true);
  });

  it('OD-7 Acceptance Criterion: wall-clock timeout aborts a hanging run', async () => {
    const hangingProvider = new MockLLMProvider([
      {
        events: [{ type: 'token', content: 'Slow token' }],
        delayMs: 5000, // 5 seconds
      },
    ]);

    const result = await executeAgentWithGuardrails({
      userId: 'user-1',
      agentType: 'continue_project',
      guardrailsOptions: { timeoutMs: 50, tokenBudget: 8000 }, // 50ms timeout
      initialState: {
        userId: 'user-1',
        steps: [],
        tokensUsed: 0,
      },
      runGraph: async (_state, guardrails) => {
        for await (const _evt of guardrails.trackChat(hangingProvider, { messages: [] })) {
          // hanging
        }
        return {
          state: { ..._state },
          output: { done: true },
        };
      },
    });

    expect(result.status).toBe('timeout');
    expect(result.error).toMatch(/timeout/i);
  });

  it('OD-7 Acceptance Criterion: artificially small token budget triggers before timeout', async () => {
    const mockProvider = new MockLLMProvider([
      {
        events: [
          { type: 'token', content: 'Hello' },
          {
            type: 'done',
            finishReason: 'stop',
            usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
          },
        ],
      },
    ]);

    const result = await executeAgentWithGuardrails({
      userId: 'user-1',
      agentType: 'planner',
      guardrailsOptions: { timeoutMs: 10000, tokenBudget: 50 }, // Budget 50, but provider emits 100
      initialState: {
        userId: 'user-1',
        steps: [],
        tokensUsed: 0,
      },
      runGraph: async (_state, guardrails) => {
        for await (const _evt of guardrails.trackChat(mockProvider, { messages: [] })) {
          // reading events
        }
        return {
          state: { ..._state },
          output: { done: true },
        };
      },
    });

    expect(result.status).toBe('budget_exceeded');
    expect(result.tokensUsed).toBe(100);
  });
});
