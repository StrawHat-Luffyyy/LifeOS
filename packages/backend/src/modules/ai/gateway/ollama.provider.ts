import { config } from '../../../config/index.js';
import {
  type LLMProvider,
  type ChatOptions,
  type LLMChatEvent,
  type FinishReason,
  type LLMToolCall,
} from './llm-gateway.interface.js';

interface OllamaChunkMessage {
  role?: string;
  content?: string;
  tool_calls?: Array<{
    id?: string;
    function?: {
      name?: string;
      arguments?: Record<string, unknown> | string;
    };
  }>;
}

interface OllamaChunk {
  model?: string;
  created_at?: string;
  message?: OllamaChunkMessage;
  done?: boolean;
  done_reason?: string;
  finish_reason?: string;
  error?: string;
}

/**
 * Filter thinking-mode tokens to prevent chain-of-thought leaking into the UI (FR-OBS-2, A-1).
 */
export class StreamThinkingFilter {
  private inThinking = false;
  private buffer = '';

  public processChunk(token: string): string {
    this.buffer += token;

    let output = '';

    while (this.buffer.length > 0) {
      if (!this.inThinking) {
        const thinkStartIdx = this.buffer.indexOf('<think>');
        if (thinkStartIdx === -1) {
          // Check if buffer ends with a partial '<think' prefix
          const partialPrefix = this.findPartialTag(this.buffer, '<think>');
          if (partialPrefix) {
            output += this.buffer.slice(0, this.buffer.length - partialPrefix.length);
            this.buffer = partialPrefix;
            break;
          } else {
            output += this.buffer;
            this.buffer = '';
            break;
          }
        } else {
          // Output content before <think>
          output += this.buffer.slice(0, thinkStartIdx);
          this.buffer = this.buffer.slice(thinkStartIdx + '<think>'.length);
          this.inThinking = true;
        }
      } else {
        // We are inside <think>...</think>
        const thinkEndIdx = this.buffer.indexOf('</think>');
        if (thinkEndIdx === -1) {
          // Still in thinking block, discard buffer except possible partial '</think'
          const partialPrefix = this.findPartialTag(this.buffer, '</think>');
          if (partialPrefix) {
            this.buffer = partialPrefix;
          } else {
            this.buffer = '';
          }
          break;
        } else {
          // End of thinking block
          this.buffer = this.buffer.slice(thinkEndIdx + '</think>'.length);
          this.inThinking = false;
        }
      }
    }

    return output;
  }

  public flush(): string {
    if (this.inThinking) {
      this.buffer = '';
      return '';
    }
    const rem = this.buffer;
    this.buffer = '';
    return rem;
  }

  private findPartialTag(str: string, tag: string): string | null {
    for (let i = 1; i < tag.length; i++) {
      const slice = tag.slice(0, i);
      if (str.endsWith(slice)) {
        return slice;
      }
    }
    return null;
  }
}

/**
 * Concrete Ollama implementation of the LLMProvider interface (FR-CHAT-3, P2-1).
 */
export class OllamaProvider implements LLMProvider {
  public readonly name = 'ollama';
  private baseUrl: string;
  private model: string;
  private defaultTemperature: number;

  constructor(options?: { baseUrl?: string; model?: string; temperature?: number }) {
    this.baseUrl = options?.baseUrl ?? config.OLLAMA_BASE_URL;
    this.model = options?.model ?? config.OLLAMA_MODEL;
    this.defaultTemperature = options?.temperature ?? config.LLM_TEMPERATURE;
  }

  public async *chat(options: ChatOptions): AsyncIterable<LLMChatEvent> {
    try {
      yield* this.executeChatWithRetry(options, 0);
    } catch (err: unknown) {
      if (options.signal?.aborted) {
        yield { type: 'done', finishReason: 'interrupted' };
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      yield { type: 'error', error: message };
    }
  }

  private async *executeChatWithRetry(
    options: ChatOptions,
    attempt: number,
  ): AsyncIterable<LLMChatEvent> {
    const messages = options.messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.toolCallId,
        };
      }
      return {
        role: m.role,
        content: m.content,
        ...(m.toolCalls && m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: tc.arguments,
                },
              })),
            }
          : {}),
      };
    });

    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true,
      options: {
        temperature: options.temperature ?? this.defaultTemperature,
        // Disable Qwen3 thinking mode to avoid chain-of-thought token leak (A-1, FR-OBS-2)
        think: false,
      },
    };

    if (options.tools && options.tools.length > 0) {
      requestBody['tools'] = options.tools;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Ollama response body is empty');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    const thinkingFilter = new StreamThinkingFilter();

    let buffer = '';
    const accumulatedToolCalls: LLMToolCall[] = [];
    let detectedFinishReason: FinishReason | null = null;
    let malformedToolCallEncountered = false;
    let rawContentAccumulated = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: OllamaChunk;
        try {
          parsed = JSON.parse(trimmed) as OllamaChunk;
        } catch {
          continue;
        }

        if (parsed.error) {
          throw new Error(`Ollama stream error: ${parsed.error}`);
        }

        const msg = parsed.message;
        if (msg) {
          // Text content token delta
          if (msg.content) {
            rawContentAccumulated += msg.content;
            const filtered = thinkingFilter.processChunk(msg.content);
            if (filtered) {
              yield { type: 'token', content: filtered };
            }
          }

          // Tool calls
          if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
            for (let i = 0; i < msg.tool_calls.length; i++) {
              const tc = msg.tool_calls[i];
              if (!tc) continue;
              const fn = tc.function;
              if (!fn || !fn.name) continue;

              let parsedArgs: Record<string, unknown>;
              if (typeof fn.arguments === 'string') {
                try {
                  parsedArgs = JSON.parse(fn.arguments) as Record<string, unknown>;
                } catch (parseErr) {
                  malformedToolCallEncountered = true;
                  console.warn(
                    `[OllamaProvider] Failed to parse tool call arguments for ${fn.name}: ${fn.arguments}`,
                    parseErr,
                  );
                  continue;
                }
              } else if (typeof fn.arguments === 'object' && fn.arguments !== null) {
                parsedArgs = fn.arguments;
              } else {
                parsedArgs = {};
              }

              const callId = tc.id || `call_${Date.now()}_${i}`;
              const toolCallObj: LLMToolCall = {
                id: callId,
                name: fn.name,
                arguments: parsedArgs,
              };

              accumulatedToolCalls.push(toolCallObj);
              yield {
                type: 'tool_call',
                id: toolCallObj.id,
                name: toolCallObj.name,
                arguments: toolCallObj.arguments,
              };
            }
          }
        }

        // Ollama finish_reason / done_reason handling
        if (parsed.done) {
          const reason = parsed.done_reason || parsed.finish_reason || 'stop';
          if (reason === 'length') {
            detectedFinishReason = 'length';
          } else if (accumulatedToolCalls.length > 0) {
            detectedFinishReason = 'tool_calls';
          } else {
            detectedFinishReason = 'stop';
          }
        }
      }
    }

    // Flush any leftover buffer in the thinking filter
    const remaining = thinkingFilter.flush();
    if (remaining) {
      yield { type: 'token', content: remaining };
    }

    // Malformed tool-call handling (P2-1):
    // If tool call JSON was malformed when a tool call was expected, retry once.
    if (malformedToolCallEncountered && accumulatedToolCalls.length === 0) {
      if (attempt === 0) {
        console.warn(
          `[OllamaProvider] Malformed tool call JSON detected on attempt 0. Retrying turn once...`,
        );
        yield* this.executeChatWithRetry(options, attempt + 1);
        return;
      } else {
        console.warn(
          `[OllamaProvider] Malformed tool call JSON failed on attempt 1. Falling back to plain text reply.`,
        );
        if (rawContentAccumulated) {
          yield { type: 'token', content: rawContentAccumulated };
        }
        yield { type: 'done', finishReason: 'stop' };
        return;
      }
    }

    const finalReason: FinishReason =
      detectedFinishReason ??
      (accumulatedToolCalls.length > 0 ? 'tool_calls' : 'stop');

    yield { type: 'done', finishReason: finalReason };
  }
}
