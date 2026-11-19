import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachOutput } from '@bank-sim/shared';
import type { Ai, AiMessage } from '../ai/client.js';
import { AiError } from '../ai/errors.js';
import { loadContent } from '../content.js';
import { NO_CLAIMS_COMMENT, checkCoachReply, findQuestion, getFeedback } from './coach.js';
import { checkProductFit } from './product-fit.js';

const content = loadContent();
const ahmed = content.getClient('ahmed')!;
const needIds = ahmed.needs.map((n) => n.id);

const messages = [
  { role: 'student' as const, content: 'What is the biggest financial challenge right now?' },
  { role: 'client' as const, content: 'Clients pay in 60 to 90 days.' },
  { role: 'student' as const, content: 'Who are your customers?' },
  { role: 'client' as const, content: 'Hotels.' },
];

/** A valid coach reply for Ahmed; tests change parts of it. */
function reply(changes: Partial<CoachOutput> = {}): CoachOutput {
  return {
    needs: needIds.map((id) => ({
      id,
      status: id === 'cash-flow-gap' ? 'found' : 'missed',
      evidence: id === 'cash-flow-gap' ? 'biggest financial challenge' : null,
      comment: `About ${id}.`,
    })),
    wentWell: ['Good open question.'],
    missed: ['Never asked about Sharia.'],
    improve: [{ advice: 'Ask about preferences.', exampleQuestion: 'Any requirements?' }],
    productAccuracy: { status: 'no-claims', comment: 'No products were described.' },
    ...changes,
  };
}

// --- a fake AI returning scripted replies ---
let scripted: string[] = [];
let sent: AiMessage[][] = [];
const fakeAi: Ai = {
  sdk: undefined as never,
  async generate(_role, msgs) {
    sent.push(msgs);
    const text = scripted.shift();
    if (text === undefined) throw new Error('The fake AI ran out of scripted replies');
    return {
      text,
      model: 'fake',
      finishReason: 'stop',
      latencyMs: 1,
      usage: { promptTokens: 1, completionTokens: 1 },
      rateLimit: {},
    };
  },
};

const input = {
  client: ahmed,
  bank: content.bank,
  products: content.products,
  discussedProducts: [],
  productName: (id: string) => id,
  fit: checkProductFit(ahmed.productFit, ['business-flex-overdraft']),
  messages,
  summary: {
    needsIdentified: 'Cash flow.',
    recommendedProductIds: ['business-flex-overdraft'],
    justification: 'Covers the gap.',
  },
};

beforeEach(() => {
  scripted = [];
  sent = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('checkCoachReply', () => {
  it('accepts a complete reply', () => {
    expect(checkCoachReply(JSON.stringify(reply()), needIds).ok).toBe(true);
  });

  it('rejects text that is not JSON', () => {
    expect(checkCoachReply('Here is your feedback: great job!', needIds)).toEqual({
      ok: false,
      problems: ['the reply was not valid JSON'],
    });
  });

  it('rejects a reply with the wrong shape, saying where', () => {
    const result = checkCoachReply(JSON.stringify({ ...reply(), wentWell: [] }), needIds);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems[0]).toMatch(/^wentWell:/);
  });

  it('rejects missing, unknown and repeated needs', () => {
    const [first, ...rest] = reply().needs;
    const result = checkCoachReply(
      JSON.stringify(reply({ needs: [...rest, { ...first!, id: 'made-up' }, rest[0]!] })),
      needIds,
    );
    expect(!result.ok && result.problems).toEqual([
      '"needs" is missing: cash-flow-gap',
      '"needs" has unknown ids: made-up',
      `"needs" repeats: ${rest[0]!.id}`,
    ]);
  });

  it('ignores extra keys from the model', () => {
    expect(checkCoachReply(JSON.stringify({ ...reply(), score: 7 }), needIds).ok).toBe(true);
  });
});

describe('findQuestion', () => {
  const questions = messages.filter((m) => m.role === 'student').map((m) => m.content);

  it("returns the student's full question for a quote, ignoring case and punctuation", () => {
    expect(findQuestion('"the BIGGEST financial challenge, right now"', questions)).toBe(
      questions[0],
    );
  });

  it('drops a quote the student never said, or one too short to place', () => {
    expect(findQuestion('Do you need Sharia-compliant products?', questions)).toBeNull();
    expect(findQuestion('who', questions)).toBeNull();
    expect(findQuestion(null, questions)).toBeNull();
  });
});

describe('getFeedback', () => {
  it('combines the verdicts with the content and the product fit', async () => {
    scripted = [JSON.stringify(reply())];
    const feedback = await getFeedback(fakeAi, input);

    expect(feedback.needs.map((n) => n.id)).toEqual(needIds);
    expect(feedback.needs[0]).toMatchObject({
      title: ahmed.needs[0]!.title,
      importance: 'critical',
      status: 'found',
      evidence: messages[0]!.content,
    });
    expect(feedback.productFit.recommended[0]?.rating).toBe('unsuitable');
    expect(feedback.missed).toEqual(['Never asked about Sharia.']);
  });

  it('drops made-up evidence, and evidence on a missed need', async () => {
    const needs = reply().needs.map((n) =>
      n.id === 'cash-flow-gap'
        ? { ...n, evidence: 'How do you manage payroll?' }
        : { ...n, evidence: 'Who are your customers?' },
    );
    scripted = [JSON.stringify(reply({ needs }))];
    const feedback = await getFeedback(fakeAi, input);
    expect(feedback.needs.every((n) => n.evidence === null)).toBe(true);
  });

  it('retries once, saying what was wrong, when the reply is unusable', async () => {
    scripted = ['not json', JSON.stringify(reply())];
    const feedback = await getFeedback(fakeAi, input);

    expect(feedback.wentWell).toEqual(['Good open question.']);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.at(-1)?.content).toContain('the reply was not valid JSON');
  });

  it('shows "accurate" as "no-claims" when no product came up in the interview', async () => {
    const accurate = { status: 'accurate' as const, comment: 'All correct.' };
    scripted = [JSON.stringify(reply({ productAccuracy: accurate }))];
    expect((await getFeedback(fakeAi, input)).productAccuracy).toEqual({
      status: 'no-claims',
      comment: NO_CLAIMS_COMMENT,
    });

    scripted = [JSON.stringify(reply({ productAccuracy: accurate }))];
    const discussed = { ...input, discussedProducts: [content.products[0]!] };
    expect((await getFeedback(fakeAi, discussed)).productAccuracy).toEqual(accurate);
  });

  it('keeps an "issues" verdict even when no product was named', async () => {
    const issues = { status: 'issues' as const, comment: 'You said it had no fees.' };
    scripted = [JSON.stringify(reply({ productAccuracy: issues }))];
    expect((await getFeedback(fakeAi, input)).productAccuracy).toEqual(issues);
  });

  it('gives up with AI_BAD_RESPONSE after a second unusable reply', async () => {
    scripted = ['not json', JSON.stringify({ needs: [] })];
    const error = await getFeedback(fakeAi, input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).code).toBe('AI_BAD_RESPONSE');
  });
});
