import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import type { Env } from '../env.js';
import { AiError, toAiError, type AiErrorCode } from './errors.js';

/** The two chatbots in the app. Each has its own model and settings. */
export type AiRole = 'client' | 'coach';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelChoice {
  model: string;
  reasoningEffort?: ReasoningEffort | undefined;
}

/** A role's main model, and optionally a backup used when the main one can't answer. */
export interface ModelRoute extends ModelChoice {
  fallback?: ModelChoice | undefined;
}

export interface AiConfig {
  baseURL: string;
  apiKey: string;
  /** Per attempt. The SDK retries timeouts too, so the worst case is (maxRetries + 1) × this. */
  timeoutMs: number;
  /** Retries for rate limits, timeouts, connection errors and 5xx. Honours `retry-after`. */
  maxRetries?: number;
  models: Record<AiRole, ModelRoute>;
  /** Only for tests: lets them fake the provider without any network calls. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Behaviour for each role. Kept in code rather than .env because they're part of how
 * each chatbot is designed, not deployment settings.
 * Note that for reasoning models, maxTokens also covers the hidden "thinking" tokens.
 */
const ROLE_SETTINGS: Record<AiRole, { temperature: number; maxTokens: number; json: boolean }> = {
  // Natural, varied conversation in short replies. Tested live: at 0.8 the client often
  // volunteered private details in answer to general questions; 0.5 keeps them hidden
  // while replies still vary naturally.
  client: { temperature: 0.5, maxTokens: 512, json: false },
  // Consistent judgement, returned as JSON so the app can check it.
  coach: { temperature: 0.2, maxTokens: 4096, json: true },
};

export interface AiResult {
  text: string;
  model: string;
  finishReason: string | null;
  latencyMs: number;
  usage: { promptTokens: number; completionTokens: number };
  /** From the provider's rate-limit headers, when it sends them. */
  rateLimit: { remainingRequests?: number; remainingTokens?: number };
}

/** One line per AI call. Never includes the conversation itself. */
export interface AiCallLog {
  role: AiRole;
  model: string;
  latencyMs: number;
  outcome: 'ok' | AiErrorCode;
  promptTokens?: number;
  completionTokens?: number;
  remainingTokens?: number;
  detail?: string;
  /** Set when the backup model answered, saying why. */
  backupBecause?: string;
}

export type AiLogger = (entry: AiCallLog) => void;

export interface GenerateOptions {
  /** Normally the main model, switching to the backup if needed. The setup check uses this. */
  use?: 'main' | 'backup';
}

export interface Ai {
  generate(role: AiRole, messages: AiMessage[], options?: GenerateOptions): Promise<AiResult>;
  /** Raw SDK client, for the setup check (listing models). */
  readonly sdk: OpenAI;
}

/**
 * Failures where a backup model can help: the main model is busy, over its limits, slow or
 * down. Configuration errors (a bad key, an unknown model) are not hidden this way.
 */
const SWITCH_TO_BACKUP = new Set<AiErrorCode>([
  'RATE_LIMITED',
  'AI_TOO_LARGE',
  'AI_TIMEOUT',
  'AI_UNAVAILABLE',
]);

/** After a rate limit, how long to send that role straight to its backup. */
const DEFAULT_REST_MS = 20_000;
const MAX_REST_MS = 60 * 60_000;

export function createAi(config: AiConfig, log: AiLogger = logToConsole): Ai {
  const sdk = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries ?? 2,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  // When each role's main model may be tried again after a rate limit.
  const restingUntil: Partial<Record<AiRole, number>> = {};

  /**
   * Uses the role's main model. If it has a backup and the main model is rate-limited,
   * over its limits, too slow or down, the backup answers instead, straight away rather
   * than after retries. After a rate limit the main model is skipped for as long as the
   * provider asked, so each call doesn't waste a failed attempt first.
   */
  async function generate(
    role: AiRole,
    messages: AiMessage[],
    options: GenerateOptions = {},
  ): Promise<AiResult> {
    const { fallback, ...main } = config.models[role];
    if (options.use === 'backup') {
      if (!fallback) throw new Error(`No backup model is set for the ${role}.`);
      return call(role, fallback, messages);
    }
    if (!fallback || options.use === 'main') return call(role, main, messages);

    const resting = (restingUntil[role] ?? 0) - Date.now();
    if (resting > 0) {
      return call(role, fallback, messages, {
        backupBecause: `${main.model} rate-limited for another ${Math.ceil(resting / 1000)}s`,
      });
    }

    try {
      return await call(role, main, messages, { maxRetries: 0 });
    } catch (err) {
      if (!(err instanceof AiError) || !SWITCH_TO_BACKUP.has(err.code)) throw err;
      if (err.code === 'RATE_LIMITED') {
        restingUntil[role] =
          Date.now() + Math.min(err.retryAfterMs ?? DEFAULT_REST_MS, MAX_REST_MS);
      }
      return call(role, fallback, messages, { backupBecause: `${main.model} was ${err.code}` });
    }
  }

  /** One request to one model, logged. */
  async function call(
    role: AiRole,
    { model, reasoningEffort }: ModelChoice,
    messages: AiMessage[],
    options: { maxRetries?: number; backupBecause?: string } = {},
  ): Promise<AiResult> {
    const { backupBecause } = options;
    const settings = ROLE_SETTINGS[role];
    const params: ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      temperature: settings.temperature,
      max_completion_tokens: settings.maxTokens,
      ...(settings.json ? { response_format: { type: 'json_object' } } : {}),
      // Only sent when set, so models that don't support it aren't affected.
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    };

    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);

    try {
      const requestOptions =
        options.maxRetries === undefined ? undefined : { maxRetries: options.maxRetries };
      const { data, response } = await sdk.chat.completions
        .create(params, requestOptions)
        .withResponse();
      const choice = data.choices[0];
      const text = stripThinking(choice?.message.content ?? '');

      if (!text) {
        throw new AiError(
          'AI_BAD_RESPONSE',
          choice?.finish_reason === 'length'
            ? 'Empty reply: the model ran out of tokens (a reasoning model may have spent them all thinking).'
            : `Empty reply (finish_reason: ${choice?.finish_reason ?? 'none'}).`,
        );
      }

      const result: AiResult = {
        text,
        model: data.model,
        finishReason: choice?.finish_reason ?? null,
        latencyMs: elapsed(),
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
        },
        rateLimit: {
          remainingRequests: numberHeader(response.headers, 'x-ratelimit-remaining-requests'),
          remainingTokens: numberHeader(response.headers, 'x-ratelimit-remaining-tokens'),
        },
      };
      log({
        role,
        model,
        latencyMs: result.latencyMs,
        outcome: 'ok',
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        remainingTokens: result.rateLimit.remainingTokens,
        ...(backupBecause ? { backupBecause } : {}),
      });
      return result;
    } catch (err) {
      const aiError = toAiError(err);
      log({
        role,
        model,
        latencyMs: elapsed(),
        outcome: aiError.code,
        detail: aiError.detail,
        ...(backupBecause ? { backupBecause } : {}),
      });
      throw aiError;
    }
  }

  return { generate, sdk };
}

/** Builds the AI config from the validated .env values. */
export function aiConfigFromEnv(env: Env): AiConfig {
  const backup = (model: string | undefined, reasoningEffort: ReasoningEffort | undefined) =>
    model ? { model, reasoningEffort } : undefined;
  return {
    baseURL: env.AI_BASE_URL,
    apiKey: env.AI_API_KEY,
    timeoutMs: env.AI_TIMEOUT_MS,
    models: {
      client: {
        model: env.CLIENT_MODEL,
        reasoningEffort: env.CLIENT_REASONING_EFFORT,
        fallback: backup(env.CLIENT_FALLBACK_MODEL, env.CLIENT_FALLBACK_REASONING_EFFORT),
      },
      coach: {
        model: env.COACH_MODEL,
        reasoningEffort: env.COACH_REASONING_EFFORT,
        fallback: backup(env.COACH_FALLBACK_MODEL, env.COACH_FALLBACK_REASONING_EFFORT),
      },
    },
  };
}

/**
 * Some models write their reasoning inline as <think>…</think> before the answer.
 * That must never reach the student. An unclosed <think> means the reply was all thinking.
 */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();
}

function numberHeader(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function logToConsole(entry: AiCallLog): void {
  const head = `[ai] ${entry.role} ${entry.model} ${entry.outcome} ${entry.latencyMs}ms`;
  const backup = entry.backupBecause ? ` [backup: ${entry.backupBecause}]` : '';
  if (entry.outcome === 'ok') {
    const remaining =
      entry.remainingTokens === undefined ? '' : `, ${entry.remainingTokens} left this minute`;
    console.log(
      `${head} (tokens: ${entry.promptTokens} in, ${entry.completionTokens} out${remaining})${backup}`,
    );
  } else {
    console.warn(`${head}: ${entry.detail}${backup}`);
  }
}
