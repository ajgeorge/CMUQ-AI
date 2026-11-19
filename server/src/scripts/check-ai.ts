/**
 * Setup check: `npm run check:ai`
 * Confirms the API key works, and that each configured model (including any backups)
 * exists and answers.
 * Prints what to fix when something is wrong. Never prints the API key.
 */
import { env } from '../env.js';
import { aiConfigFromEnv, createAi, type AiRole } from '../ai/client.js';
import { toAiError } from '../ai/errors.js';

const ok = (text: string) => console.log(`  ✓ ${text}`);
const fail = (text: string) => console.log(`  ✗ ${text}`);

interface ModelCheck {
  role: AiRole;
  label: string;
  envName: string;
  model: string;
  /** Each model is tested on its own: a main model must not pass thanks to its backup. */
  use: 'main' | 'backup';
}

const MODELS: ModelCheck[] = [
  {
    role: 'client',
    label: 'AI Client',
    envName: 'CLIENT_MODEL',
    model: env.CLIENT_MODEL,
    use: 'main',
  },
  ...(env.CLIENT_FALLBACK_MODEL
    ? [
        {
          role: 'client',
          label: 'AI Client backup',
          envName: 'CLIENT_FALLBACK_MODEL',
          model: env.CLIENT_FALLBACK_MODEL,
          use: 'backup',
        } as const,
      ]
    : []),
  { role: 'coach', label: 'AI Coach', envName: 'COACH_MODEL', model: env.COACH_MODEL, use: 'main' },
  ...(env.COACH_FALLBACK_MODEL
    ? [
        {
          role: 'coach',
          label: 'AI Coach backup',
          envName: 'COACH_FALLBACK_MODEL',
          model: env.COACH_FALLBACK_MODEL,
          use: 'backup',
        } as const,
      ]
    : []),
];

const TEST_MESSAGES: Record<AiRole, { system: string; user: string }> = {
  client: { system: 'Reply with one short sentence.', user: 'Say hello.' },
  // JSON mode requires the word "JSON" to appear in the messages.
  coach: { system: 'You reply only with JSON.', user: 'Return {"ok": true} as JSON.' },
};

async function main(): Promise<boolean> {
  const ai = createAi(aiConfigFromEnv(env), () => {}); // results are printed below instead
  let allGood = true;

  console.log('\nChecking the AI connection');
  console.log(`  Provider: ${env.AI_BASE_URL}`);
  console.log(`  Timeout:  ${env.AI_TIMEOUT_MS} ms per attempt\n`);

  // 1. Is the key accepted? Listing models is free and doesn't use any token quota.
  console.log('API key');
  const available: string[] = [];
  try {
    for await (const model of ai.sdk.models.list()) available.push(model.id);
    ok(`accepted (${available.length} models available)`);
  } catch (err) {
    const error = toAiError(err);
    fail(error.detail);
    console.log('\n  Check AI_API_KEY and AI_BASE_URL in your .env file.\n');
    return false;
  }

  // 2. Does each configured model exist, and does it answer?
  for (const { role, label, envName, model, use } of MODELS) {
    console.log(`\n${label} (${envName}=${model})`);

    if (!available.includes(model)) {
      fail(`"${model}" was not found on this provider.`);
      console.log('    Available models:');
      for (const id of available.toSorted()) console.log(`      ${id}`);
      allGood = false;
      continue;
    }
    ok('model found');

    try {
      const { system, user } = TEST_MESSAGES[role];
      const result = await ai.generate(
        role,
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { use },
      );
      const left = result.rateLimit.remainingTokens;
      ok(
        `answered in ${result.latencyMs} ms ` +
          `(${result.usage.promptTokens} tokens in, ${result.usage.completionTokens} out` +
          `${left === undefined ? '' : `; ${left} tokens left this minute`})`,
      );
      console.log(`    Reply: ${result.text.slice(0, 80)}`);

      if (role === 'coach') {
        try {
          JSON.parse(result.text);
          ok('JSON output works');
        } catch {
          fail('reply was not valid JSON; the coach needs a model that supports JSON mode.');
          allGood = false;
        }
      }
    } catch (err) {
      const error = toAiError(err);
      fail(`${error.code}: ${error.detail}`);
      allGood = false;
    }
  }

  console.log(
    allGood
      ? '\nAll good: the AI connection is ready.\n'
      : '\nSome checks failed. Fix the values in .env and run this again.\n',
  );
  return allGood;
}

process.exitCode = (await main()) ? 0 : 1;
