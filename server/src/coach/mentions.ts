import type { Product } from '@bank-sim/shared';

/**
 * Words in product names too common to identify one product on their own
 * ("personal savings", "business growth"…).
 */
const COMMON_WORDS = new Set([
  'account',
  'business',
  'everyday',
  'finance',
  'financing',
  'flex',
  'global',
  'growth',
  'islamic',
  'personal',
  'term',
]);

/**
 * The words that identify each product: the words in its name that no other product's
 * name uses, minus common ones. "Wakala Term Deposit" → wakala, deposit. Worked out
 * from the catalogue, so new products are picked up without extra configuration.
 */
export function productKeywords(products: Product[]): Map<string, string[]> {
  const wordsOf = (product: Product) =>
    product.name.toLowerCase().match(/[a-z]+/g) ?? ([] as string[]);

  const timesUsed = new Map<string, number>();
  for (const product of products) {
    for (const word of new Set(wordsOf(product))) {
      timesUsed.set(word, (timesUsed.get(word) ?? 0) + 1);
    }
  }

  return new Map(
    products.map((product) => [
      product.id,
      wordsOf(product).filter(
        (word) => timesUsed.get(word) === 1 && !COMMON_WORDS.has(word) && word.length > 2,
      ),
    ]),
  );
}

/**
 * Products the student talked about in the interview, so the coach can check what they
 * said about them. Errs on the side of including a product: an extra one only costs a
 * few tokens, a missing one means a wrong claim could go unnoticed.
 */
export function findMentionedProducts(products: Product[], texts: string[]): Product[] {
  const keywords = productKeywords(products);
  const joined = texts.join(' ').toLowerCase();
  const words = new Set(joined.match(/[a-z]+/g) ?? []);

  return products.filter(
    (product) =>
      joined.includes(product.name.toLowerCase()) ||
      (keywords.get(product.id) ?? []).some((word) => words.has(word) || words.has(`${word}s`)),
  );
}
