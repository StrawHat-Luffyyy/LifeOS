import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import {
  type AgentStepSummaryItem,
  type ContinueProjectSummaryDto,
  type ContinueProjectCitationDto,
} from '@lifeos/shared';
import {
  projectContextEngine,
  type StructuredProjectContext,
  type SemanticProjectContext,
} from '../context/project-context.engine.js';
import {
  buildEvidencePool,
  validateCitations,
  stripUngroundedClaims,
  type EvidenceItem,
} from './citation-validator.js';
import { getLLMProvider } from '../../gateway/index.js';
import { executeAgentWithGuardrails, type BaseAgentState } from '../base/base-agent.js';
import { type RunGuardrails, type GuardrailsOptions } from '../base/guardrails.js';

export interface ContinueProjectState extends BaseAgentState {
  structuredContext: StructuredProjectContext | null;
  semanticContext: SemanticProjectContext | null;
  evidenceItems: EvidenceItem[];
  summaryText: string;
  citationStatus: 'clean' | 'retried' | 'claim_stripped';
  citations: ContinueProjectCitationDto[];
  parsedSections: {
    currentState: string;
    recentProgress: string;
    openTasks: string;
    recentDecisions: string;
    blockers: string;
    suggestedNextStep: string;
  };
}

export const ContinueProjectAnnotation = Annotation.Root({
  userId: Annotation<string>,
  projectId: Annotation<string | null>,
  steps: Annotation<AgentStepSummaryItem[]>,
  tokensUsed: Annotation<number>,
  error: Annotation<string | undefined>,
  structuredContext: Annotation<StructuredProjectContext | null>,
  semanticContext: Annotation<SemanticProjectContext | null>,
  evidenceItems: Annotation<EvidenceItem[]>,
  summaryText: Annotation<string>,
  citationStatus: Annotation<'clean' | 'retried' | 'claim_stripped'>,
  citations: Annotation<ContinueProjectCitationDto[]>,
  parsedSections: Annotation<{
    currentState: string;
    recentProgress: string;
    openTasks: string;
    recentDecisions: string;
    blockers: string;
    suggestedNextStep: string;
  }>,
});

/**
 * Creates and compiles the 3-node LangGraph graph for Continue Project (P4-3).
 * Nodes: gatherStructuredContext -> gatherSemanticContext -> synthesize
 */
export function createContinueProjectGraph(guardrails: RunGuardrails) {
  const workflow = new StateGraph(ContinueProjectAnnotation)
    // Node 1: Gather structured context
    .addNode('gatherStructuredContext', async (state) => {
      const structured = await projectContextEngine.getStructuredContext(
        state.userId,
        state.projectId,
      );

      const steps = [
        ...state.steps,
        {
          step: 'gatherStructuredContext',
          description: `Gathered structured context: project "${structured.project.name}", ${structured.openTasks.length} open tasks, ${structured.recentActivity.length} recent activity events.`,
          timestamp: new Date().toISOString(),
        },
      ];

      return {
        structuredContext: structured,
        steps,
      };
    })

    // Node 2: Gather semantic context
    .addNode('gatherSemanticContext', async (state) => {
      const query = `Current state, recent progress, open tasks, decisions, and blockers for ${state.structuredContext?.project.name || 'project'}`;
      const semantic = await projectContextEngine.getSemanticContext(
        state.userId,
        query,
        state.projectId,
        6,
      );

      const steps = [
        ...state.steps,
        {
          step: 'gatherSemanticContext',
          description: `Retrieved ${semantic.rawResults.length} semantic items (${semantic.notes.length} notes, ${semantic.documents.length} document chunks, ${semantic.memories.length} memories).`,
          timestamp: new Date().toISOString(),
        },
      ];

      return {
        semanticContext: semantic,
        steps,
      };
    })

    // Node 3: Synthesize with citation enforcement (OD-3)
    .addNode('synthesize', async (state) => {
      const structured = state.structuredContext!;
      const semantic = state.semanticContext!;
      const { items: evidenceItems, promptText: evidencePrompt } = buildEvidencePool(
        structured,
        semantic,
      );

      const systemPrompt = `You are the LifeOS Continue Project Agent. Your task is to synthesize a grounded project status summary.

GROUNDING RULES (STRICT CITATION ENFORCEMENT - OD-3):
1. You may ONLY make claims based on the provided evidence pool.
2. Every substantive declarative statement or bullet point MUST end with the exact citation tag of the evidence it came from, e.g. [E1] or [E3].
3. If multiple evidence items support a statement, cite all of them, e.g. [E2][E4].
4. NEVER invent facts, hallucinate tools, or cite non-existent evidence indices.
5. If there is no evidence for a section, write "No recorded evidence."

OUTPUT FORMAT:
Format your answer with these exact 6 markdown sections. Keep each section ultra-concise (EXACTLY 1 single sentence or bullet point per section, under 100 words total across all 6 sections):
### Current State
(1 sentence with citations [E...])

### Recent Progress
(1 bullet point with citations [E...])

### Open Tasks
(1-2 bullet points with citations [E...])

### Recent Decisions
(1 bullet point with citations [E...])

### Blockers
(1 bullet point with citations [E...])

### Suggested Next Step
(1 sentence with citations [E...])`;

      const userMessage = `EVIDENCE POOL:
${evidencePrompt}

Synthesize the Continue Project summary now. Follow the exact 6 section format. Be ultra-concise (1 bullet/sentence per section) and cite evidence tags [E1]-[E${evidenceItems.length}] on every statement.`;

      const provider = getLLMProvider();

      // Turn 1: Initial synthesis
      let responseText = '';
      for await (const evt of guardrails.trackChat(provider, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        maxTokens: 180,
      })) {
        if (evt.type === 'token') {
          responseText += evt.content;
        }
      }

      // Citation validation (OD-3, B-4)
      const validation = validateCitations(responseText, evidenceItems.length);
      let citationStatus: 'clean' | 'retried' | 'claim_stripped' = 'clean';

      // If invalid, retry ONCE with strict reminder (OD-3)
      if (!validation.valid) {
        citationStatus = 'retried';
        const retryFeedback = `Your previous summary contained grounding errors:
${validation.invalidIndices.length > 0 ? `- Non-existent citation indices: ${validation.invalidIndices.map((i) => `[E${i}]`).join(', ')}. Valid indices are only [E1] to [E${evidenceItems.length}].` : ''}
${validation.uncitedClaims.length > 0 ? `- Uncited claims detected: "${validation.uncitedClaims.slice(0, 3).join('", "')}". Every statement must end with an evidence tag.` : ''}

Regenerate the complete summary now. Every substantive claim MUST cite a valid evidence tag between [E1] and [E${evidenceItems.length}].`;

        let retryResponseText = '';
        for await (const evt of guardrails.trackChat(provider, {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
            { role: 'assistant', content: responseText },
            { role: 'user', content: retryFeedback },
          ],
          maxTokens: 180,
        })) {
          if (evt.type === 'token') {
            retryResponseText += evt.content;
          }
        }

        const retryValidation = validateCitations(retryResponseText, evidenceItems.length);
        if (retryValidation.valid) {
          responseText = retryResponseText;
        } else {
          // If retry still fails, strip ungrounded claims and append disclaimer (OD-3)
          citationStatus = 'claim_stripped';
          const stripped = stripUngroundedClaims(retryResponseText, evidenceItems.length);
          responseText = stripped.cleanedText;
        }
      }

      // Parse output into sections
      const parsedSections = extractSections(responseText);

      // Extract cited citations from evidenceItems
      const citedIndices = new Set(
        Array.from(responseText.matchAll(/\[E(\d+)\]/g)).map((m) => parseInt(m[1]!, 10)),
      );
      const citations = evidenceItems.filter((e) => citedIndices.has(e.index));

      const steps = [
        ...state.steps,
        {
          step: 'synthesize',
          description: `Synthesized grounded summary with citations. Citation status: ${citationStatus} (${citations.length} evidence items cited).`,
          timestamp: new Date().toISOString(),
        },
      ];

      return {
        evidenceItems,
        summaryText: responseText,
        citationStatus,
        citations,
        parsedSections,
        steps,
      };
    })

    .addEdge(START, 'gatherStructuredContext')
    .addEdge('gatherStructuredContext', 'gatherSemanticContext')
    .addEdge('gatherSemanticContext', 'synthesize')
    .addEdge('synthesize', END);

  return workflow.compile();
}

/**
 * Execute Continue Project LangGraph workflow with OD-7 guardrails and P4-5 audit logging.
 */
export async function runContinueProject(
  userId: string,
  projectId: string,
  guardrailsOptions?: GuardrailsOptions,
) {
  return await executeAgentWithGuardrails<ContinueProjectState, ContinueProjectSummaryDto>({
    userId,
    agentType: 'continue_project',
    projectId,
    guardrailsOptions,
    initialState: {
      userId,
      projectId,
      steps: [],
      tokensUsed: 0,
      structuredContext: null,
      semanticContext: null,
      evidenceItems: [],
      summaryText: '',
      citationStatus: 'clean',
      citations: [],
      parsedSections: {
        currentState: '',
        recentProgress: '',
        openTasks: '',
        recentDecisions: '',
        blockers: '',
        suggestedNextStep: '',
      },
    },
    runGraph: async (initialState, guardrails) => {
      const graph = createContinueProjectGraph(guardrails);
      const finalState = (await graph.invoke(initialState as any)) as unknown as ContinueProjectState;

      const output: ContinueProjectSummaryDto = {
        currentState: finalState.parsedSections.currentState,
        recentProgress: finalState.parsedSections.recentProgress,
        openTasks: finalState.parsedSections.openTasks,
        recentDecisions: finalState.parsedSections.recentDecisions,
        blockers: finalState.parsedSections.blockers,
        suggestedNextStep: finalState.parsedSections.suggestedNextStep,
        citations: finalState.citations,
        citationStatus: finalState.citationStatus,
      };

      return {
        state: finalState,
        output,
      };
    },
  });
}

function extractSections(text: string) {
  const getSection = (name: string, nextSections: string[]) => {
    const pattern = new RegExp(`###?\\s*${name}\\s*([\\s\\S]*?)(?=(?:###?\\s*(?:${nextSections.join('|')}))|$)`, 'i');
    const match = text.match(pattern);
    return match && match[1] ? match[1].trim() : 'No recorded evidence.';
  };

  return {
    currentState: getSection('Current State', ['Recent Progress', 'Open Tasks', 'Recent Decisions', 'Blockers', 'Suggested Next Step']),
    recentProgress: getSection('Recent Progress', ['Open Tasks', 'Recent Decisions', 'Blockers', 'Suggested Next Step']),
    openTasks: getSection('Open Tasks', ['Recent Decisions', 'Blockers', 'Suggested Next Step']),
    recentDecisions: getSection('Recent Decisions', ['Blockers', 'Suggested Next Step']),
    blockers: getSection('Blockers', ['Suggested Next Step']),
    suggestedNextStep: getSection('Suggested Next Step', []),
  };
}
