import { describe, expect, it } from 'vitest';
import { loadContent } from '../content.js';
import { findMentionedProducts, productKeywords } from './mentions.js';

const { products } = loadContent();
const mentioned = (...texts: string[]) =>
  findMentionedProducts(products, texts).map((product) => product.id);

describe('productKeywords', () => {
  it('keeps the distinctive words of each name and drops shared or common ones', () => {
    const keywords = productKeywords(products);
    expect(keywords.get('wakala-term-deposit')).toEqual(['wakala', 'deposit']);
    expect(keywords.get('business-flex-overdraft')).toEqual(['overdraft']);
    expect(keywords.get('tijara-business-account')).toEqual(['tijara']);
  });

  it('gives every product in the catalogue at least one keyword', () => {
    for (const [id, words] of productKeywords(products)) {
      expect(words.length, id).toBeGreaterThan(0);
    }
  });
});

describe('findMentionedProducts', () => {
  it('finds products by full name, in any case', () => {
    expect(mentioned('Have you looked at our growth equity fund?')).toEqual(['growth-equity-fund']);
  });

  it('finds products by a distinctive word, including plurals', () => {
    expect(mentioned('An overdraft would help.')).toEqual(['business-flex-overdraft']);
    expect(mentioned('Our term deposits pay well.')).toEqual(['wakala-term-deposit']);
    expect(mentioned('Ijara covers equipment.')).toEqual(['ijara-equipment-finance']);
  });

  it('finds several products across several messages', () => {
    expect(mentioned('We have Tijara.', 'Also a salary account.')).toEqual([
      'tijara-business-account',
      'everyday-salary-account',
    ]);
  });

  it('ignores ordinary conversation', () => {
    expect(mentioned('How is the business growing?', 'Tell me about your personal goals.')).toEqual(
      [],
    );
  });
});
