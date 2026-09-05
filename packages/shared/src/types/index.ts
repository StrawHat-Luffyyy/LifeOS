// =============================================================================
// LifeOS Shared Types
// =============================================================================
// Canonical type definitions shared between backend and frontend.
// Keep this module free of runtime dependencies beyond Zod.

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Task priority levels, ordered by severity. */
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Task lifecycle statuses. */
export const TASK_STATUSES = ['todo', 'in-progress', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Project lifecycle statuses. */
export const PROJECT_STATUSES = ['active', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Tool risk tiers (FR-SAFE-1). */
export const RISK_TIERS = ['READ_ONLY', 'WRITE', 'DESTRUCTIVE', 'EXTERNAL'] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

/** Message roles in conversations. */
export const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** Message completion status. */
export const MESSAGE_STATUSES = ['completed', 'interrupted'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** Activity event types (non-exhaustive — extend as new entity types are added). */
export const EVENT_TYPES = [
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_COMPLETED',
  'TASK_DELETED',
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_STATUS_CHANGED',
  'PROJECT_DELETED',
  'NOTE_CREATED',
  'NOTE_UPDATED',
  'NOTE_DELETED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_DELETED',
  'AI_CHAT_STARTED',
  'AI_TOOL_CALLED',
  'AGENT_EXECUTED',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Entity types that activity events can reference. */
export const ENTITY_TYPES = ['task', 'project', 'note', 'document', 'conversation'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

// ---------------------------------------------------------------------------
// API Response Envelope
// ---------------------------------------------------------------------------

/** Standardized API success response. */
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

/** Standardized API error response. */
export interface ApiErrorResponse {
  success: false;
  error: ApiError;
}

/** Structured error payload. */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: PaginationMeta;
}

// ---------------------------------------------------------------------------
// Domain DTOs — Task
// ---------------------------------------------------------------------------

/** Shape of a Task as returned by the API. */
export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: Priority;
  status: TaskStatus;
  projectId: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Domain DTOs — Project
// ---------------------------------------------------------------------------

/** Shape of a Project as returned by the API. */
export interface ProjectDto {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Domain DTOs — Note
// ---------------------------------------------------------------------------

/** Shape of a Note as returned by the API. */
export interface NoteDto {
  id: string;
  title: string;
  content: string;
  tags: string[];
  projectId: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Domain DTOs — Activity
// ---------------------------------------------------------------------------

/** Shape of an Activity Event as returned by the API. */
export interface ActivityEventDto {
  id: string;
  userId: string;
  eventType: EventType;
  entityType: EntityType;
  entityId: string;
  projectId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Auth DTOs
// ---------------------------------------------------------------------------

export interface RegisterDto {
  email: string;
  password: string;
  name: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

export interface LogoutDto {
  refreshToken?: string;
}

// ---------------------------------------------------------------------------
// AI Chat & Tool DTOs (Phase 2)
// ---------------------------------------------------------------------------

/** Tool invocation audit record (FR-TOOL-3). */
export interface ToolCallDto {
  id: string;
  conversationId: string;
  messageId: string | null;
  toolName: string;
  riskTier: RiskTier;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdAt: string;
}

/** Shape of a Message as returned by the API. */
export interface MessageDto {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: string;
  toolCalls?: ToolCallDto[];
}

/** Shape of a Conversation as returned by the API. */
export interface ConversationDto {
  id: string;
  userId: string;
  projectId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** Conversation with its messages included. */
export interface ConversationWithMessagesDto extends ConversationDto {
  messages: MessageDto[];
}

/** Input DTO for creating a conversation. */
export interface CreateConversationInput {
  title?: string;
  projectId?: string;
}

/** Input DTO for updating a conversation. */
export interface UpdateConversationInput {
  title: string;
}

/** Query params for listing conversations. */
export interface ListConversationsQuery extends PaginationParams {
  projectId?: string;
}

/** Input DTO for sending a message in a conversation. */
export interface SendMessageInput {
  content: string;
}

/** SSE Streaming event shapes (FR-CHAT-2, FR-OBS-1, FR-OBS-2). */
export type ChatStreamEvent =
  | { type: 'message_start'; messageId: string }
  | { type: 'token'; content: string }
  | { type: 'tool_call_start'; toolName: string; riskTier: RiskTier; input: Record<string, unknown> }
  | { type: 'tool_call_result'; toolName: string; output: Record<string, unknown> }
  | { type: 'message_complete'; message: MessageDto }
  | { type: 'error'; message: string };

