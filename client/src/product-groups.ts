import type { Product } from '@bank-sim/shared';

export interface ProductGroup {
  /** The category as written in products.json, e.g. "business". */
  category: string;
  /** For headings, e.g. "Business". */
  label: string;
  products: Product[];
}

/**
 * The products grouped by category, in the order each category first appears in
 * products.json. Categories come from the content file, so adding a new one (e.g.
 * "private banking") needs no code change.
 */
export function groupByCategory(products: Product[]): ProductGroup[] {
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const group = groups.get(product.category) ?? [];
    group.push(product);
    groups.set(product.category, group);
  }
  return [...groups].map(([category, items]) => ({
    category,
    label: capitalise(category),
    products: items,
  }));
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
