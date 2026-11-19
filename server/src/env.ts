import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { REPO_ROOT } from './paths.js';

/** A non-empty string; `hint` explains what the variable is for when it's missing. */
const required = (hint: string) => {
  const message = `is missing — ${hint}`;
  return z.string({ error: message }).trim().min(1, message);
};

/** Optional; an empty value in .env counts as "not set". Only reasoning models use it. */
const reasoningEffort = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .enum(['low', 'medium', 'high'], { error: 'must be low, medium or high (or left empty)' })
    .optional(),
);

/** Optional backup model; an empty value counts as "no backup". */
const fallbackModel = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  AI_BASE_URL: z.url({
    error: (issue) =>
      issue.input
        ? 'must be a full URL, e.g. https://api.groq.com/openai/v1'
        : 'is missing — the address of your AI provider, e.g. https://api.groq.com/openai/v1',
  }),
  AI_API_KEY: required('your AI provider API key'),
  CLIENT_MODEL: required('the model used by the AI Client'),
  COACH_MODEL: required('the model used by the AI Coach'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(30_000),
  CLIENT_REASONING_EFFORT: reasoningEffort,
  COACH_REASONING_EFFORT: reasoningEffort,
  CLIENT_FALLBACK_MODEL: fallbackModel,
  COACH_FALLBACK_MODEL: fallbackModel,
  CLIENT_FALLBACK_REASONING_EFFORT: reasoningEffort,
  COACH_FALLBACK_REASONING_EFFORT: reasoningEffort,
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Loads `.env` from the repository root (if present) and validates it.
 * Exits with a readable message instead of failing later with a confusing error.
 * Variables already set in the real environment take precedence over `.env`.
 */
function loadEnv(): Env {
  const envFile = path.join(REPO_ROOT, '.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }

  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(
      `\nConfiguration error — please check your .env file:\n${problems}\n\n` +
        `Copy .env.example to .env and fill in the missing values.\n`,
    );
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
