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

/** Activity event types (non-exhaustive — extend as new entity types are added). */
export const EVENT_TYPES = [
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_COMPLETED',
  'TASK_DELETED',
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_STATUS_CHANGED',
  'NOTE_CREATED',
  'NOTE_UPDATED',
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

