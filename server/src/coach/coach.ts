import {
  CoachMomentSchema,
  CoachOutputSchema,
  type ChatMessage,
  type Client,
  type CoachOutput,
  type FeedbackResponse,
  type KeyMoment,
  type MomentType,
  type NeedFeedback,
  type ProductFitResult,
} from '@bank-sim/shared';
import type { Ai, AiMessage } from '../ai/client.js';
import { AiError } from '../ai/errors.js';
import { formatPath } from '../format.js';
import {
  buildCoachData,
  buildCoachInstructions,
  type CoachInput,
} from '../prompts/coach-prompt.js';

export const NO_CLAIMS_COMMENT =
  "You didn't describe any of the bank's products during the interview, so there was nothing to check.";

type Checked = { ok: true; output: CoachOutput } | { ok: false; problems: string[] };

/**
 * Asks the AI coach for feedback and checks the reply. A reply that can't be used gets
 * one more attempt, told what was wrong; if that fails too, an AI_BAD_RESPONSE error is
 * thrown, so the student never sees broken or partial feedback.
 */
export async function getFeedback(ai: Ai, input: CoachInput): Promise<FeedbackResponse> {
  const messages: AiMessage[] = [
    { role: 'system', content: buildCoachInstructions(input.bank) },
    { role: 'user', content: buildCoachData(input) },
  ];
  const needIds = input.client.needs.map((need) => need.id);

  let checked = checkCoachReply((await ai.generate('coach', messages)).text, needIds);
  if (!checked.ok) {
    // Only the problems are logged: the reply may quote the student's interview.
    console.warn(
      `[coach] ${input.client.id}: unusable reply, retrying (${checked.problems.join('; ')})`,
    );
    const retry: AiMessage[] = [
      ...messages,
      {
        role: 'user',
        content:
          `A previous reply could not be used because: ${checked.problems.join('; ')}. ` +
          'Reply again with the complete JSON in exactly the required shape.',
      },
    ];
    checked = checkCoachReply((await ai.generate('coach', retry)).text, needIds);
    if (!checked.ok) {
      throw new AiError(
        'AI_BAD_RESPONSE',
        `Coach reply unusable after a retry: ${checked.problems.join('; ')}`,
      );
    }
  }

  return toFeedback(checked.output, {
    client: input.client,
    fit: input.fit,
    messages: input.messages,
    productsDiscussed: input.discussedProducts.length > 0,
  });
}

/** Parses the coach's reply and checks it has the right shape and covers every need once. */
export function checkCoachReply(text: string, needIds: string[]): Checked {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, problems: ['the reply was not valid JSON'] };
  }

  const parsed = CoachOutputSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${formatPath(issue.path) || 'reply'}: ${issue.message}`),
    };
  }

  const problems: string[] = [];
  const given = parsed.data.needs.map((need) => need.id);
  const missing = needIds.filter((id) => !given.includes(id));
  const unknown = given.filter((id) => !needIds.includes(id));
  const repeated = given.filter((id, i) => given.indexOf(id) !== i);
  if (missing.length) problems.push(`"needs" is missing: ${missing.join(', ')}`);
  if (unknown.length) problems.push(`"needs" has unknown ids: ${unknown.join(', ')}`);
  if (repeated.length) problems.push(`"needs" repeats: ${repeated.join(', ')}`);

  return problems.length ? { ok: false, problems } : { ok: true, output: parsed.data };
}

/**
 * Combines the coach's verdicts with the facts from the content files. Each evidence
 * quote is checked against what the student actually asked: if it matches, the student's
 * full question is shown; if the coach "quoted" something never said, it is dropped.
 */
export function toFeedback(
  output: CoachOutput,
  facts: {
    client: Client;
    fit: ProductFitResult;
    messages: ChatMessage[];
    /** Whether the student named any product while talking to the client. */
    productsDiscussed: boolean;
  },
): FeedbackResponse {
  const { client, fit, messages, productsDiscussed } = facts;
  const questions = messages.filter((m) => m.role === 'student').map((m) => m.content);

  const needs = client.needs.map((need): NeedFeedback => {
    const verdict = output.needs.find((n) => n.id === need.id);
    if (!verdict) throw new Error(`No verdict for need ${need.id}`); // checked already
    return {
      id: need.id,
      title: need.title,
      importance: need.importance,
      description: need.description,
      status: verdict.status,
      evidence: verdict.status === 'missed' ? null : findQuestion(verdict.evidence, questions),
      comment: verdict.comment,
    };
  });

  // The conversation as numbered in the coach's transcript: 0 is the opening line.
  const turns: ChatMessage[] = [
    { role: 'client', content: client.profile.openingLine },
    ...messages,
  ];

  return {
    needs,
    moments: checkMoments(output.moments, turns),
    productFit: fit,
    wentWell: output.wentWell,
    missed: output.missed,
    improve: output.improve,
    // With no product discussed there is nothing to be accurate about, so don't show it as
    // a success. ("issues" is kept: a student can describe a product without naming it.)
    productAccuracy:
      !productsDiscussed && output.productAccuracy.status === 'accurate'
        ? { status: 'no-claims', comment: NO_CLAIMS_COMMENT }
        : output.productAccuracy,
  };
}

/** Whose turn each kind of key moment is about. */
const MOMENT_SPEAKER: Record<MomentType, ChatMessage['role']> = {
  'strong-question': 'student',
  'missed-cue': 'client',
  'inaccurate-claim': 'student',
  'early-recommendation': 'student',
};

const MAX_MOMENTS = 6;

/**
 * Checks the coach's key moments against the transcript. Each quote must really appear in
 * a turn by the right speaker. If the coach's turn number is off, the turn the quote comes
 * from is used instead; anything that can't be placed, or is malformed, is dropped.
 */
export function checkMoments(raw: unknown[] | undefined, turns: ChatMessage[]): KeyMoment[] {
  const placed = new Map<string, KeyMoment>();

  for (const item of raw ?? []) {
    const parsed = CoachMomentSchema.safeParse(item);
    if (!parsed.success) continue;
    const { turn, type, quote, note } = parsed.data;
    const speaker = MOMENT_SPEAKER[type];

    // The turn the coach gave first, then every other turn by the right speaker.
    const candidates = [turn, ...turns.keys()].filter((i) => turns[i]?.role === speaker);
    for (const i of candidates) {
      const message = turns[i]!.content;
      const exact = locate(quote, message);
      if (exact) {
        const key = `${i}:${type}`;
        if (!placed.has(key))
          placed.set(key, { turn: i, speaker, type, message, quote: exact, note });
        break;
      }
    }
  }

  return [...placed.values()].sort((a, b) => a.turn - b.turn).slice(0, MAX_MOMENTS);
}

/**
 * Finds a quote in a message, ignoring case, spacing and punctuation, and returns the
 * matching words exactly as they appear in the message (so they can be highlighted).
 */
export function locate(quote: string, message: string): string | null {
  const wanted = normalise(quote);
  if (wanted.length < 8) return null; // too short to place reliably

  // The message normalised the same way, remembering where each character came from.
  let text = '';
  const from: number[] = [];
  for (let i = 0; i < message.length; i++) {
    const char = message[i]!;
    if (/[\p{L}\p{N}]/u.test(char)) {
      for (const lower of char.toLowerCase()) {
        text += lower;
        from.push(i);
      }
    } else if (text && !text.endsWith(' ')) {
      text += ' ';
      from.push(i);
    }
  }

  // Whole words only, so "fee" doesn't match inside "coffee".
  for (let at = text.indexOf(wanted); at >= 0; at = text.indexOf(wanted, at + 1)) {
    const end = at + wanted.length;
    if ((at === 0 || text[at - 1] === ' ') && (end === text.length || text[end] === ' ')) {
      return message.slice(from[at], from[end - 1]! + 1);
    }
  }
  return null;
}

/** The student's question containing the quote, ignoring case, spacing and punctuation. */
export function findQuestion(quote: string | null, questions: string[]): string | null {
  if (!quote) return null;
  const wanted = normalise(quote);
  if (wanted.length < 8) return null; // too short to tell which question was meant
  return questions.find((question) => normalise(question).includes(wanted)) ?? null;
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
