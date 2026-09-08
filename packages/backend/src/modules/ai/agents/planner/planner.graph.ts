import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import {
  type AgentStepSummaryItem,
  type PlannerOutputDto,
  type PlannerRecommendationDto,
  type MemoryDto,
} from '@lifeos/shared';
import {
  projectContextEngine,
  type StructuredProjectContext,
} from '../context/project-context.engine.js';
import { enforcePlannerConstraints } from './planner-constraint.js';
import { getLLMProvider } from '../../gateway/index.js';
import { executeAgentWithGuardrails, type BaseAgentState } from '../base/base-agent.js';
import { type RunGuardrails, type GuardrailsOptions } from '../base/guardrails.js';

export interface PlannerState extends BaseAgentState {
  focus?: string;
  structuredContext: StructuredProjectContext | null;
  memories: MemoryDto[];
  rawLLMOutput: string;
  recommendations: PlannerRecommendationDto[];
  rationale: string;
  constraintEnforced: boolean;
}

export const PlannerAnnotation = Annotation.Root({
  userId: Annotation<string>,
  projectId: Annotation<string | null>,
  focus: Annotation<string | undefined>,
  steps: Annotation<AgentStepSummaryItem[]>,
  tokensUsed: Annotation<number>,
  error: Annotation<string | undefined>,
  structuredContext: Annotation<StructuredProjectContext | null>,
  memories: Annotation<MemoryDto[]>,
  rawLLMOutput: Annotation<string>,
  recommendations: Annotation<PlannerRecommendationDto[]>,
  rationale: Annotation<string>,
  constraintEnforced: Annotation<boolean>,
});

/**
 * Creates and compiles the 3-node LangGraph graph for the Planner Agent (P4-4).
 * Nodes: gatherContext -> reason -> formatOutput
 */
export function createPlannerGraph(guardrails: RunGuardrails) {
  const workflow = new StateGraph(PlannerAnnotation)
    // Node 1: Gather context (open tasks with dependency status + memories)
    .addNode('gatherContext', async (state) => {
      const structured = await projectContextEngine.getStructuredContext(
        state.userId,
        state.projectId,
      );
      const memories = await projectContextEngine.getPlannerMemories(state.userId);

      const steps = [
        ...state.steps,
        {
          step: 'gatherContext',
          description: `Gathered ${structured.openTasks.length} open tasks (${structured.openTasks.filter((t) => t.isBlocked).length} blocked) and ${memories.length} user goal/preference memories.`,
          timestamp: new Date().toISOString(),
        },
      ];

      return {
        structuredContext: structured,
        memories,
        steps,
      };
    })

    // Node 2: Multi-factor reasoning
    .addNode('reason', async (state) => {
      const structured = state.structuredContext!;
      const memories = state.memories;

      if (structured.openTasks.length === 0) {
        return {
          rawLLMOutput: '',
          rationale: 'No open tasks available to prioritize.',
          steps: [
            ...state.steps,
            {
              step: 'reason',
              description: 'No open tasks available to prioritize.',
              timestamp: new Date().toISOString(),
            },
          ],
        };
      }

      const tasksPrompt = structured.openTasks
        .map(
          (t, idx) =>
            `${idx + 1}. [Task ${idx + 1} | ID: ${t.id}] "${t.title}" | Priority: ${t.priority} | Status: ${t.status} | Due: ${t.dueDate || 'None'}${t.isBlocked ? ` | BLOCKED BY: ${t.blockingTaskTitles.join(', ')}` : ' | UNBLOCKED'}`,
        )
        .join('\n');

      const memoriesPrompt =
        memories.length > 0
          ? memories.map((m) => `- [${m.category}]: ${m.content}`).join('\n')
          : 'None recorded.';

      const systemPrompt = `You are the LifeOS Planner Agent. Your job is to rank open tasks for the user by weighing multiple factors together:
1. Priority (urgent > high > medium > low)
2. Due dates (overdue or near-term tasks take precedence)
3. Dependency status (blocked tasks cannot be completed yet)
4. Project goals and user preferences

CRITICAL INSTRUCTION:
Keep all rationales ultra-concise (1 single brief sentence for overall rationale, under 10 words for each task).
Return ONLY a valid JSON object matching this schema:
{
  "rationale": "1 brief sentence strategy",
  "recommendations": [
    {
      "taskNumber": 1,
      "taskId": "UUID of task",
      "rank": 1,
      "rationale": "Brief reason under 10 words"
    }
  ]
}
Ensure all open tasks are included in the ranking.`;

      const userMessage = `PROJECT: ${structured.project.name} (${structured.project.description || 'No description'})
${state.focus ? `USER FOCUS: ${state.focus}\n` : ''}
USER MEMORIES & GOALS:
${memoriesPrompt}

OPEN TASKS TO RANK:
${tasksPrompt}

Analyze these tasks and return the ranked JSON recommendations now.`;

      const provider = getLLMProvider();
      let responseText = '';

      for await (const evt of guardrails.trackChat(provider, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        maxTokens: 120,
      })) {
        if (evt.type === 'token') {
          responseText += evt.content;
        }
      }

      const steps = [
        ...state.steps,
        {
          step: 'reason',
          description: 'Model performed multi-factor evaluation across priorities, due dates, dependencies, and goals.',
          timestamp: new Date().toISOString(),
        },
      ];

      return {
        rawLLMOutput: responseText,
        steps,
      };
    })

    // Node 3: Format output & enforce code-level hard constraint (P4-4.2)
    .addNode('formatOutput', async (state) => {
      const structured = state.structuredContext!;
      const tasksMap = new Map(structured.openTasks.map((t) => [t.id, t]));

      if (structured.openTasks.length === 0) {
        return {
          recommendations: [],
          rationale: 'No open tasks found.',
          constraintEnforced: false,
          steps: [
            ...state.steps,
            {
              step: 'formatOutput',
              description: 'Formatted empty recommendations.',
              timestamp: new Date().toISOString(),
            },
          ],
        };
      }

      let parsed: {
        rationale?: string;
        recommendations?: Array<{ taskId?: string; taskNumber?: number; rank?: number; rationale?: string }>;
      } = {};

      try {
        const jsonMatch = state.rawLLMOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            const repaired = jsonMatch[0].replace(/,\s*$/, '') + ']}';
            parsed = JSON.parse(repaired);
          }
        }
      } catch (err) {
        console.warn('[PlannerGraph] Failed to parse LLM JSON output, falling back to heuristic ranking', err);
      }

      const parsedRecs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
      const seenTaskIds = new Set<string>();
      const orderedRecs: PlannerRecommendationDto[] = [];

      // Add parsed recommendations
      for (let i = 0; i < parsedRecs.length; i++) {
        const item = parsedRecs[i];
        if (!item) continue;
        const task =
          (item.taskId ? tasksMap.get(item.taskId) : undefined) ||
          (item.taskNumber && item.taskNumber >= 1 && item.taskNumber <= structured.openTasks.length
            ? structured.openTasks[item.taskNumber - 1]
            : undefined);
        if (!task || seenTaskIds.has(task.id)) continue;

        seenTaskIds.add(task.id);
        orderedRecs.push({
          taskId: task.id,
          taskTitle: task.title,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate,
          rank: i + 1,
          rationale: item.rationale || 'Prioritized based on project goals.',
          isBlocked: task.isBlocked,
          blockingTaskTitles: task.blockingTaskTitles,
        });
      }

      // Add any open tasks that the model omitted
      for (const task of structured.openTasks) {
        if (!seenTaskIds.has(task.id)) {
          orderedRecs.push({
            taskId: task.id,
            taskTitle: task.title,
            priority: task.priority,
            status: task.status,
            dueDate: task.dueDate,
            rank: orderedRecs.length + 1,
            rationale: 'Prioritized according to project urgency.',
            isBlocked: task.isBlocked,
            blockingTaskTitles: task.blockingTaskTitles,
          });
        }
      }

      // If no valid recommendations were produced, default sort by priority / blocked
      if (orderedRecs.length === 0) {
        const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        const sorted = [...structured.openTasks].sort(
          (a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2),
        );
        for (let i = 0; i < sorted.length; i++) {
          const t = sorted[i]!;
          orderedRecs.push({
            taskId: t.id,
            taskTitle: t.title,
            priority: t.priority,
            status: t.status,
            dueDate: t.dueDate,
            rank: i + 1,
            rationale: `Ranked by priority (${t.priority}).`,
            isBlocked: t.isBlocked,
            blockingTaskTitles: t.blockingTaskTitles,
          });
        }
      }

      // CRITICAL P4-4.2 HARD CONSTRAINT:
      // A blocked task must NEVER be rank #1 in code!
      const { recommendations: finalRecommendations, constraintEnforced } =
        enforcePlannerConstraints(orderedRecs);

      const rationale = parsed.rationale || 'Prioritized open tasks based on priority, due dates, and dependencies.';

      const steps = [
        ...state.steps,
        {
          step: 'formatOutput',
          description: `Formatted ${finalRecommendations.length} recommendations. Hard constraint enforced: ${constraintEnforced}.`,
          timestamp: new Date().toISOString(),
        },
      ];

      return {
        recommendations: finalRecommendations,
        rationale,
        constraintEnforced,
        steps,
      };
    })

    .addEdge(START, 'gatherContext')
    .addEdge('gatherContext', 'reason')
    .addEdge('reason', 'formatOutput')
    .addEdge('formatOutput', END);

  return workflow.compile();
}

/**
 * Execute Planner Agent LangGraph workflow with OD-7 guardrails and P4-5 audit logging.
 */
export async function runPlanner(
  userId: string,
  projectId?: string | null,
  focus?: string,
  guardrailsOptions?: GuardrailsOptions,
) {
  return await executeAgentWithGuardrails<PlannerState, PlannerOutputDto>({
    userId,
    agentType: 'planner',
    projectId: projectId ?? null,
    guardrailsOptions,
    initialState: {
      userId,
      projectId: projectId ?? null,
      focus,
      steps: [],
      tokensUsed: 0,
      structuredContext: null,
      memories: [],
      rawLLMOutput: '',
      recommendations: [],
      rationale: '',
      constraintEnforced: false,
    },
    runGraph: async (initialState, guardrails) => {
      const graph = createPlannerGraph(guardrails);
      const finalState = (await graph.invoke(initialState as any)) as unknown as PlannerState;

      const unblockedCount = finalState.recommendations.filter((r) => !r.isBlocked).length;
      const blockedCount = finalState.recommendations.filter((r) => r.isBlocked).length;

      const output: PlannerOutputDto = {
        recommendations: finalState.recommendations,
        rationale: finalState.rationale,
        unblockedCount,
        blockedCount,
      };

      return {
        state: finalState,
        output,
      };
    },
  });
}
