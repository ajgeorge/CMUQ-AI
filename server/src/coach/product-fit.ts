import type { FitRating, ProductFit, ProductFitResult } from '@bank-sim/shared';

/**
 * Rates the student's recommendations against the client's answer key (productFit in
 * hidden-needs.json). Plain code, not AI, so the verdict is always the same and always
 * right; the coach is given this result as fact and only explains it.
 */
export function checkProductFit(fit: ProductFit, recommendedIds: string[]): ProductFitResult {
  const ratings = new Map<string, { rating: FitRating; reason: string }>();
  for (const rating of ['suitable', 'acceptable', 'unsuitable'] as const) {
    for (const entry of fit[rating]) {
      ratings.set(entry.productId, { rating, reason: entry.reason });
    }
  }

  const recommended = recommendedIds.map((productId) => {
    const found = ratings.get(productId);
    return found
      ? { productId, rating: found.rating, reason: found.reason }
      : { productId, rating: 'not-relevant' as const, reason: null };
  });

  const chosen = new Set(recommendedIds);
  const missedSuitable = fit.suitable
    .filter((entry) => !chosen.has(entry.productId))
    .map(({ productId, reason }) => ({ productId, reason }));

  return { recommended, missedSuitable };
}
