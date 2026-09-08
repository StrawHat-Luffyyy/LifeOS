import { type LLMProvider, type ChatOptions, type LLMChatEvent, type TokenUsage } from '../../gateway/llm-gateway.interface.js';

export class RunTimeoutError extends Error {
  constructor(message = 'Agent run exceeded wall-clock timeout') {
    super(message);
    this.name = 'RunTimeoutError';
  }
}

export class RunBudgetExceededError extends Error {
  public readonly tokensUsed: number;
  public readonly tokenBudget: number;

  constructor(tokensUsed: number, tokenBudget: number) {
    super(`Agent run exceeded token budget (${tokensUsed} / ${tokenBudget} tokens)`);
    this.name = 'RunBudgetExceededError';
    this.tokensUsed = tokensUsed;
    this.tokenBudget = tokenBudget;
  }
}

export interface GuardrailsOptions {
  timeoutMs?: number;   // default: 45_000 (45 seconds)
  tokenBudget?: number; // default: 8_000 tokens combined input+output
}

/**
 * OD-7 Guardrails Engine with Addenda B-1 (real token counts) & B-2 (cumulative per-run budget).
 * Enforces per-run wall-clock timeout and total-token budget across all LLM turns in a run.
 */
export class RunGuardrails {
  public readonly timeoutMs: number;
  public readonly tokenBudget: number;
  private readonly abortController: AbortController;
  private timer: NodeJS.Timeout | null = null;
  private cumulativeTokens = 0;

  constructor(options?: GuardrailsOptions) {
    this.timeoutMs = options?.timeoutMs ?? 45_000;
    this.tokenBudget = options?.tokenBudget ?? 8_000;
    this.abortController = new AbortController();
  }

  public get signal(): AbortSignal {
    return this.abortController.signal;
  }

  public get tokensUsed(): number {
    return this.cumulativeTokens;
  }

  public get budget(): number {
    return this.tokenBudget;
  }

  public start(): void {
    if (this.timeoutMs > 0 && !this.timer) {
      this.timer = setTimeout(() => {
        this.abortController.abort(new RunTimeoutError(`Run exceeded timeout of ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    }
  }

  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Record tokens from an LLM call into the shared cumulative run total (B-1, B-2).
   * Reads exact promptTokens + completionTokens (from Ollama prompt_eval_count + eval_count).
   * Throws RunBudgetExceededError immediately if cumulative budget is exceeded.
   */
  public recordTokens(usage?: Partial<TokenUsage>): void {
    if (!usage) return;
    const prompt = usage.promptTokens ?? 0;
    const completion = usage.completionTokens ?? 0;
    const count = usage.totalTokens ?? (prompt + completion);
    this.cumulativeTokens += count;

    if (this.cumulativeTokens > this.tokenBudget) {
      const error = new RunBudgetExceededError(this.cumulativeTokens, this.tokenBudget);
      this.abortController.abort(error);
      throw error;
    }
  }

  /**
   * Track an LLM chat invocation:
   * Binds execution to the run guardrail's abort signal, streams response tokens,
   * and automatically records real token usage upon completion (B-1, B-2).
   */
  public async *trackChat(
    provider: LLMProvider,
    options: ChatOptions,
  ): AsyncIterable<LLMChatEvent> {
    if (this.signal.aborted) {
      throw this.signal.reason || new RunTimeoutError();
    }

    for await (const event of provider.chat({
      ...options,
      signal: this.signal,
    })) {
      if (event.type === 'done' && event.usage) {
        this.recordTokens(event.usage);
      }
      yield event;
    }

    if (this.signal.aborted) {
      throw this.signal.reason || new RunTimeoutError();
    }
  }
}
