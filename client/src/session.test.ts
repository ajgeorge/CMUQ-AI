import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedbackResponse, Product, PublicClient } from '@bank-sim/shared';
import { loadSession, parseSaved, saveSession, serialise } from './session';
import { EMPTY_DRAFT, type AppState } from './state';

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

const product = { id: 'tijara-business-account', name: 'Tijara Business Account' } as Product;
const catalogue = { clients: [ahmed], products: [product] };

const messages = [1, 2, 3].flatMap((n) => [
  { role: 'student' as const, content: `Question ${n}?` },
  { role: 'client' as const, content: `Answer ${n}.` },
]);

const summary = {
  needsIdentified: 'Cash flow gap.',
  recommendedProductIds: [product.id],
  justification: 'Sharia-compliant.',
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

const interview: AppState = { step: 'interview', client: ahmed, messages, draft: EMPTY_DRAFT };
const finished: AppState = {
  step: 'feedback',
  client: ahmed,
  messages,
  draft: summary,
  summary,
  feedback,
};

const roundTrip = (state: AppState) => parseSaved(serialise(state), catalogue);

/** A saved state with some parts replaced, as text. */
function savedWith(changes: Record<string, unknown>, version = 1): string {
  return JSON.stringify({ version, state: { ...finished, ...changes } });
}

describe('serialise and parseSaved', () => {
  it('keeps every step through a reload', () => {
    expect(roundTrip(interview)).toEqual(interview);
    expect(roundTrip({ ...interview, step: 'summary' })).toEqual({ ...interview, step: 'summary' });
    expect(roundTrip(finished)).toEqual(finished);
    // Submitted, but the page was reloaded before the coach replied.
    expect(roundTrip({ ...finished, feedback: null })).toEqual({ ...finished, feedback: null });
  });

  it('saves nothing on the client list', () => {
    expect(serialise({ step: 'select' })).toBeNull();
  });

  it('uses the current details of the client', () => {
    const renamed = { ...ahmed, name: 'Ahmed Al-Sayed Jr' };
    expect(parseSaved(serialise(interview), { ...catalogue, clients: [renamed] })).toMatchObject({
      client: renamed,
    });
  });

  it('ignores missing, damaged or out-of-date data', () => {
    expect(parseSaved(null, catalogue)).toBeNull();
    expect(parseSaved('{not json', catalogue)).toBeNull();
    expect(parseSaved(savedWith({}, 0), catalogue)).toBeNull();
    expect(parseSaved(savedWith({ step: 'party' }), catalogue)).toBeNull();
    expect(
      parseSaved(savedWith({ messages: [{ role: 'boss', content: 'Hi' }] }), catalogue),
    ).toBeNull();
    expect(parseSaved(savedWith({ draft: { needsIdentified: 3 } }), catalogue)).toBeNull();
    expect(
      parseSaved(savedWith({ summary: { ...summary, justification: '' } }), catalogue),
    ).toBeNull();
    expect(parseSaved(savedWith({ feedback: { wentWell: 'yes' } }), catalogue)).toBeNull();
  });

  it('ignores a conversation that is not question/answer pairs', () => {
    expect(parseSaved(savedWith({ messages: messages.slice(0, 5) }), catalogue)).toBeNull();
    expect(parseSaved(savedWith({ messages: messages.slice(1) }), catalogue)).toBeNull();
  });

  it('ignores a summary or feedback step before enough questions were asked', () => {
    expect(
      parseSaved(savedWith({ step: 'summary', messages: messages.slice(0, 4) }), catalogue),
    ).toBeNull();
  });

  it('ignores a client or product that no longer exists', () => {
    expect(parseSaved(serialise(finished), { ...catalogue, clients: [] })).toBeNull();
    expect(parseSaved(serialise(finished), { ...catalogue, products: [] })).toBeNull();
  });
});

describe('saveSession and loadSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves to the tab and clears it when back on the client list', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });

    saveSession(interview);
    expect(loadSession(catalogue)).toEqual(interview);

    saveSession({ step: 'select' });
    expect(store.size).toBe(0);
    expect(loadSession(catalogue)).toBeNull();
  });

  it('carries on without saving when storage is blocked', () => {
    const blocked = () => {
      throw new DOMException('Access denied', 'SecurityError');
    };
    vi.stubGlobal('sessionStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });

    expect(() => saveSession(interview)).not.toThrow();
    expect(loadSession(catalogue)).toBeNull();
  });
});
