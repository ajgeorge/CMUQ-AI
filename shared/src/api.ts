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
 * The conversation so far, NOT including the client's opening line (the server adds
 * that itself). It starts with the student, alternates, and ends with the student.
 */
export const ChatRequestSchema = z
  .strictObject({
    clientId: IdSchema,
    messages: z.array(ChatMessageSchema).min(1, 'the conversation is empty'),
  })
  .superRefine(({ messages }, ctx) => {
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

    if (messages.at(-1)?.role !== 'student') {
      ctx.addIssue({
        code: 'custom',
        path: ['messages'],
        message: 'the last message must be from the student',
      });
    }
    if (Math.ceil(messages.length / 2) > CHAT_LIMITS.maxStudentTurns) {
      ctx.addIssue({
        code: 'custom',
        path: ['messages'],
        message: `the interview has reached its limit of ${CHAT_LIMITS.maxStudentTurns} questions`,
      });
    }
    if (total > CHAT_LIMITS.maxConversationChars) {
      ctx.addIssue({
        code: 'custom',
        path: ['messages'],
        message: 'the interview has reached its maximum length',
      });
    }
  });
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** Response of POST /api/chat. */
export interface ChatResponse {
  reply: string;
}
