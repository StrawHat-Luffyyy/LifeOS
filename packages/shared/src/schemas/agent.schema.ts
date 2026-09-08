import { z } from 'zod';
import { AGENT_TYPES, AGENT_RUN_STATUSES } from '../types/index.js';

export const listAgentRunsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    agentType: z.enum(AGENT_TYPES).optional(),
    projectId: z.string().uuid().optional(),
    status: z.enum(AGENT_RUN_STATUSES).optional(),
  }),
});

export const getAgentRunSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid agent run ID'),
  }),
});

export const runPlannerSchema = z.object({
  body: z.object({
    projectId: z.string().uuid().nullable().optional(),
    focus: z.string().trim().max(1000).optional(),
  }),
});

export const runContinueProjectSchema = z.object({
  params: z.object({
    projectId: z.string().uuid('Invalid project ID'),
  }),
});

export const acceptPlannerRecommendationSchema = z.object({
  params: z.object({
    taskId: z.string().uuid('Invalid task ID'),
  }),
  body: z
    .object({
      rationale: z.string().trim().max(1000).optional(),
    })
    .optional(),
});

export const rejectPlannerRecommendationSchema = z.object({
  params: z.object({
    taskId: z.string().uuid('Invalid task ID'),
  }),
  body: z
    .object({
      rationale: z.string().trim().max(1000).optional(),
    })
    .optional(),
});

export type ListAgentRunsQuery = z.infer<typeof listAgentRunsSchema>['query'];
export type RunPlannerInput = z.input<typeof runPlannerSchema>['body'];
export type AcceptPlannerRecommendationInput = z.input<typeof acceptPlannerRecommendationSchema>['body'];
export type RejectPlannerRecommendationInput = z.input<typeof rejectPlannerRecommendationSchema>['body'];
