import { describe, expect, it } from 'vitest';
import type { ProductFit } from '@bank-sim/shared';
import { loadContent } from '../content.js';
import { checkProductFit } from './product-fit.js';

const fit: ProductFit = {
  suitable: [
    { productId: 'receivables', reason: 'Covers the payment gap.' },
    { productId: 'tijara', reason: 'Sharia-compliant account.' },
  ],
  acceptable: [{ productId: 'ijara', reason: 'Useful later.' }],
  unsuitable: [{ productId: 'overdraft', reason: 'Interest-based.' }],
};

describe('checkProductFit', () => {
  it('rates each recommendation with the reason from the answer key', () => {
    const result = checkProductFit(fit, ['overdraft', 'receivables', 'ijara']);
    expect(result.recommended).toEqual([
      { productId: 'overdraft', rating: 'unsuitable', reason: 'Interest-based.' },
      { productId: 'receivables', rating: 'suitable', reason: 'Covers the payment gap.' },
      { productId: 'ijara', rating: 'acceptable', reason: 'Useful later.' },
    ]);
  });

  it('lists suitable products the student did not recommend', () => {
    expect(checkProductFit(fit, ['receivables']).missedSuitable).toEqual([
      { productId: 'tijara', reason: 'Sharia-compliant account.' },
    ]);
    expect(checkProductFit(fit, ['receivables', 'tijara']).missedSuitable).toEqual([]);
  });

  it('marks products missing from the answer key as not relevant', () => {
    expect(checkProductFit(fit, ['savings']).recommended).toEqual([
      { productId: 'savings', rating: 'not-relevant', reason: null },
    ]);
  });

  it('flags the overdraft for Ahmed in the real content', () => {
    const ahmed = loadContent().getClient('ahmed');
    const result = checkProductFit(ahmed!.productFit, ['business-flex-overdraft']);
    expect(result.recommended[0]?.rating).toBe('unsuitable');
    expect(result.missedSuitable.map((m) => m.productId)).toEqual([
      'islamic-receivables-finance',
      'tijara-business-account',
    ]);
  });
});
