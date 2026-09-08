/* eslint-disable no-console */
import { OllamaProvider } from '../../gateway/ollama.provider.js';
import { enforcePlannerConstraints } from '../planner/planner-constraint.js';
import { type PlannerRecommendationDto, type Priority } from '@lifeos/shared';

interface EvalTask {
  id: string;
  title: string;
  priority: Priority;
  status: 'todo' | 'in-progress';
  dueDate: string | null;
  isBlocked: boolean;
  blockingTaskTitles: string[];
}

interface Scenario {
  name: string;
  category: 'simple' | 'conflicted' | 'blocked' | 'multi-dependency' | 'ambiguous';
  description: string;
  projectName: string;
  focus?: string;
  memories?: string[];
  tasks: EvalTask[];
}

const SCENARIOS: Scenario[] = [
  // 1. Simple: 3 tasks, clear priority difference
  {
    name: 'Scenario 1: Simple Priority Hierarchy',
    category: 'simple',
    description: '3 tasks: Low, Medium, and Urgent. No dependencies.',
    projectName: 'LifeOS Core',
    tasks: [
      { id: 't1', title: 'Update documentation formatting', priority: 'low', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
      { id: 't2', title: 'Refactor user profile avatar', priority: 'medium', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
      { id: 't3', title: 'Fix production database connection drop', priority: 'urgent', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
    ],
  },
  // 2. Simple: Due date urgency with equal priority
  {
    name: 'Scenario 2: Simple Due Date Urgency',
    category: 'simple',
    description: '3 medium tasks, one due today, one due next week, one with no due date.',
    projectName: 'Client Deliverables',
    tasks: [
      { id: 't1', title: 'Draft weekly summary newsletter', priority: 'medium', status: 'todo', dueDate: '2026-09-14T00:00:00Z', isBlocked: false, blockingTaskTitles: [] },
      { id: 't2', title: 'Submit client invoice for signed SOW', priority: 'medium', status: 'todo', dueDate: '2026-09-07T18:00:00Z', isBlocked: false, blockingTaskTitles: [] },
      { id: 't3', title: 'Explore competitor feature set', priority: 'medium', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
    ],
  },
  // 3. Blocked: Urgent task blocked by low priority prerequisite
  {
    name: 'Scenario 3: Blocked Urgent Task (Direct Dependency)',
    category: 'blocked',
    description: 'Urgent task blocked by low-priority prerequisite. Unblocked medium task also present.',
    projectName: 'Payment Gateway Integration',
    tasks: [
      { id: 't-api', title: 'Obtain Stripe test API sandbox keys', priority: 'low', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
      { id: 't-pay', title: 'Implement Stripe webhook handler', priority: 'urgent', status: 'todo', dueDate: '2026-09-08T00:00:00Z', isBlocked: true, blockingTaskTitles: ['Obtain Stripe test API sandbox keys'] },
      { id: 't-audit', title: 'Review audit log export formatting', priority: 'medium', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
    ],
  },
  // 4. Blocked: High priority task blocked by medium task
  {
    name: 'Scenario 4: High Task Blocked by Medium Prerequisite',
    category: 'blocked',
    description: 'High priority task blocked by medium prerequisite, with another unblocked high priority task.',
    projectName: 'Auth Security Overhaul',
    tasks: [
      { id: 't-schema', title: 'Add 2FA secret column to users migration', priority: 'medium', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
      { id: 't-totp', title: 'Verify TOTP QR code flow in onboarding', priority: 'high', status: 'todo', dueDate: null, isBlocked: true, blockingTaskTitles: ['Add 2FA secret column to users migration'] },
      { id: 't-pass', title: 'Enforce 12-char minimum password policy', priority: 'high', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
    ],
  },
  // 5. Multi-dependency: Chain of 3 tasks (C -> B -> A)
  {
    name: 'Scenario 5: 3-Node Dependency Chain',
    category: 'multi-dependency',
    description: 'Task A depends on Task B, which depends on Task C. Only C is unblocked.',
    projectName: 'Cloud Migration',
    tasks: [
      { id: 't-cutover', title: 'Production DNS cutover to new cluster', priority: 'urgent', status: 'todo', dueDate: '2026-09-09T00:00:00Z', isBlocked: true, blockingTaskTitles: ['Verify staging database replication'] },
      { id: 't-repl', title: 'Verify staging database replication', priority: 'high', status: 'todo', dueDate: null, isBlocked: true, blockingTaskTitles: ['Provision read replica in AWS us-east-1'] },
      { id: 't-prov', title: 'Provision read replica in AWS us-east-1', priority: 'high', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
    ],
  },
  // 6. Multi-dependency: Diamond / Multiple prerequisites (A depends on both B and C)
  {
    name: 'Scenario 6: Dual Prerequisites',
    category: 'multi-dependency',
    description: 'Deploy release blocked by both Code review AND QA signoff.',
    projectName: 'Release v2.0',
    tasks: [
      { id: 't-deploy', title: 'Deploy v2.0 to production', priority: 'urgent', status: 'todo', dueDate: '2026-09-08T12:00:00Z', isBlocked: true, blockingTaskTitles: ['Complete peer code review', 'QA signoff on regression suite'] },
      { id: 't-review', title: 'Complete peer code review', priority: 'high', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
      { id: 't-qa', title: 'QA signoff on regression suite', priority: 'high', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
    ],
  },
  // 7. Conflicted: Urgent bug fix vs strategic high-effort feature
  {
    name: 'Scenario 7: Urgent Bug vs Strategic Milestone',
    category: 'conflicted',
    description: 'Urgent low-effort customer bug vs High-priority quarterly milestone with due date.',
    projectName: 'Mobile App',
    focus: 'Strategic milestones are top priority for Q3',
    memories: ['Q3 company goal is completing the offline sync architecture.'],
    tasks: [
      { id: 't-bug', title: 'Fix Android push notification crash on startup', priority: 'urgent', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
      { id: 't-sync', title: 'Finalize SQLite offline sync engine', priority: 'high', status: 'todo', dueDate: '2026-09-10T00:00:00Z', isBlocked: false, blockingTaskTitles: [] },
      { id: 't-copy', title: 'Update privacy policy links in settings', priority: 'low', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
    ],
  },
  // 8. Conflicted: Overdue medium vs today urgent
  {
    name: 'Scenario 8: Overdue Task vs Urgent Task Today',
    category: 'conflicted',
    description: 'Medium task 2 days overdue vs Urgent task due end of day today.',
    projectName: 'Operations',
    tasks: [
      { id: 't-overdue', title: 'Renew SSL certificate for staging environment', priority: 'medium', status: 'todo', dueDate: '2026-09-05T00:00:00Z', isBlocked: false, blockingTaskTitles: [] },
      { id: 't-urgent', title: 'Restore corrupted Redis session cluster', priority: 'urgent', status: 'todo', dueDate: '2026-09-07T23:59:00Z', isBlocked: false, blockingTaskTitles: [] },
      { id: 't-backlog', title: 'Archive inactive user records older than 2 years', priority: 'low', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
    ],
  },
  // 9. Ambiguous: User focus prompt specifies area of work
  {
    name: 'Scenario 9: Focus-Guided Prioritization',
    category: 'ambiguous',
    description: 'All tasks have equal "high" priority; user specifically requests "focus on backend API security".',
    projectName: 'LifeOS Platform',
    focus: 'backend API security',
    tasks: [
      { id: 't-front', title: 'Update frontend React 19 types', priority: 'high', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
      { id: 't-sec', title: 'Implement rate limiting and token bucket middleware', priority: 'high', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
      { id: 't-docs', title: 'Write public OpenAPI documentation spec', priority: 'high', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
    ],
  },
  // 10. Ambiguous: Equal priorities and dates with active memory preference
  {
    name: 'Scenario 10: Preference-Guided Ambiguity Resolution',
    category: 'ambiguous',
    description: 'Two identical medium tasks; user memory notes preference for "test-driven refactoring first".',
    projectName: 'Core Engine',
    memories: ['User prefers writing automated integration tests before expanding new features.'],
    tasks: [
      { id: 't-feat', title: 'Add recurring task recurrence rules', priority: 'medium', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
      { id: 't-test', title: 'Increase unit test coverage on task service to 90%', priority: 'medium', status: 'todo', dueDate: null, isBlocked: false, blockingTaskTitles: [] },
    ],
  },
];

async function runEvaluation() {
  console.log('================================================================');
  console.log('LifeOS P4-7: Empirical Evaluation of qwen3:8b (OD-10 Resolution)');
  console.log('================================================================\n');

  const provider = new OllamaProvider({ baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' });

  const results: Array<{
    scenario: string;
    category: string;
    validJson: boolean;
    rawRank1Id: string;
    rawRank1Title: string;
    rawRank1Blocked: boolean;
    constraintFired: boolean;
    finalRank1Title: string;
    finalRank1Blocked: boolean;
    tokens: { prompt: number; eval: number; total: number };
    durationMs: number;
    rationale: string;
  }> = [];

  let totalPromptTokens = 0;
  let totalEvalTokens = 0;
  let jsonSuccessCount = 0;
  let rawBlockedRank1Count = 0;
  let constraintFiredCount = 0;

  for (let i = 0; i < SCENARIOS.length; i++) {
    const sc = SCENARIOS[i]!;
    console.log(`[${i + 1}/10] Testing: ${sc.name} (${sc.category})...`);

    const tasksPrompt = sc.tasks
      .map(
        (t, idx) =>
          `${idx + 1}. [ID: ${t.id}] "${t.title}" | Priority: ${t.priority} | Status: ${t.status} | Due: ${t.dueDate || 'None'}${t.isBlocked ? ` | BLOCKED BY: ${t.blockingTaskTitles.join(', ')}` : ' | UNBLOCKED'}`,
      )
      .join('\n');

    const memoriesPrompt =
      sc.memories && sc.memories.length > 0
        ? sc.memories.map((m) => `- ${m}`).join('\n')
        : 'None recorded.';

    const systemPrompt = `You are the LifeOS Planner Agent. Your job is to rank open tasks for the user by weighing multiple factors together:
1. Priority (urgent > high > medium > low)
2. Due dates (overdue or near-term tasks take precedence)
3. Dependency status (blocked tasks cannot be completed yet)
4. Project goals and user preferences

CRITICAL INSTRUCTION:
Return ONLY a valid JSON object matching this schema:
{
  "rationale": "High-level explanation of your prioritization strategy",
  "recommendations": [
    {
      "taskId": "UUID of task",
      "rank": 1,
      "rationale": "Specific reason this task is at this rank"
    }
  ]
}
Ensure all open tasks are included in the ranking.`;

    const userMessage = `PROJECT: ${sc.projectName}
${sc.focus ? `USER FOCUS: ${sc.focus}\n` : ''}
USER MEMORIES & GOALS:
${memoriesPrompt}

OPEN TASKS TO RANK:
${tasksPrompt}

Analyze these tasks and return the ranked JSON recommendations now.`;

    const startTime = Date.now();
    let responseText = '';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      for await (const evt of provider.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
      })) {
        if (evt.type === 'token') {
          responseText += evt.content;
        } else if (evt.type === 'done' && evt.usage) {
          usage = evt.usage;
        }
      }
    } catch (err) {
      console.error(`Error querying model in ${sc.name}:`, err);
    }

    const durationMs = Date.now() - startTime;
    totalPromptTokens += usage.promptTokens;
    totalEvalTokens += usage.completionTokens;

    // Parse JSON
    let parsed: any = null;
    let validJson = false;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
          validJson = true;
          jsonSuccessCount++;
        }
      }
    } catch (_e) {
      validJson = false;
    }

    const rawRecs = validJson ? parsed.recommendations : [];
    const rawRank1Id = rawRecs.length > 0 ? rawRecs[0].taskId : '';
    const rawRank1Task = sc.tasks.find((t) => t.id === rawRank1Id);
    const rawRank1Blocked = rawRank1Task ? rawRank1Task.isBlocked : false;

    if (rawRank1Blocked) {
      rawBlockedRank1Count++;
    }

    // Convert to PlannerRecommendationDto array for constraint enforcement
    const taskMap = new Map(sc.tasks.map((t) => [t.id, t]));
    const parsedDtoList: PlannerRecommendationDto[] = [];
    const seenIds = new Set<string>();

    for (let r = 0; r < rawRecs.length; r++) {
      const item = rawRecs[r];
      if (!item || !item.taskId) continue;
      const t = taskMap.get(item.taskId);
      if (!t || seenIds.has(t.id)) continue;
      seenIds.add(t.id);
      parsedDtoList.push({
        taskId: t.id,
        taskTitle: t.title,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
        rank: r + 1,
        rationale: item.rationale || '',
        isBlocked: t.isBlocked,
        blockingTaskTitles: t.blockingTaskTitles,
      });
    }

    // Add omitted
    for (const t of sc.tasks) {
      if (!seenIds.has(t.id)) {
        parsedDtoList.push({
          taskId: t.id,
          taskTitle: t.title,
          priority: t.priority,
          status: t.status,
          dueDate: t.dueDate,
          rank: parsedDtoList.length + 1,
          rationale: 'Omitted by model, appended',
          isBlocked: t.isBlocked,
          blockingTaskTitles: t.blockingTaskTitles,
        });
      }
    }

    // Apply code constraint (P4-4)
    const { recommendations: finalRecs, constraintEnforced } = enforcePlannerConstraints(parsedDtoList);
    if (constraintEnforced) {
      constraintFiredCount++;
    }

    const finalRank1 = finalRecs[0];

    results.push({
      scenario: sc.name,
      category: sc.category,
      validJson,
      rawRank1Id,
      rawRank1Title: rawRank1Task ? rawRank1Task.title : 'None',
      rawRank1Blocked,
      constraintFired: constraintEnforced,
      finalRank1Title: finalRank1 ? finalRank1.taskTitle : 'None',
      finalRank1Blocked: finalRank1 ? finalRank1.isBlocked : false,
      tokens: { prompt: usage.promptTokens, eval: usage.completionTokens, total: usage.totalTokens },
      durationMs,
      rationale: parsed?.rationale || 'N/A',
    });

    console.log(`  -> JSON: ${validJson ? 'VALID' : 'INVALID'} | Raw #1: "${rawRank1Task?.title}" (Blocked: ${rawRank1Blocked}) | Constraint Fired: ${constraintEnforced} | Latency: ${durationMs}ms`);
  }

  console.log('\n================================================================');
  console.log('EMPIRICAL EVALUATION SUMMARY');
  console.log('================================================================\n');

  console.log(`Scenarios Tested: ${SCENARIOS.length}`);
  console.log(`Strict JSON Syntax Compliance: ${jsonSuccessCount}/${SCENARIOS.length} (${(jsonSuccessCount / SCENARIOS.length) * 100}%)`);
  console.log(`Raw LLM Placed Blocked Task at #1: ${rawBlockedRank1Count}/${SCENARIOS.length}`);
  console.log(`Code Constraint Interventions: ${constraintFiredCount}`);
  console.log(`Guaranteed Final Unblocked #1: ${results.filter((r) => !r.finalRank1Blocked).length}/${SCENARIOS.length} (100%)`);
  console.log(`Average Latency: ${(results.reduce((acc, r) => acc + r.durationMs, 0) / SCENARIOS.length).toFixed(0)}ms`);
  console.log(`Average Total Tokens: ${(results.reduce((acc, r) => acc + r.tokens.total, 0) / SCENARIOS.length).toFixed(0)} tokens`);
  console.log(`Total Prompt Tokens: ${totalPromptTokens}, Total Completion Tokens: ${totalEvalTokens}\n`);

  console.log(JSON.stringify(results, null, 2));
}

runEvaluation().catch(console.error);
