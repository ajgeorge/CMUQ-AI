import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import {
  CatalogueSchema,
  ClientProfileSchema,
  HiddenNeedsFileSchema,
  IdSchema,
  type Bank,
  type Client,
  type Difficulty,
  type Product,
  type PublicClient,
} from '@bank-sim/shared';
import { CONTENT_DIR } from './paths.js';

export const PRODUCTS_FILE = 'products.json';
export const CLIENTS_DIR = 'clients';
export const PROFILE_FILE = 'profile.json';
export const HIDDEN_NEEDS_FILE = 'hidden-needs.json';

const DIFFICULTY_ORDER: Record<Difficulty, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/** Thrown when the content files have problems. Lists every problem found, not just the first. */
export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `Found ${problems.length} problem(s) in the content files:\n` +
        problems.map((p) => `  - ${p}`).join('\n'),
    );
    this.name = 'ContentError';
  }
}

/** All validated content, loaded once when the server starts. */
export interface Content {
  bank: Bank;
  products: Product[];
  /** Sorted by difficulty, then name. */
  clients: Client[];
  getClient(id: string): Client | undefined;
  getProduct(id: string): Product | undefined;
}

/**
 * Loads and validates everything in the content folder:
 *
 *   products.json
 *   clients/<client-id>/profile.json
 *   clients/<client-id>/hidden-needs.json
 *
 * Throws a ContentError listing every problem, so whoever edits the files can fix them in one go.
 */
export function loadContent(contentDir: string = CONTENT_DIR): Content {
  const problems: string[] = [];

  // --- Product catalogue ---
  const catalogue = readJsonFile(contentDir, PRODUCTS_FILE, CatalogueSchema, problems);
  const productsById = new Map<string, Product>();
  for (const product of catalogue?.products ?? []) {
    if (productsById.has(product.id)) {
      problems.push(`${PRODUCTS_FILE}: product id "${product.id}" is used more than once`);
    }
    productsById.set(product.id, product);
  }

  // --- Clients: one folder per client ---
  const clients: Client[] = [];
  for (const id of listClientFolders(contentDir, problems)) {
    const base = `${CLIENTS_DIR}/${id}`;

    const idCheck = IdSchema.safeParse(id);
    if (!idCheck.success) {
      problems.push(`${base}: folder name ${idCheck.error.issues[0]?.message ?? 'is invalid'}`);
      continue;
    }

    const profile = readJsonFile(
      contentDir,
      `${base}/${PROFILE_FILE}`,
      ClientProfileSchema,
      problems,
    );
    const hidden = readJsonFile(
      contentDir,
      `${base}/${HIDDEN_NEEDS_FILE}`,
      HiddenNeedsFileSchema,
      problems,
    );
    if (!profile || !hidden) continue;

    const before = problems.length;
    checkHiddenNeeds(`${base}/${HIDDEN_NEEDS_FILE}`, hidden, productsById, catalogue, problems);
    if (problems.length > before) continue;

    clients.push({ id, profile, needs: hidden.needs, productFit: hidden.productFit });
  }

  if (problems.length === 0 && clients.length === 0) {
    problems.push(`${CLIENTS_DIR}: no clients found — add at least one client folder`);
  }
  if (problems.length > 0 || !catalogue) {
    throw new ContentError(problems);
  }

  clients.sort(
    (a, b) =>
      DIFFICULTY_ORDER[a.profile.difficulty] - DIFFICULTY_ORDER[b.profile.difficulty] ||
      a.profile.name.localeCompare(b.profile.name),
  );
  const clientsById = new Map(clients.map((c) => [c.id, c]));

  return {
    bank: catalogue.bank,
    products: catalogue.products,
    clients,
    getClient: (clientId) => clientsById.get(clientId),
    getProduct: (productId) => productsById.get(productId),
  };
}

/**
 * The only client data that is ever sent to the browser.
 * Fields are copied one by one (an allowlist), so anything added to the profile
 * later stays private unless it is deliberately added here.
 */
export function toPublicClient(client: Client): PublicClient {
  const { name, age, occupation, location, difficulty, summary, openingLine } = client.profile;
  return { id: client.id, name, age, occupation, location, difficulty, summary, openingLine };
}

// ---------------------------------------------------------------------------

function listClientFolders(contentDir: string, problems: string[]): string[] {
  try {
    return readdirSync(path.join(contentDir, CLIENTS_DIR), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    problems.push(`${CLIENTS_DIR}: folder is missing`);
    return [];
  }
}

function checkHiddenNeeds(
  label: string,
  hidden: z.output<typeof HiddenNeedsFileSchema>,
  productsById: Map<string, Product>,
  catalogue: unknown,
  problems: string[],
): void {
  const needIds = new Set<string>();
  for (const need of hidden.needs) {
    if (needIds.has(need.id))
      problems.push(`${label}: need id "${need.id}" is used more than once`);
    needIds.add(need.id);
  }

  const seen = new Map<string, string>();
  for (const list of ['suitable', 'acceptable', 'unsuitable'] as const) {
    for (const { productId } of hidden.productFit[list]) {
      // Only check product ids if the catalogue itself loaded; otherwise every id would fail.
      if (catalogue && !productsById.has(productId)) {
        problems.push(`${label} → productFit.${list}: unknown product id "${productId}"`);
      }
      const earlier = seen.get(productId);
      if (earlier) {
        problems.push(
          `${label} → productFit: "${productId}" is listed in both "${earlier}" and "${list}"`,
        );
      }
      seen.set(productId, list);
    }
  }
}

function readJsonFile<S extends z.ZodType>(
  contentDir: string,
  relativePath: string,
  schema: S,
  problems: string[],
): z.output<S> | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path.join(contentDir, relativePath), 'utf8'));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    problems.push(
      code === 'ENOENT'
        ? `${relativePath}: file is missing`
        : `${relativePath}: not valid JSON (${(err as Error).message})`,
    );
    return undefined;
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const where = issue.path.length > 0 ? formatPath(issue.path) : 'file';
      problems.push(`${relativePath} → ${where}: ${issue.message}`);
    }
    return undefined;
  }
  return result.data;
}

/** ["needs", 1, "revealWhen"] → "needs[1].revealWhen" */
function formatPath(segments: PropertyKey[]): string {
  return segments.reduce<string>((acc, key) => {
    if (typeof key === 'number') return `${acc}[${key}]`;
    return acc ? `${acc}.${String(key)}` : String(key);
  }, '');
}
