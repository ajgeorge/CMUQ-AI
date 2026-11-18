import { describe, expect, it } from 'vitest';
import { loadContent } from '../content.js';
import { buildClientPrompt } from './client-prompt.js';

const content = loadContent();
const promptFor = (id: string) => {
  const client = content.getClient(id);
  if (!client) throw new Error(`No client "${id}" in the content folder`);
  return buildClientPrompt(client, content.bank);
};

describe('buildClientPrompt', () => {
  it.each(content.clients.map((c) => [c.id, c] as const))(
    'gives %s their persona and every private concern with its reveal rule',
    (_id, client) => {
      const prompt = buildClientPrompt(client, content.bank);

      expect(prompt).toContain(`You are ${client.profile.name}`);
      expect(prompt).toContain(content.bank.name);
      expect(prompt).toContain(client.profile.personality);
      expect(prompt).toContain(client.profile.background);
      expect(prompt).toContain(client.profile.summary);
      expect(prompt).toContain(client.profile.openingLine);
      for (const need of client.needs) {
        expect(prompt).toContain(need.description);
        expect(prompt).toContain(need.revealWhen);
      }
    },
  );

  it.each(content.clients.map((c) => [c.id, c] as const))(
    'keeps the answer key, example questions and product catalogue out of %s’s prompt',
    (_id, client) => {
      const prompt = buildClientPrompt(client, content.bank);
      const fit = client.productFit;

      for (const entry of [...fit.suitable, ...fit.acceptable, ...fit.unsuitable]) {
        expect(prompt).not.toContain(entry.reason);
      }
      for (const need of client.needs) {
        for (const question of need.exampleQuestions) expect(prompt).not.toContain(question);
      }
      for (const product of content.products) expect(prompt).not.toContain(product.name);
    },
  );

  it('makes the client more or less open depending on difficulty', () => {
    expect(promptFor('maria')).toContain('drop one small, natural hint');
    expect(promptFor('ahmed')).toContain('do not add information you were not asked for');
    expect(promptFor('noura')).toContain('You are guarded');
  });

  it('stays small enough to leave room for a long interview', () => {
    // Rough estimate of 4 characters per token. The budget is about 1,500 tokens
    // so that prompt + a maximum-length interview stays well under 8,000.
    for (const client of content.clients) {
      const prompt = buildClientPrompt(client, content.bank);
      expect(prompt.length / 4).toBeLessThan(1_500);
    }
  });
});
