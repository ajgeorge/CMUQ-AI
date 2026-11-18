import { describe, expect, it } from 'vitest';
import { createAi, stripThinking, type AiCallLog, type AiConfig } from './client.js';
import { AiError } from './errors.js';

// --- a fake AI provider: each call to fetch gets the next scripted reply ---

type Reply = Response | 'network-error' | 'hang';

function fakeProvider(...replies: Reply[]) {
  const requests: Record<string, unknown>[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const reply = replies.shift();
    if (!reply) throw new Error('The fake provider ran out of scripted replies');
    if (reply === 'network-error') throw new TypeError('fetch failed');
    if (reply === 'hang') {
      // Never answers; only settles when the SDK aborts the request on timeout.
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
    }
    return reply;
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function completion(content: string | null, finishReason = 'stop') {
  return jsonResponse(
    200,
    {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 0,
      model: 'served-model',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    },
    { 'x-ratelimit-remaining-tokens': '7850', 'x-ratelimit-remaining-requests': '999' },
  );
}

/** A provider error. `retry-after-ms: 1` keeps retries instant in tests. */
function failure(status: number, message = 'something went wrong', code?: string) {
  return jsonResponse(
    status,
    { error: { message, type: 'error', code } },
    { 'retry-after-ms': '1' },
  );
}

function setup(replies: Reply[], overrides: Partial<AiConfig> = {}) {
  const provider = fakeProvider(...replies);
  const logs: AiCallLog[] = [];
  const ai = createAi(
    {
      baseURL: 'https://ai.example.test/v1',
      apiKey: 'test-key-123',
      timeoutMs: 5_000,
      models: {
        client: { model: 'fast-model' },
        coach: { model: 'strong-model', reasoningEffort: 'low' },
      },
      fetch: provider.fetch,
      ...overrides,
    },
    (entry) => logs.push(entry),
  );
  return { ai, requests: provider.requests, logs };
}

async function failureOf(promise: Promise<unknown>): Promise<AiError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AiError) return err;
    throw err;
  }
  throw new Error('Expected the AI call to fail, but it succeeded');
}

const hello = [{ role: 'user' as const, content: 'Hello, how can I help you today?' }];

// ---------------------------------------------------------------------------

describe('generate', () => {
  it('uses the client settings: its own model, no JSON mode', async () => {
    const { ai, requests } = setup([completion('Hi, I run a catering business.')]);
    await ai.generate('client', hello);

    expect(requests[0]).toMatchObject({ model: 'fast-model', temperature: 0.8 });
    expect(requests[0]).not.toHaveProperty('response_format');
    expect(requests[0]).not.toHaveProperty('reasoning_effort');
  });

  it('uses the coach settings: its own model, JSON mode and reasoning effort', async () => {
    const { ai, requests } = setup([completion('{"wentWell": []}')]);
    await ai.generate('coach', hello);

    expect(requests[0]).toMatchObject({
      model: 'strong-model',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      reasoning_effort: 'low',
    });
  });

  it('returns the reply with token usage and the remaining rate limit', async () => {
    const { ai } = setup([completion('  Hi there.  ')]);
    const result = await ai.generate('client', hello);

    expect(result).toMatchObject({
      text: 'Hi there.',
      model: 'served-model',
      usage: { promptTokens: 120, completionTokens: 30 },
      rateLimit: { remainingTokens: 7850, remainingRequests: 999 },
    });
  });

  it('logs usage but never the conversation', async () => {
    const { ai, logs } = setup([completion('My secret is the cash flow gap.')]);
    await ai.generate('client', hello);

    expect(logs).toEqual([
      expect.objectContaining({
        role: 'client',
        model: 'fast-model',
        outcome: 'ok',
        promptTokens: 120,
      }),
    ]);
    const logged = JSON.stringify(logs);
    expect(logged).not.toContain('Hello, how can I help');
    expect(logged).not.toContain('cash flow gap');
  });

  it('removes <think> blocks so reasoning never reaches the student', async () => {
    const { ai } = setup([
      completion('<think>They asked about salary.</think>\nI earn about 9,000 a month.'),
    ]);
    expect((await ai.generate('client', hello)).text).toBe('I earn about 9,000 a month.');
  });
});

describe('retries', () => {
  it('waits and retries when rate limited, then succeeds', async () => {
    const { ai, requests } = setup([failure(429, 'Rate limit reached'), completion('Hello.')]);
    expect((await ai.generate('client', hello)).text).toBe('Hello.');
    expect(requests).toHaveLength(2);
  });

  it('retries a provider server error, then succeeds', async () => {
    const { ai, requests } = setup([failure(503), completion('Hello.')]);
    expect((await ai.generate('client', hello)).text).toBe('Hello.');
    expect(requests).toHaveLength(2);
  });

  it('gives up after two retries', async () => {
    const { ai, requests } = setup([failure(429), failure(429), failure(429)]);
    const error = await failureOf(ai.generate('client', hello));

    expect(error.code).toBe('RATE_LIMITED');
    expect(error.status).toBe(429);
    expect(requests).toHaveLength(3);
  });

  it('does not retry a rejected API key', async () => {
    const { ai, requests } = setup([failure(401, 'Invalid API Key')]);
    const error = await failureOf(ai.generate('client', hello));

    expect(error.code).toBe('AI_CONFIG_ERROR');
    expect(requests).toHaveLength(1);
  });
});

describe('error classification', () => {
  const noRetries = { maxRetries: 0 };

  it.each([
    ['an unknown model', failure(404, 'The model `fast-modle` does not exist'), 'AI_CONFIG_ERROR'],
    ['a bad parameter', failure(400, 'reasoning_effort is not supported'), 'AI_CONFIG_ERROR'],
    [
      'invalid JSON from the model',
      failure(400, 'Failed to generate JSON', 'json_validate_failed'),
      'AI_BAD_RESPONSE',
    ],
    [
      'a request over the per-minute token limit',
      failure(413, 'Request too large'),
      'RATE_LIMITED',
    ],
    ['a provider outage', failure(500), 'AI_UNAVAILABLE'],
    ['a network failure', 'network-error' as const, 'AI_UNAVAILABLE'],
  ])('maps %s to %s', async (_name, reply, code) => {
    const { ai } = setup([reply], noRetries);
    expect((await failureOf(ai.generate('client', hello))).code).toBe(code);
  });

  it('reports a timeout when the provider does not answer in time', async () => {
    const { ai, logs } = setup(['hang'], { ...noRetries, timeoutMs: 50 });
    const error = await failureOf(ai.generate('client', hello));

    expect(error.code).toBe('AI_TIMEOUT');
    expect(logs[0]?.outcome).toBe('AI_TIMEOUT');
  });

  it('treats an empty reply as a bad response', async () => {
    const { ai } = setup([completion('')]);
    expect((await failureOf(ai.generate('client', hello))).code).toBe('AI_BAD_RESPONSE');
  });

  it('explains when a reasoning model used up all its tokens thinking', async () => {
    const { ai } = setup([completion(null, 'length')]);
    const error = await failureOf(ai.generate('coach', hello));

    expect(error.code).toBe('AI_BAD_RESPONSE');
    expect(error.detail).toContain('ran out of tokens');
  });

  it('keeps provider details out of the message the student sees', async () => {
    const { ai, logs } = setup([failure(404, 'The model `fast-modle` does not exist')], noRetries);
    const error = await failureOf(ai.generate('client', hello));

    expect(error.message).toBe(
      'The app is not configured correctly. Please let the administrator know.',
    );
    expect(error.message).not.toContain('fast-modle');
    expect(error.detail).toContain('fast-modle');
    expect(logs[0]?.detail).toContain('fast-modle');
  });
});

describe('stripThinking', () => {
  it('removes several think blocks and an unclosed one', () => {
    expect(stripThinking('<think>a</think>One <think>b</think>two')).toBe('One two');
    expect(stripThinking('<think>still thinking when cut off')).toBe('');
    expect(stripThinking('No thinking here.')).toBe('No thinking here.');
  });
});
