import {
  CHAT_LIMITS,
  ChatMessageSchema,
  FeedbackResponseSchema,
  InterviewSummarySchema,
  type ChatMessage,
  type Product,
  type PublicClient,
} from '@bank-sim/shared';
import type { AppState, SummaryDraft } from './state';

/*
 * Keeps the interview through a page refresh. It is saved in sessionStorage, which
 * belongs to the browser tab: it survives a reload but is gone when the tab closes,
 * so nothing is left behind on a shared computer.
 *
 * Whatever is read back is checked before use. Anything damaged, saved by an older
 * version of the app, or about a client or product that no longer exists is ignored,
 * and the student simply starts from the client list.
 */

const KEY = 'bank-sim:session';
const VERSION = 1;

interface Saved {
  version: number;
  state: AppState;
}

/** The text to save for this state, or null when there is nothing worth keeping. */
export function serialise(state: AppState): string | null {
  if (state.step === 'select') return null;
  return JSON.stringify({ version: VERSION, state } satisfies Saved);
}

/** The state saved earlier, checked against the current clients and products. */
export function parseSaved(
  text: string | null,
  catalogue: { clients: PublicClient[]; products: Product[] },
): AppState | null {
  if (!text) return null;
  let saved: unknown;
  try {
    saved = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(saved) || saved.version !== VERSION || !isRecord(saved.state)) return null;
  const state = saved.state;

  // The client's details come from the current content, not the saved copy.
  const client = catalogue.clients.find((c) => isRecord(state.client) && c.id === state.client.id);
  const messages = ChatMessageSchema.array().safeParse(state.messages);
  const draft = parseDraft(state.draft);
  if (!client || !messages.success || !draft || !isConversation(messages.data)) return null;

  const productIds = new Set(catalogue.products.map((p) => p.id));
  const knownProducts = (ids: string[]) => ids.every((id) => productIds.has(id));
  if (!knownProducts(draft.recommendedProductIds)) return null;

  const interview = { client, messages: messages.data, draft };
  const questions = messages.data.filter((m) => m.role === 'student').length;
  const finished = questions >= CHAT_LIMITS.minStudentTurns;

  switch (state.step) {
    case 'interview':
      return { step: 'interview', ...interview };

    case 'summary':
      return finished ? { step: 'summary', ...interview } : null;

    case 'feedback': {
      const summary = InterviewSummarySchema.safeParse(state.summary);
      const feedback =
        state.feedback === null ? null : FeedbackResponseSchema.safeParse(state.feedback);
      if (!finished || !summary.success || !knownProducts(summary.data.recommendedProductIds)) {
        return null;
      }
      if (feedback && !feedback.success) return null;
      return {
        step: 'feedback',
        ...interview,
        summary: summary.data,
        feedback: feedback?.data ?? null,
      };
    }

    default:
      return null;
  }
}

/** Reads the saved state, if there is a usable one. */
export function loadSession(catalogue: {
  clients: PublicClient[];
  products: Product[];
}): AppState | null {
  try {
    return parseSaved(sessionStorage.getItem(KEY), catalogue);
  } catch {
    // Storage can be blocked (e.g. some private browsing modes): carry on without it.
    return null;
  }
}

export function saveSession(state: AppState): void {
  try {
    const text = serialise(state);
    if (text) sessionStorage.setItem(KEY, text);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Blocked or full: the app still works, it just won't survive a reload.
  }
}

/** Question/answer pairs starting with the student, like the reducer keeps them. */
function isConversation(messages: ChatMessage[]): boolean {
  return (
    messages.length % 2 === 0 &&
    messages.every((m, i) => m.role === (i % 2 === 0 ? 'student' : 'client'))
  );
}

function parseDraft(value: unknown): SummaryDraft | null {
  if (!isRecord(value)) return null;
  const { needsIdentified, recommendedProductIds, justification } = value;
  if (
    typeof needsIdentified !== 'string' ||
    typeof justification !== 'string' ||
    !Array.isArray(recommendedProductIds) ||
    !recommendedProductIds.every((id) => typeof id === 'string')
  ) {
    return null;
  }
  return { needsIdentified, recommendedProductIds, justification };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
