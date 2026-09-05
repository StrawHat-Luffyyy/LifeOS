import { type RiskTier } from '@lifeos/shared';
import { type ToolDefinition } from '../gateway/llm-gateway.interface.js';
import * as taskService from '../../tasks/task.service.js';
import * as noteService from '../../notes/note.service.js';
import * as projectService from '../../projects/project.service.js';
import * as activityService from '../../activity/activity.service.js';

export interface ToolExecutionContext {
  userId: string;
  conversationId: string;
}

export interface RegisteredTool {
  name: string;
  riskTier: RiskTier;
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<Record<string, unknown>>;
}

export const createTaskToolDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'createTask',
    description: 'Create a new task in LifeOS for the user.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the task' },
        description: { type: 'string', description: 'Optional detailed description' },
        dueDate: { type: 'string', description: 'Optional ISO 8601 due date' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Task priority (default: medium)',
        },
        status: {
          type: 'string',
          enum: ['todo', 'in-progress', 'done', 'cancelled'],
          description: 'Initial task status (default: todo)',
        },
        projectId: { type: 'string', description: 'Optional UUID of the associated project' },
      },
      required: ['title'],
    },
  },
};

export const createNoteToolDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'createNote',
    description: 'Create a new note in LifeOS for the user.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the note' },
        content: { type: 'string', description: 'Body content of the note' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional array of tag strings',
        },
        projectId: { type: 'string', description: 'Optional UUID of the associated project' },
      },
      required: ['title'],
    },
  },
};

export const updateTaskStatusToolDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'updateTaskStatus',
    description: 'Update the lifecycle status of an existing task.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'UUID of the task to update' },
        status: {
          type: 'string',
          enum: ['todo', 'in-progress', 'done', 'cancelled'],
          description: 'New status for the task',
        },
      },
      required: ['taskId', 'status'],
    },
  },
};

export const getProjectContextToolDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'getProjectContext',
    description: 'Retrieve context for a specific project, including open tasks, recent notes, and activity timeline.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'UUID of the project' },
      },
      required: ['projectId'],
    },
  },
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  createTaskToolDef,
  createNoteToolDef,
  updateTaskStatusToolDef,
  getProjectContextToolDef,
];

export const TOOL_REGISTRY: Record<string, RegisteredTool> = {
  createTask: {
    name: 'createTask',
    riskTier: 'WRITE',
    definition: createTaskToolDef,
    handler: async (args, context) => {
      const task = await taskService.createTask(
        context.userId,
        {
          title: String(args['title']),
          description: args['description'] ? String(args['description']) : undefined,
          dueDate: args['dueDate'] ? String(args['dueDate']) : undefined,
          priority: args['priority'] as any,
          status: args['status'] as any,
          projectId: args['projectId'] ? String(args['projectId']) : undefined,
        },
        { source: 'ai', conversationId: context.conversationId },
      );
      return { success: true, task };
    },
  },
  createNote: {
    name: 'createNote',
    riskTier: 'WRITE',
    definition: createNoteToolDef,
    handler: async (args, context) => {
      const tagsVal = args['tags'];
      const tags = Array.isArray(tagsVal) ? tagsVal.map(String) : [];

      const note = await noteService.createNote(
        context.userId,
        {
          title: String(args['title']),
          content: args['content'] ? String(args['content']) : '',
          tags,
          projectId: args['projectId'] ? String(args['projectId']) : undefined,
        },
        { source: 'ai', conversationId: context.conversationId },
      );
      return { success: true, note };
    },
  },
  updateTaskStatus: {
    name: 'updateTaskStatus',
    riskTier: 'WRITE',
    definition: updateTaskStatusToolDef,
    handler: async (args, context) => {
      const task = await taskService.updateTask(
        context.userId,
        String(args['taskId']),
        { status: args['status'] as any },
        { source: 'ai', conversationId: context.conversationId },
      );
      return { success: true, task };
    },
  },
  getProjectContext: {
    name: 'getProjectContext',
    riskTier: 'READ_ONLY',
    definition: getProjectContextToolDef,
    handler: async (args, context) => {
      const projectId = String(args['projectId']);

      // Verify ownership (throws 404 if project does not exist or belongs to another user) (A-4)
      const project = await projectService.getProject(context.userId, projectId);

      // Fetch open tasks
      const tasksRes = await taskService.listTasks(context.userId, {
        projectId,
        limit: 50,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      const openTasks = tasksRes.data.filter(
        (t) => t.status !== 'done' && t.status !== 'cancelled',
      );

      // Fetch recent notes
      const notesRes = await noteService.listNotes(context.userId, {
        projectId,
        limit: 10,
        page: 1,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      // Fetch recent activity
      const activityRes = await activityService.listProjectActivity(
        context.userId,
        projectId,
        { limit: 10, page: 1 },
      );

      return {
        success: true,
        project,
        openTasksCount: openTasks.length,
        openTasks: openTasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority, status: t.status })),
        recentNotes: notesRes.data.map((n) => ({ id: n.id, title: n.title, tags: n.tags })),
        recentActivity: activityRes.data.map((a) => ({ id: a.id, summary: a.summary, createdAt: a.createdAt })),
      };
    },
  },
};
