import {
  type AgentStepSummaryItem,
  type AgentType,
  type AgentRunStatus,
} from '@lifeos/shared';
import {
  RunGuardrails,
  type GuardrailsOptions,
  RunTimeoutError,
  RunBudgetExceededError,
} from './guardrails.js';
import * as agentRunService from '../agent-runs/agent-run.service.js';

export interface BaseAgentState {
  userId: string;
  projectId?: string | null;
  steps: AgentStepSummaryItem[];
  tokensUsed: number;
  error?: string;
}

export interface AgentExecutionResult<T> {
  runId: string;
  status: AgentRunStatus;
  result?: T;
  output?: T;
  steps: AgentStepSummaryItem[];
  tokensUsed: number;
  durationMs: number;
  error?: string;
}

/**
 * Standard execution wrapper for LangGraph workflows with OD-7 guardrails and P4-5 audit logging.
 */
export async function executeAgentWithGuardrails<TState extends BaseAgentState, TOutput>(params: {
  userId: string;
  agentType: AgentType;
  projectId?: string | null;
  guardrailsOptions?: GuardrailsOptions;
  initialState: TState;
  runGraph: (
    state: TState,
    guardrails: RunGuardrails,
  ) => Promise<{ state: TState; output: TOutput }>;
}): Promise<AgentExecutionResult<TOutput>> {
  const { userId, agentType, projectId, guardrailsOptions, initialState, runGraph } = params;

  // 1. Create audit row in agent_runs
  const run = await agentRunService.createAgentRun(userId, agentType, projectId);

  // 2. Initialize guardrails (OD-7, B-1, B-2)
  const guardrails = new RunGuardrails(guardrailsOptions);
  guardrails.start();
  const startTime = Date.now();

  let executionSteps: AgentStepSummaryItem[] = [...initialState.steps];

  try {
    const { state, output } = await runGraph(initialState, guardrails);
    executionSteps = state.steps;

    const durationMs = Date.now() - startTime;
    guardrails.stop();

    await agentRunService.finalizeAgentRun(run.id, userId, {
      status: 'completed',
      stepsSummary: executionSteps,
      output: output as Record<string, unknown>,
      metadata: {
        tokensUsed: guardrails.tokensUsed,
        durationMs,
        tokenBudget: guardrails.budget,
        timeoutMs: guardrails.timeoutMs,
      },
    });

    return {
      runId: run.id,
      status: 'completed',
      result: output,
      output,
      steps: executionSteps,
      tokensUsed: guardrails.tokensUsed,
      durationMs,
    };
  } catch (err: unknown) {
    guardrails.stop();
    const durationMs = Date.now() - startTime;
    const isTimeout =
      err instanceof RunTimeoutError ||
      (err instanceof Error && err.name === 'RunTimeoutError') ||
      guardrails.signal.aborted && guardrails.signal.reason instanceof RunTimeoutError;

    const isBudgetExceeded =
      err instanceof RunBudgetExceededError ||
      (err instanceof Error && err.name === 'RunBudgetExceededError') ||
      guardrails.signal.aborted && guardrails.signal.reason instanceof RunBudgetExceededError;

    const status: AgentRunStatus = isTimeout
      ? 'timeout'
      : isBudgetExceeded
        ? 'budget_exceeded'
        : 'failed';

    const errorMessage = err instanceof Error ? err.message : String(err);

    executionSteps.push({
      step: 'aborted',
      description: `Run terminated with status ${status}: ${errorMessage}`,
      timestamp: new Date().toISOString(),
    });

    await agentRunService.finalizeAgentRun(run.id, userId, {
      status,
      stepsSummary: executionSteps,
      output: null,
      metadata: {
        tokensUsed: guardrails.tokensUsed,
        durationMs,
        error: errorMessage,
        tokenBudget: guardrails.budget,
        timeoutMs: guardrails.timeoutMs,
      },
    });

    return {
      runId: run.id,
      status,
      steps: executionSteps,
      tokensUsed: guardrails.tokensUsed,
      durationMs,
      error: errorMessage,
    };
  }
}
