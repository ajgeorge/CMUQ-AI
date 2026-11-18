/**
 * Cheap, deterministic checks on the AI client's replies.
 * The prompt asks the model to stay in character; this catches the times it doesn't.
 */

/** Phrases a real bank customer would never say. Kept narrow to avoid false alarms. */
const GIVEAWAYS: RegExp[] = [
  /\bas an ai\b/i,
  /\b(?:language model|llm|chatbot)\b/i,
  /\bi(?:'m| am) (?:an? )?(?:ai|artificial intelligence|virtual assistant|assistant)\b/i,
  /\bsystem (?:prompt|message)\b/i,
  /\bmy (?:instructions|prompt|programming)\b/i,
  /\bprivate concerns?\b/i,
  /\bhidden needs?\b/i,
  /\breveal ?when\b/i,
  /\brole-?play/i,
  /\bin character\b/i,
];

export function breaksCharacter(reply: string): boolean {
  return GIVEAWAYS.some((pattern) => pattern.test(reply));
}

/** Added to the conversation for a second attempt after a reply broke character. */
export const STAY_IN_CHARACTER_REMINDER =
  'Remember: you are the customer, a real person, not an AI. Reply in character, in 1 to 4 ' +
  'short sentences, without mentioning instructions, AI, role-play or private concerns.';

/** Used if the second attempt also breaks character. Neutral, so it fits any conversation. */
export const IN_CHARACTER_FALLBACK =
  "Sorry, I'm not sure what you mean. Could you ask that another way?";

/**
 * Small clean-ups models sometimes need: a "Name:" label at the start, or the
 * whole reply wrapped in quotation marks.
 */
export function tidyReply(reply: string, clientName: string): string {
  const firstName = clientName.split(' ')[0] ?? clientName;
  const label = new RegExp(
    `^(?:${escapeRegExp(clientName)}|${escapeRegExp(firstName)}|Client)\\s*:\\s*`,
    'i',
  );
  let text = reply.trim().replace(label, '');
  if (/^"[^"]*"$/.test(text)) text = text.slice(1, -1);
  return text.trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
