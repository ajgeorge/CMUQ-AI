import { z } from 'zod';
import type { Bank, Product, PublicClient } from './content.js';

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
