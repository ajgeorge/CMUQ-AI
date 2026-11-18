import { Router } from 'express';
import {
  ChatRequestSchema,
  type ChatMessage,
  type ChatResponse,
  type Client,
} from '@bank-sim/shared';
import type { Ai, AiMessage } from '../ai/client.js';
import {
  IN_CHARACTER_FALLBACK,
  STAY_IN_CHARACTER_REMINDER,
  breaksCharacter,
  tidyReply,
} from '../ai/reply-check.js';
import type { Content } from '../content.js';
import { formatPath } from '../format.js';
import { sendError } from '../http.js';
import { buildClientPrompt } from '../prompts/client-prompt.js';

/**
 * POST /chat — the student's interview with the AI client.
 * Stateless: the browser sends the whole conversation each turn.
 * AI failures are thrown as AiError and turned into responses by the app's error handler.
 */
export function chatRouter(content: Content, ai: Ai): Router {
  const router = Router();

  // Prompts only depend on the content files, which don't change while the server runs.
  const prompts = new Map(
    content.clients.map((client) => [client.id, buildClientPrompt(client, content.bank)]),
  );

  router.post('/chat', async (req, res) => {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue && issue.path.length > 0 ? `${formatPath(issue.path)}: ` : '';
      sendError(res, 400, 'BAD_REQUEST', `${where}${issue?.message ?? 'invalid request'}`);
      return;
    }

    const { clientId, messages } = parsed.data;
    const client = content.getClient(clientId);
    const prompt = prompts.get(clientId);
    if (!client || !prompt) {
      sendError(res, 404, 'NOT_FOUND', `No client with id "${clientId}".`);
      return;
    }

    const reply = await clientReply(ai, client, prompt, messages);
    res.json({ reply } satisfies ChatResponse);
  });

  return router;
}

async function clientReply(
  ai: Ai,
  client: Client,
  prompt: string,
  messages: ChatMessage[],
): Promise<string> {
  const conversation: AiMessage[] = [
    { role: 'system', content: prompt },
    // The opening line is added here rather than trusted from the browser.
    { role: 'assistant', content: client.profile.openingLine },
    ...messages.map((m): AiMessage => ({
      role: m.role === 'student' ? 'user' : 'assistant',
      content: m.content,
    })),
  ];

  const first = tidyReply((await ai.generate('client', conversation)).text, client.profile.name);
  if (!breaksCharacter(first)) return first;

  // One more try with a reminder; if that fails too, use a neutral in-character line.
  console.warn(`[chat] ${client.id}: reply broke character, regenerating`);
  const retry = tidyReply(
    (
      await ai.generate('client', [
        ...conversation,
        { role: 'system', content: STAY_IN_CHARACTER_REMINDER },
      ])
    ).text,
    client.profile.name,
  );
  if (!breaksCharacter(retry)) return retry;

  console.warn(`[chat] ${client.id}: retry also broke character, using the fallback reply`);
  return IN_CHARACTER_FALLBACK;
}
