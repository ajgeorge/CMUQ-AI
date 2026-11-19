import {
  CHAT_LIMITS,
  type ChatMessage,
  type FeedbackResponse,
  type InterviewSummary,
  type PublicClient,
} from '@bank-sim/shared';

/*
 * The whole app's state and the rules for moving between steps.
 * Kept free of React so every transition can be unit-tested on its own.
 */

/** The summary form while the student is still filling it in. */
export interface SummaryDraft {
  needsIdentified: string;
  recommendedProductIds: string[];
  justification: string;
}

export const EMPTY_DRAFT: SummaryDraft = {
  needsIdentified: '',
  recommendedProductIds: [],
  justification: '',
};

interface Interview {
  client: PublicClient;
  /** Complete question/answer pairs only, so the conversation always alternates. */
  messages: ChatMessage[];
  draft: SummaryDraft;
}

export type AppState =
  | { step: 'select' }
  | ({ step: 'interview' } & Interview)
  | ({ step: 'summary' } & Interview)
  | ({ step: 'feedback' } & Interview & {
        summary: InterviewSummary;
        /** null while the coach is still working (or its request failed). */
        feedback: FeedbackResponse | null;
      });

export type Step = AppState['step'];

export type Action =
  | { type: 'start'; client: PublicClient }
  | { type: 'exchange'; question: string; reply: string }
  | { type: 'endInterview' }
  | { type: 'backToInterview' }
  | { type: 'updateDraft'; changes: Partial<SummaryDraft> }
  | { type: 'submit'; summary: InterviewSummary }
  | { type: 'feedbackReceived'; feedback: FeedbackResponse }
  | { type: 'backToSummary' }
  | { type: 'restart' }
  /** Picks up an interview saved before the page was reloaded (see session.ts). */
  | { type: 'restore'; state: AppState };

export const initialState: AppState = { step: 'select' };

/** Invalid transitions (e.g. ending an interview too early) leave the state unchanged. */
export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'start':
      return { step: 'interview', client: action.client, messages: [], draft: EMPTY_DRAFT };

    case 'exchange':
      if (state.step !== 'interview' || limitReached(state.messages)) return state;
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: 'student', content: action.question },
          { role: 'client', content: action.reply },
        ],
      };

    case 'endInterview':
      if (state.step !== 'interview' || !canEndInterview(state.messages)) return state;
      return { ...state, step: 'summary' };

    case 'backToInterview':
      if (state.step !== 'summary') return state;
      return { ...state, step: 'interview' };

    case 'updateDraft':
      if (state.step !== 'summary') return state;
      return { ...state, draft: { ...state.draft, ...action.changes } };

    case 'submit':
      if (state.step !== 'summary') return state;
      return { ...state, step: 'feedback', summary: action.summary, feedback: null };

    case 'feedbackReceived':
      if (state.step !== 'feedback' || state.feedback) return state;
      return { ...state, feedback: action.feedback };

    // Only while waiting for feedback (e.g. after it failed): the draft is still there.
    case 'backToSummary':
      if (state.step !== 'feedback' || state.feedback) return state;
      return {
        step: 'summary',
        client: state.client,
        messages: state.messages,
        draft: state.draft,
      };

    case 'restart':
      return initialState;

    case 'restore':
      return state.step === 'select' ? action.state : state;
  }
}

// --- interview limits, shared with the server so the UI never sends a request it will reject ---

export function questionsAsked(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === 'student').length;
}

export function canEndInterview(messages: ChatMessage[]): boolean {
  return questionsAsked(messages) >= CHAT_LIMITS.minStudentTurns;
}

/** How long the next question can be, given the per-message and whole-interview limits. */
export function maxNextQuestionLength(messages: ChatMessage[]): number {
  const used = messages.reduce((total, m) => total + m.content.length, 0);
  return Math.max(
    0,
    Math.min(CHAT_LIMITS.maxStudentMessageChars, CHAT_LIMITS.maxConversationChars - used),
  );
}

export function limitReached(messages: ChatMessage[]): boolean {
  return (
    questionsAsked(messages) >= CHAT_LIMITS.maxStudentTurns || maxNextQuestionLength(messages) === 0
  );
}
