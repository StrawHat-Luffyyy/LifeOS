import {
  type LLMProvider,
  type ChatOptions,
  type LLMChatEvent,
} from './llm-gateway.interface.js';

export interface MockResponseSequence {
  events: LLMChatEvent[];
  delayMs?: number;
}

/**
 * Mock LLM Provider for deterministic testing of the gateway, SSE streaming,
 * and tool-calling orchestrator without an external Ollama daemon.
 */
export class MockLLMProvider implements LLMProvider {
  public readonly name = 'mock';
  private responses: MockResponseSequence[] = [];
  private currentIdx = 0;

  constructor(responses?: MockResponseSequence[]) {
    if (responses) {
      this.responses = responses;
    }
  }

  public setResponses(responses: MockResponseSequence[]): void {
    this.responses = responses;
    this.currentIdx = 0;
  }

  public addResponse(sequence: MockResponseSequence): void {
    this.responses.push(sequence);
  }

  public reset(): void {
    this.responses = [];
    this.currentIdx = 0;
  }

  public async *chat(options: ChatOptions): AsyncIterable<LLMChatEvent> {
    if (this.currentIdx >= this.responses.length) {
      // Default fallback response if none queued
      yield { type: 'token', content: 'Mock assistant response.' };
      yield { type: 'done', finishReason: 'stop' };
      return;
    }

    const seq = this.responses[this.currentIdx++];
    if (!seq) {
      yield { type: 'token', content: 'Mock assistant response.' };
      yield { type: 'done', finishReason: 'stop' };
      return;
    }

    for (const event of seq.events) {
      if (options.signal?.aborted) {
        yield { type: 'done', finishReason: 'interrupted' };
        return;
      }
      if (seq.delayMs && seq.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, seq.delayMs));
      }
      yield event;
    }
  }
}
