import { z } from 'zod';
import { IdSchema, type Bank, type Product, type PublicClient } from './content.js';

/** Response of GET /api/health. */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().nonnegative(),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * Stable error codes returned by the API.
 * The client maps these to friendly, user-facing messages.
 */
export const ApiErrorCodeSchema = z.enum([
  'NOT_FOUND',
  'BAD_REQUEST',
  'INTERNAL_ERROR',
  // AI provider failures (see server/src/ai/errors.ts)
  'RATE_LIMITED',
  'AI_TOO_LARGE',
  'AI_TIMEOUT',
  'AI_UNAVAILABLE',
  'AI_CONFIG_ERROR',
  'AI_BAD_RESPONSE',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/** Shape of every error response body from the API. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Response of GET /api/clients. */
export interface ClientsResponse {
  clients: PublicClient[];
}

/** Response of GET /api/products. */
export interface ProductsResponse {
  bank: Bank;
  products: Product[];
}

// ---------------------------------------------------------------------------
// Interview chat — POST /api/chat
// ---------------------------------------------------------------------------

/**
 * Limits on one interview. Together they keep every request well under the
 * provider's per-request token limit (8,000 on Groq's free tier), so a long
 * interview can't suddenly start failing. Shared so the UI can show them.
 */
export const CHAT_LIMITS = {
  /** Longest message the student can send. */
  maxStudentMessageChars: 800,
  /** Client replies are short, but allow some slack so a long one can't block the next turn. */
  maxClientMessageChars: 2_000,
  /** Questions the student must ask before they can end the interview. */
  minStudentTurns: 3,
  maxStudentTurns: 30,
  /** All messages added together (about 4,000 tokens). */
  maxConversationChars: 16_000,
} as const;

export const ChatMessageSchema = z.strictObject({
  role: z.enum(['student', 'client']),
  content: z.string().trim().min(1, 'message is empty'),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * Checks shared by the chat and feedback requests: the conversation starts with the
 * student, alternates, ends with `lastRole`, and stays within the interview limits.
 */
function checkConversation(
  messages: ChatMessage[],
  ctx: z.RefinementCtx,
  { lastRole, maxChars }: { lastRole: ChatMessage['role']; maxChars: number },
) {
  let total = 0;
  messages.forEach((message, i) => {
    const expected = i % 2 === 0 ? 'student' : 'client';
    if (message.role !== expected) {
      ctx.addIssue({
        code: 'custom',
        path: ['messages', i, 'role'],
        message: `expected a ${expected} message here (the conversation must alternate, starting with the student)`,
      });
    }
    const max =
      message.role === 'student'
        ? CHAT_LIMITS.maxStudentMessageChars
        : CHAT_LIMITS.maxClientMessageChars;
    if (message.content.length > max) {
      ctx.addIssue({
        code: 'custom',
        path: ['messages', i, 'content'],
        message: `must be ${max} characters or fewer`,
      });
    }
    total += message.content.length;
  });

  if (messages.at(-1)?.role !== lastRole) {
    ctx.addIssue({
      code: 'custom',
      path: ['messages'],
      message: `the last message must be from the ${lastRole}`,
    });
  }
  const questions = messages.filter((m) => m.role === 'student').length;
  if (questions > CHAT_LIMITS.maxStudentTurns) {
    ctx.addIssue({
      code: 'custom',
      path: ['messages'],
      message: `the interview has reached its limit of ${CHAT_LIMITS.maxStudentTurns} questions`,
    });
  }
  if (total > maxChars) {
    ctx.addIssue({
      code: 'custom',
      path: ['messages'],
      message: 'the interview has reached its maximum length',
    });
  }
}

/**
 * The conversation so far, NOT including the client's opening line (the server adds
 * that itself). It starts with the student, alternates, and ends with the student.
 */
export const ChatRequestSchema = z
  .strictObject({
    clientId: IdSchema,
    messages: z.array(ChatMessageSchema).min(1, 'the conversation is empty'),
  })
  .superRefine(({ messages }, ctx) =>
    checkConversation(messages, ctx, {
      lastRole: 'student',
      maxChars: CHAT_LIMITS.maxConversationChars,
    }),
  );
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** Response of POST /api/chat. */
export interface ChatResponse {
  reply: string;
}

// ---------------------------------------------------------------------------
// Student's summary — written after the interview, sent to the coach
// ---------------------------------------------------------------------------

export const SUMMARY_LIMITS = {
  maxNeedsChars: 2_000,
  maxJustificationChars: 2_000,
} as const;

/**
 * What the student found and what they recommend. Used to check the form in the
 * browser and, in the feedback endpoint, on the server, so the two can't drift apart.
 * Messages are written to be shown next to the form fields.
 */
export const InterviewSummarySchema = z.strictObject({
  needsIdentified: z
    .string()
    .trim()
    .min(1, 'Describe the needs you identified.')
    .max(
      SUMMARY_LIMITS.maxNeedsChars,
      `Keep this to ${SUMMARY_LIMITS.maxNeedsChars} characters or fewer.`,
    ),
  recommendedProductIds: z
    .array(IdSchema)
    .min(1, 'Choose at least one product to recommend.')
    .refine((ids) => new Set(ids).size === ids.length, 'Each product can only be chosen once.'),
  justification: z
    .string()
    .trim()
    .min(1, 'Explain why you recommend these products.')
    .max(
      SUMMARY_LIMITS.maxJustificationChars,
      `Keep this to ${SUMMARY_LIMITS.maxJustificationChars} characters or fewer.`,
    ),
});
export type InterviewSummary = z.infer<typeof InterviewSummarySchema>;

// ---------------------------------------------------------------------------
// Coach feedback — POST /api/feedback
// ---------------------------------------------------------------------------

/**
 * The finished interview and the student's summary. The conversation ends with the
 * client's last reply, so it can be up to one reply longer than a chat request.
 */
export const FeedbackRequestSchema = z
  .strictObject({
    clientId: IdSchema,
    messages: z.array(ChatMessageSchema),
    summary: InterviewSummarySchema,
  })
  .superRefine(({ messages }, ctx) => {
    const questions = messages.filter((m) => m.role === 'student').length;
    if (questions < CHAT_LIMITS.minStudentTurns) {
      ctx.addIssue({
        code: 'custom',
        path: ['messages'],
        message: `ask at least ${CHAT_LIMITS.minStudentTurns} questions before asking for feedback`,
      });
      return;
    }
    checkConversation(messages, ctx, {
      lastRole: 'client',
      maxChars: CHAT_LIMITS.maxConversationChars + CHAT_LIMITS.maxClientMessageChars,
    });
  });
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

const coachText = z.string().trim().min(1);

export const NeedStatusSchema = z.enum(['found', 'partly', 'missed']);
export type NeedStatus = z.infer<typeof NeedStatusSchema>;

/**
 * What the AI coach must reply with (JSON). Not strict: harmless extra keys from the
 * model are dropped instead of failing the whole reply.
 */
export const CoachOutputSchema = z.object({
  needs: z.array(
    z.object({
      id: z.string(),
      status: NeedStatusSchema,
      /** The student's question that uncovered the need, copied from the transcript. */
      evidence: z.string().trim().nullable(),
      comment: coachText,
    }),
  ),
  wentWell: z.array(coachText).min(1),
  missed: z.array(coachText),
  improve: z
    .array(z.object({ advice: coachText, exampleQuestion: z.string().trim().nullable() }))
    .min(1),
  productAccuracy: z.object({
    status: z.enum(['accurate', 'issues', 'no-claims']),
    comment: coachText,
  }),
  /**
   * Key moments, checked one by one with CoachMomentSchema (and against the transcript)
   * so that one bad moment can't make the whole review unusable.
   */
  moments: z.array(z.unknown()).optional(),
});
export type CoachOutput = z.infer<typeof CoachOutputSchema>;

/** Kinds of key moment the coach can point out, and whose turn each one is about. */
export const MomentTypeSchema = z.enum([
  'strong-question',
  'missed-cue',
  'inaccurate-claim',
  'early-recommendation',
]);
export type MomentType = z.infer<typeof MomentTypeSchema>;

/** A key moment as the coach writes it: a turn number from the transcript and a quote. */
export const CoachMomentSchema = z.object({
  turn: z.number().int(),
  type: MomentTypeSchema,
  quote: z.string().trim(),
  note: coachText,
});

/** How a product fits the client, from the client's answer key (not decided by the AI). */
export const FitRatingSchema = z.enum(['suitable', 'acceptable', 'unsuitable', 'not-relevant']);
export type FitRating = z.infer<typeof FitRatingSchema>;

export const ProductFitResultSchema = z.object({
  /** Each product the student recommended, in the order they chose them. */
  recommended: z.array(
    z.object({ productId: z.string(), rating: FitRatingSchema, reason: z.string().nullable() }),
  ),
  /** Suitable products the student did not recommend. */
  missedSuitable: z.array(z.object({ productId: z.string(), reason: z.string() })),
});
export type ProductFitResult = z.infer<typeof ProductFitResultSchema>;

/** A hidden need, revealed after the interview, with the coach's verdict. */
export const NeedFeedbackSchema = z.object({
  id: z.string(),
  title: z.string(),
  importance: z.enum(['critical', 'medium', 'low']),
  description: z.string(),
  status: NeedStatusSchema,
  /** Only set when it matches something the student actually asked. */
  evidence: z.string().nullable(),
  comment: z.string(),
});
export type NeedFeedback = z.infer<typeof NeedFeedbackSchema>;

/**
 * Response of POST /api/feedback. A schema rather than only a type so the browser can
 * check a copy it saved earlier (see client/src/session.ts).
 */
/** A key moment after checking: the full message, and the exact words it points at. */
export const KeyMomentSchema = z.object({
  /** 0 is the client's opening line; n is the n-th message after it. */
  turn: z.number().int(),
  speaker: z.enum(['student', 'client']),
  type: MomentTypeSchema,
  message: z.string(),
  /** Copied from `message`, so it can be highlighted there. */
  quote: z.string(),
  note: z.string(),
});
export type KeyMoment = z.infer<typeof KeyMomentSchema>;

export const FeedbackResponseSchema = z.object({
  needs: z.array(NeedFeedbackSchema),
  /** In conversation order. Defaults to none for interviews saved before moments existed. */
  moments: z.array(KeyMomentSchema).default([]),
  productFit: ProductFitResultSchema,
  wentWell: z.array(z.string()),
  missed: z.array(z.string()),
  improve: CoachOutputSchema.shape.improve,
  productAccuracy: CoachOutputSchema.shape.productAccuracy,
});
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;
