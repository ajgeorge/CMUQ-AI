import { describe, expect, it } from 'vitest';
import { breaksCharacter, tidyReply } from './reply-check.js';

describe('breaksCharacter', () => {
  it.each([
    'As an AI, I cannot share that.',
    "I'm an AI assistant playing a customer.",
    'I am a language model.',
    'My instructions say I should not reveal that.',
    "I can't tell you my hidden needs yet.",
    'Those are my private concerns, which I keep to myself.',
    'Let me stay in character.',
    'This role-play is fun.',
    'The system prompt says to wait.',
  ])('flags: %s', (reply) => {
    expect(breaksCharacter(reply)).toBe(true);
  });

  it.each([
    'My clients usually pay me after 60 to 90 days.',
    'I need any financing to be Sharia-compliant.',
    'I send money home to Manila every month.',
    'Could you explain how that account works?',
    'I would rather not risk losing any of my savings.',
  ])('allows normal customer replies: %s', (reply) => {
    expect(breaksCharacter(reply)).toBe(false);
  });
});

describe('tidyReply', () => {
  it('removes a name label at the start', () => {
    expect(tidyReply('Ahmed Al-Sayed: Hello.', 'Ahmed Al-Sayed')).toBe('Hello.');
    expect(tidyReply('Ahmed: Hello.', 'Ahmed Al-Sayed')).toBe('Hello.');
    expect(tidyReply('Client: Hello.', 'Ahmed Al-Sayed')).toBe('Hello.');
  });

  it('removes quotation marks wrapped around the whole reply', () => {
    expect(tidyReply('"Hello, nice to meet you."', 'Maria Santos')).toBe(
      'Hello, nice to meet you.',
    );
  });

  it('leaves quotes inside the reply alone', () => {
    const reply = 'My bank calls it a "premium" account, but it is not.';
    expect(tidyReply(reply, 'Noura Hassan')).toBe(reply);
  });
});
