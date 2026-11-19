import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_LIMITS, type ChatMessage, type FeedbackResponse } from '@bank-sim/shared';
import type { Ai, AiMessage } from '../ai/client.js';
import { AiError } from '../ai/errors.js';
import { createApp } from '../app.js';
import { loadContent } from '../content.js';

let scripted: (string | Error)[] = [];
let sent: AiMessage[][] = [];

const fakeAi: Ai = {
  sdk: undefined as never,
  async generate(_role, messages) {
    sent.push(messages);
    const next = scripted.shift();
    if (next === undefined) throw new Error('The fake AI ran out of scripted replies');
    if (next instanceof Error) throw next;
    return {
      text: next,
      model: 'fake-model',
      finishReason: 'stop',
      latencyMs: 1,
      usage: { promptTokens: 1, completionTokens: 1 },
      rateLimit: {},
    };
  },
};

const content = loadContent();
const ahmed = content.getClient('ahmed')!;
let server: Server;
let url: string;

beforeAll(async () => {
  server = createApp({ content, ai: fakeAi }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}/api/feedback`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  scripted = [];
  sent = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

function feedback(body: unknown) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const interview = (questions: number): ChatMessage[] =>
  Array.from({ length: questions * 2 }, (_, i) => ({
    role: i % 2 === 0 ? 'student' : 'client',
    content: i % 2 === 0 ? `Question ${i / 2 + 1}?` : `Answer ${(i - 1) / 2 + 1}.`,
  }));

const summary = {
  needsIdentified: 'Clients pay late.',
  recommendedProductIds: ['business-flex-overdraft'],
  justification: 'It covers the gap.',
};

const validRequest = { clientId: 'ahmed', messages: interview(3), summary };

const coachReply = JSON.stringify({
  needs: ahmed.needs.map((n) => ({
    id: n.id,
    status: 'missed',
    evidence: null,
    comment: 'Not covered.',
  })),
  wentWell: ['Polite opening.'],
  missed: ['Sharia never came up.'],
  improve: [{ advice: 'Ask about preferences.', exampleQuestion: null }],
  productAccuracy: { status: 'no-claims', comment: 'No products were described.' },
});

describe('POST /api/feedback', () => {
  it("returns the coach's feedback with the product fit check", async () => {
    scripted = [coachReply];
    const res = await feedback(validRequest);

    expect(res.status).toBe(200);
    const body = (await res.json()) as FeedbackResponse;
    expect(body.needs.map((n) => n.title)).toEqual(ahmed.needs.map((n) => n.title));
    expect(body.productFit.recommended).toEqual([
      expect.objectContaining({ productId: 'business-flex-overdraft', rating: 'unsuitable' }),
    ]);
    expect(body.wentWell).toEqual(['Polite opening.']);
  });

  it('sends the coach the instructions and the interview, including the opening line', async () => {
    scripted = [coachReply];
    await feedback(validRequest);

    expect(sent).toHaveLength(1);
    const [system, user] = sent[0]!;
    expect(system?.role).toBe('system');
    expect(user?.content).toContain(`CLIENT: ${ahmed.profile.openingLine}`);
    expect(user?.content).toContain('STUDENT: Question 3?');
  });

  it('returns 404 for an unknown client', async () => {
    const res = await feedback({ ...validRequest, clientId: 'nobody' });
    expect(res.status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  it.each([
    ['too few questions', { messages: interview(2) }, /at least 3 questions/],
    [
      'an interview ending on a question',
      { messages: [...interview(3), { role: 'student', content: 'One more?' }] },
      /last message must be from the client/,
    ],
    [
      'too many questions',
      { messages: interview(CHAT_LIMITS.maxStudentTurns + 1) },
      /limit of 30 questions/,
    ],
    [
      'an empty summary field',
      { summary: { ...summary, justification: ' ' } },
      /summary\.justification/,
    ],
    [
      'no products chosen',
      { summary: { ...summary, recommendedProductIds: [] } },
      /Choose at least one product/,
    ],
    [
      'an unknown product',
      { summary: { ...summary, recommendedProductIds: ['magic-loan'] } },
      /no product with id "magic-loan"/,
    ],
  ])('rejects %s without calling the AI', async (_name, changes, message) => {
    const res = await feedback({ ...validRequest, ...changes });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(message);
    expect(sent).toHaveLength(0);
  });

  it('answers 502 when the coach gives two unusable replies', async () => {
    scripted = ['not json', '{"needs": []}'];
    const res = await feedback(validRequest);

    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('AI_BAD_RESPONSE');
  });

  it('passes on AI failures with a student-friendly message', async () => {
    scripted = [new AiError('AI_TOO_LARGE', 'Request too large')];
    const res = await feedback(validRequest);

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('AI_TOO_LARGE');
    expect(body.error.message).not.toContain('Request too large');
  });
});
