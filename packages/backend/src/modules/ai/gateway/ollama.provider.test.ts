import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider, StreamThinkingFilter } from './ollama.provider.js';

describe('StreamThinkingFilter (FR-OBS-2, A-1)', () => {
  it('should pass through normal text unmodified', () => {
    const filter = new StreamThinkingFilter();
    const out1 = filter.processChunk('Hello world! ');
    const out2 = filter.processChunk('How are you?');
    const rem = filter.flush();

    expect(out1 + out2 + rem).toBe('Hello world! How are you?');
  });

  it('should strip single-chunk thinking mode output', () => {
    const filter = new StreamThinkingFilter();
    const raw = '<think>I need to check the user tasks first.</think>Here are your tasks:';
    const out = filter.processChunk(raw);
    const rem = filter.flush();

    expect(out + rem).toBe('Here are your tasks:');
  });

  it('should strip thinking mode output split across multiple token chunks', () => {
    const filter = new StreamThinkingFilter();
    let result = '';

    result += filter.processChunk('<th');
    result += filter.processChunk('ink>');
    result += filter.processChunk('The user wants a task created.\n');
    result += filter.processChunk('I will call createTask.\n');
    result += filter.processChunk('</th');
    result += filter.processChunk('ink>');
    result += filter.processChunk('I have created the task for you.');
    result += filter.flush();

    expect(result).toBe('I have created the task for you.');
    expect(result).not.toContain('task created');
    expect(result).not.toContain('<think>');
    expect(result).not.toContain('</think>');
  });

  it('should discard remaining thinking content if stream ends prematurely', () => {
    const filter = new StreamThinkingFilter();
    let result = '';

    result += filter.processChunk('<think>Unfinished thoughts...');
    result += filter.flush();

    expect(result).toBe('');
  });
});

describe('OllamaProvider (P2-1, A-1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
  }

  it('should send think: false in request options', async () => {
    let capturedBody: any = null;

    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        body: createMockStream([
          JSON.stringify({
            message: { role: 'assistant', content: 'Hi' },
            done: false,
          }) + '\n',
          JSON.stringify({ done: true, done_reason: 'stop' }) + '\n',
        ]),
      } as any;
    });

    const provider = new OllamaProvider({ baseUrl: 'http://mock-ollama:11434', model: 'qwen3:8b' });
    const events: any[] = [];
    for await (const ev of provider.chat({ messages: [{ role: 'user', content: 'Hello' }] })) {
      events.push(ev);
    }

    expect(capturedBody).toBeDefined();
    expect(capturedBody.options.think).toBe(false);
    expect(events).toEqual([
      { type: 'token', content: 'Hi' },
      { type: 'done', finishReason: 'stop' },
    ]);
  });

  it('should correctly parse Ollama streaming chunk shape: role on first chunk, content on next, finish_reason on last', async () => {
    const chunks = [
      // Chunk 1: Role only
      JSON.stringify({ message: { role: 'assistant', content: '' }, done: false }) + '\n',
      // Chunk 2: Token 1
      JSON.stringify({ message: { content: 'Task ' }, done: false }) + '\n',
      // Chunk 3: Token 2
      JSON.stringify({ message: { content: 'created.' }, done: false }) + '\n',
      // Chunk 4: finish_reason arrives on its own chunk
      JSON.stringify({ done: true, done_reason: 'stop' }) + '\n',
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: createMockStream(chunks),
    } as any);

    const provider = new OllamaProvider();
    const events: any[] = [];
    for await (const ev of provider.chat({ messages: [{ role: 'user', content: 'Create task' }] })) {
      events.push(ev);
    }

    expect(events).toEqual([
      { type: 'token', content: 'Task ' },
      { type: 'token', content: 'created.' },
      { type: 'done', finishReason: 'stop' },
    ]);
  });

  it('should report finish_reason: "length" on truncated response', async () => {
    const chunks = [
      JSON.stringify({ message: { role: 'assistant', content: 'Incomplete' }, done: false }) + '\n',
      JSON.stringify({ done: true, done_reason: 'length' }) + '\n',
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: createMockStream(chunks),
    } as any);

    const provider = new OllamaProvider();
    const events: any[] = [];
    for await (const ev of provider.chat({ messages: [{ role: 'user', content: 'Tell me a long story' }] })) {
      events.push(ev);
    }

    expect(events).toEqual([
      { type: 'token', content: 'Incomplete' },
      { type: 'done', finishReason: 'length' },
    ]);
  });

  it('should parse valid tool calls emitted in chunks', async () => {
    const chunks = [
      JSON.stringify({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              function: {
                name: 'createTask',
                arguments: JSON.stringify({ title: 'Buy milk', priority: 'high' }),
              },
            },
          ],
        },
        done: false,
      }) + '\n',
      JSON.stringify({ done: true, done_reason: 'stop' }) + '\n',
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: createMockStream(chunks),
    } as any);

    const provider = new OllamaProvider();
    const events: any[] = [];
    for await (const ev of provider.chat({
      messages: [{ role: 'user', content: 'Buy milk' }],
      tools: [],
    })) {
      events.push(ev);
    }

    expect(events).toEqual([
      {
        type: 'tool_call',
        id: 'call_1',
        name: 'createTask',
        arguments: { title: 'Buy milk', priority: 'high' },
      },
      { type: 'done', finishReason: 'tool_calls' },
    ]);
  });

  it('should retry once on malformed tool-call JSON, then fall back to plain text reply (P2-1)', async () => {
    let callCount = 0;

    // Both attempt 0 and attempt 1 return invalid JSON in arguments
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      callCount++;
      const chunks = [
        JSON.stringify({
          message: {
            role: 'assistant',
            content: 'I want to create a task: {"title": ... INVALID JSON ...',
            tool_calls: [
              {
                id: 'call_bad',
                function: {
                  name: 'createTask',
                  arguments: '{ bad_json: ',
                },
              },
            ],
          },
          done: false,
        }) + '\n',
        JSON.stringify({ done: true, done_reason: 'stop' }) + '\n',
      ];
      return {
        ok: true,
        body: createMockStream(chunks),
      } as any;
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const provider = new OllamaProvider();
    const events: any[] = [];
    for await (const ev of provider.chat({
      messages: [{ role: 'user', content: 'Create task' }],
    })) {
      events.push(ev);
    }

    // Must have retried once: callCount = 2
    expect(callCount).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[OllamaProvider] Malformed tool call JSON detected on attempt 0. Retrying turn once...'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[OllamaProvider] Malformed tool call JSON failed on attempt 1. Falling back to plain text reply.'),
    );

    // Final events should contain the raw content as plain text fallback
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'token', content: expect.stringContaining('I want to create a task') }),
    );
    expect(events).toContainEqual({ type: 'done', finishReason: 'stop' });
  });
});
