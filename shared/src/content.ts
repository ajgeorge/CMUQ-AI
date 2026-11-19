import { z } from 'zod';

/*
 * Schemas for the editable content files in /content.
 *
 * Objects are strict: an unknown key (usually a typo such as "revealwhen") is reported
 * as an error instead of being silently ignored.
 */

const text = z.string().trim().min(1, 'must not be empty');
const textList = z.array(text).min(1, 'must have at least one entry');

/** Lowercase identifiers such as "islamic-receivables-finance". */
export const IdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase letters, numbers and dashes');

// ---------------------------------------------------------------------------
// Products — content/products.json
// ---------------------------------------------------------------------------

export const ProductSchema = z.strictObject({
  id: IdSchema,
  name: text,
  /** Any short label, e.g. "business" or "personal". The app groups products by it. */
  category: text,
  /** Any short label, e.g. "account", "financing", "savings" or "investment". */
  type: text,
  shariaCompliant: z.boolean(),
  summary: text,
  features: textList,
  limitations: textList,
  eligibility: textList,
  fees: text,
});
export type Product = z.infer<typeof ProductSchema>;

export const BankSchema = z.strictObject({
  name: text,
  currency: text,
});
export type Bank = z.infer<typeof BankSchema>;

export const CatalogueSchema = z.strictObject({
  bank: BankSchema,
  products: z.array(ProductSchema).min(3, 'the catalogue needs at least 3 products'),
});
export type Catalogue = z.infer<typeof CatalogueSchema>;

// ---------------------------------------------------------------------------
// Clients — content/clients/<id>/profile.json
// ---------------------------------------------------------------------------

export const DifficultySchema = z.enum(['beginner', 'intermediate', 'advanced']);
export type Difficulty = z.infer<typeof DifficultySchema>;

/**
 * Who the client is. Some fields are shown to the student; `personality` and
 * `background` are only given to the AI so it can play the role convincingly.
 */
export const ClientProfileSchema = z.strictObject({
  // Shown to the student
  name: text,
  age: z.number().int().min(18).max(100),
  occupation: text,
  location: text,
  difficulty: DifficultySchema,
  summary: text,
  openingLine: text,
  // Only for the AI
  personality: text,
  background: text,
});
export type ClientProfile = z.infer<typeof ClientProfileSchema>;

// ---------------------------------------------------------------------------
// Hidden needs — content/clients/<id>/hidden-needs.json (never sent to the browser)
// ---------------------------------------------------------------------------

export const HiddenNeedSchema = z.strictObject({
  id: IdSchema,
  /** A few words naming the need, shown on the feedback page. */
  title: text,
  importance: z.enum(['critical', 'medium', 'low']),
  description: text,
  /** When the AI Client may reveal this need. */
  revealWhen: text,
  /** Good questions that would uncover this need; used by the coach. */
  exampleQuestions: textList,
});
export type HiddenNeed = z.infer<typeof HiddenNeedSchema>;

export const ProductFitEntrySchema = z.strictObject({
  productId: IdSchema,
  reason: text,
});
export type ProductFitEntry = z.infer<typeof ProductFitEntrySchema>;

/** The coach's answer key: how well each product fits this client. */
export const ProductFitSchema = z.strictObject({
  suitable: z.array(ProductFitEntrySchema).min(1, 'list at least one suitable product'),
  acceptable: z.array(ProductFitEntrySchema).default([]),
  unsuitable: z.array(ProductFitEntrySchema).default([]),
});
export type ProductFit = z.infer<typeof ProductFitSchema>;

export const HiddenNeedsFileSchema = z.strictObject({
  needs: z.array(HiddenNeedSchema).min(1, 'list at least one hidden need'),
  productFit: ProductFitSchema,
});
export type HiddenNeedsFile = z.infer<typeof HiddenNeedsFileSchema>;

// ---------------------------------------------------------------------------
// Combined and public shapes
// ---------------------------------------------------------------------------

/** Everything about one client. Server-side only. */
export interface Client {
  id: string;
  profile: ClientProfile;
  needs: HiddenNeed[];
  productFit: ProductFit;
}

/** The part of a client that is safe to send to the browser. */
export const PublicClientSchema = z.strictObject({
  id: IdSchema,
  name: text,
  age: z.number(),
  occupation: text,
  location: text,
  difficulty: DifficultySchema,
  summary: text,
  openingLine: text,
});
export type PublicClient = z.infer<typeof PublicClientSchema>;
