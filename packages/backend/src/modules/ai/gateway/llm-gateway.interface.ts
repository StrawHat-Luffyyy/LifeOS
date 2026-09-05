/**
 * Provider-agnostic LLM Gateway Interface (FR-CHAT-3).
 *
 * No controller, service, or tool handler may call vendor SDKs directly.
 * All LLM interactions flow through this interface.
 */

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: LLMToolCall[];
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ChatOptions {
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  signal?: AbortSignal;
}

export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'interrupted' | 'error';

export type LLMChatEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'done'; finishReason: FinishReason }
  | { type: 'error'; error: string };

export interface LLMProvider {
  name: string;
  chat(options: ChatOptions): AsyncIterable<LLMChatEvent>;
}
