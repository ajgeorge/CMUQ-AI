import type { Response } from 'express';
import type { ApiError, ApiErrorCode } from '@bank-sim/shared';

/** Sends an error in the standard `{ error: { code, message } }` shape. */
export function sendError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
): void {
  const body: ApiError = { error: { code, message } };
  res.status(status).json(body);
}
