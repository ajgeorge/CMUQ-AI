import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import type { Env } from '../env.js';
import { AiError, toAiError, type AiErrorCode } from './errors.js';

/** The two chatbots in the app. Each has its own model and settings. */
export type AiRole = 'client' | 'coach';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiConfig {
  baseURL: string;
  apiKey: string;
  /** Per attempt. The SDK retries timeouts too, so the worst case is (maxRetries + 1) × this. */
  timeoutMs: number;
  /** Retries for rate limits, timeouts, connection errors and 5xx. Honours `retry-after`. */
  maxRetries?: number;
  models: Record<AiRole, { model: string; reasoningEffort?: ReasoningEffort | undefined }>;
  /** Only for tests: lets them fake the provider without any network calls. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Behaviour for each role. Kept in code rather than .env because they're part of how
 * each chatbot is designed, not deployment settings.
 * Note that for reasoning models, maxTokens also covers the hidden "thinking" tokens.
 */
const ROLE_SETTINGS: Record<AiRole, { temperature: number; maxTokens: number; json: boolean }> = {
  // Natural, varied conversation in short replies.
  client: { temperature: 0.8, maxTokens: 512, json: false },
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
}

export type AiLogger = (entry: AiCallLog) => void;

export interface Ai {
  generate(role: AiRole, messages: ChatMessage[]): Promise<AiResult>;
  /** Raw SDK client, for the setup check (listing models). */
  readonly sdk: OpenAI;
}

export function createAi(config: AiConfig, log: AiLogger = logToConsole): Ai {
  const sdk = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: config.maxRetries ?? 2,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  async function generate(role: AiRole, messages: ChatMessage[]): Promise<AiResult> {
    const { model, reasoningEffort } = config.models[role];
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
      const { data, response } = await sdk.chat.completions.create(params).withResponse();
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
      });
      return result;
    } catch (err) {
      const aiError = toAiError(err);
      log({ role, model, latencyMs: elapsed(), outcome: aiError.code, detail: aiError.detail });
      throw aiError;
    }
  }

  return { generate, sdk };
}

/** Builds the AI config from the validated .env values. */
export function aiConfigFromEnv(env: Env): AiConfig {
  return {
    baseURL: env.AI_BASE_URL,
    apiKey: env.AI_API_KEY,
    timeoutMs: env.AI_TIMEOUT_MS,
    models: {
      client: { model: env.CLIENT_MODEL, reasoningEffort: env.CLIENT_REASONING_EFFORT },
      coach: { model: env.COACH_MODEL, reasoningEffort: env.COACH_REASONING_EFFORT },
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
  if (entry.outcome === 'ok') {
    const remaining =
      entry.remainingTokens === undefined ? '' : `, ${entry.remainingTokens} left this minute`;
    console.log(
      `${head} (tokens: ${entry.promptTokens} in, ${entry.completionTokens} out${remaining})`,
    );
  } else {
    console.warn(`${head}: ${entry.detail}`);
  }
}
