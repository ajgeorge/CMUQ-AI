import { describe, expect, it } from 'vitest';
import {
  CHAT_LIMITS,
  type ChatMessage,
  type FeedbackResponse,
  type PublicClient,
} from '@bank-sim/shared';
import {
  EMPTY_DRAFT,
  canEndInterview,
  initialState,
  limitReached,
  maxNextQuestionLength,
  reducer,
  type Action,
  type AppState,
} from './state';

const ahmed: PublicClient = {
  id: 'ahmed',
  name: 'Ahmed Al-Sayed',
  age: 42,
  occupation: 'Owner, Saffron Table Catering',
  location: 'Doha, Qatar',
  difficulty: 'intermediate',
  summary: 'Runs a catering company.',
  openingLine: 'Hello.',
};

const summary = {
  needsIdentified: 'Cash flow gap',
  recommendedProductIds: ['islamic-receivables-finance'],
  justification: 'Sharia-compliant and covers the 60 to 90 day gap.',
};

const feedback: FeedbackResponse = {
  moments: [],
  needs: [],
  productFit: { recommended: [], missedSuitable: [] },
  wentWell: ['Good questions.'],
  missed: [],
  improve: [{ advice: 'Ask about preferences.', exampleQuestion: null }],
  productAccuracy: { status: 'no-claims', comment: 'None described.' },
};

function run(...actions: Action[]): AppState {
  return actions.reduce(reducer, initialState);
}

const ask = (n: number): Action[] =>
  Array.from({ length: n }, (_, i) => ({ type: 'exchange', question: `Q${i}`, reply: `A${i}` }));

const conversation = (pairs: number, length = 1): ChatMessage[] =>
  Array.from({ length: pairs * 2 }, (_, i) => ({
    role: i % 2 === 0 ? 'student' : 'client',
    content: 'x'.repeat(length),
  }));

describe('reducer', () => {
  it('starts an interview with no messages and an empty summary', () => {
    expect(run({ type: 'start', client: ahmed })).toEqual({
      step: 'interview',
      client: ahmed,
      messages: [],
      draft: EMPTY_DRAFT,
    });
  });

  it('adds each question and reply as a pair', () => {
    const state = run({ type: 'start', client: ahmed }, ...ask(2));
    expect(state.step === 'interview' && state.messages).toEqual([
      { role: 'student', content: 'Q0' },
      { role: 'client', content: 'A0' },
      { role: 'student', content: 'Q1' },
      { role: 'client', content: 'A1' },
    ]);
  });

  it(`does not end the interview before ${CHAT_LIMITS.minStudentTurns} questions`, () => {
    const tooEarly = run({ type: 'start', client: ahmed }, ...ask(2), { type: 'endInterview' });
    expect(tooEarly.step).toBe('interview');

    const enough = run({ type: 'start', client: ahmed }, ...ask(3), { type: 'endInterview' });
    expect(enough.step).toBe('summary');
  });

  it('keeps the conversation and summary draft when going back to the interview', () => {
    const state = run(
      { type: 'start', client: ahmed },
      ...ask(3),
      { type: 'endInterview' },
      { type: 'updateDraft', changes: { needsIdentified: 'Cash flow' } },
      { type: 'backToInterview' },
      ...ask(1),
      { type: 'endInterview' },
    );

    expect(state.step).toBe('summary');
    expect(state.step === 'summary' && state.messages).toHaveLength(8);
    expect(state.step === 'summary' && state.draft.needsIdentified).toBe('Cash flow');
  });

  it('submits the summary and waits for feedback', () => {
    const state = run(
      { type: 'start', client: ahmed },
      ...ask(3),
      { type: 'endInterview' },
      { type: 'submit', summary },
    );
    expect(state).toMatchObject({ step: 'feedback', summary, feedback: null });
  });

  it('stores the feedback once, and only on the feedback step', () => {
    const submitted = run(
      { type: 'start', client: ahmed },
      ...ask(3),
      { type: 'endInterview' },
      { type: 'submit', summary },
    );
    const received = reducer(submitted, { type: 'feedbackReceived', feedback });
    expect(received).toMatchObject({ step: 'feedback', feedback });

    // A late reply for an earlier attempt must not replace it, or land on another step.
    expect(reducer(received, { type: 'feedbackReceived', feedback: { ...feedback } })).toBe(
      received,
    );
    expect(run({ type: 'feedbackReceived', feedback })).toEqual(initialState);
  });

  it('goes back to the summary, keeping the draft, only while feedback is pending', () => {
    const submitted = run(
      { type: 'start', client: ahmed },
      ...ask(3),
      { type: 'endInterview' },
      { type: 'updateDraft', changes: { needsIdentified: 'Cash flow' } },
      { type: 'submit', summary },
    );
    const back = reducer(submitted, { type: 'backToSummary' });
    expect(back).toMatchObject({ step: 'summary', draft: { needsIdentified: 'Cash flow' } });
    expect(back).not.toHaveProperty('summary');

    const received = reducer(submitted, { type: 'feedbackReceived', feedback });
    expect(reducer(received, { type: 'backToSummary' })).toBe(received);
  });

  it('ignores actions that do not fit the current step', () => {
    expect(run({ type: 'endInterview' })).toEqual(initialState);
    expect(run({ type: 'submit', summary })).toEqual(initialState);
    expect(run({ type: 'start', client: ahmed }, { type: 'submit', summary }).step).toBe(
      'interview',
    );
    expect(
      run(
        { type: 'start', client: ahmed },
        { type: 'updateDraft', changes: { justification: 'x' } },
      ),
    ).toMatchObject({ draft: EMPTY_DRAFT });
  });

  it('restarts from any step', () => {
    expect(run({ type: 'start', client: ahmed }, ...ask(3), { type: 'restart' })).toEqual({
      step: 'select',
    });
  });
});

describe('interview limits', () => {
  it(`allows ending only after ${CHAT_LIMITS.minStudentTurns} questions`, () => {
    expect(canEndInterview(conversation(CHAT_LIMITS.minStudentTurns - 1))).toBe(false);
    expect(canEndInterview(conversation(CHAT_LIMITS.minStudentTurns))).toBe(true);
  });

  it('stops after the maximum number of questions', () => {
    expect(limitReached(conversation(CHAT_LIMITS.maxStudentTurns - 1))).toBe(false);
    expect(limitReached(conversation(CHAT_LIMITS.maxStudentTurns))).toBe(true);
  });

  it('shortens the next question as the interview nears its total length', () => {
    expect(maxNextQuestionLength([])).toBe(CHAT_LIMITS.maxStudentMessageChars);

    // 15,600 characters used leaves 400 for the next question.
    const nearlyFull = conversation(13, 600);
    expect(maxNextQuestionLength(nearlyFull)).toBe(400);
    expect(limitReached(nearlyFull)).toBe(false);

    expect(limitReached(conversation(10, CHAT_LIMITS.maxConversationChars / 20))).toBe(true);
  });

  it('never adds an exchange once the limit is reached', () => {
    const atLimit = run({ type: 'start', client: ahmed }, ...ask(CHAT_LIMITS.maxStudentTurns));
    const after = reducer(atLimit, { type: 'exchange', question: 'One more?', reply: 'No.' });
    expect(after).toBe(atLimit);
  });
});
