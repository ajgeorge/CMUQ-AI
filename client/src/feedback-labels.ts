import type { FeedbackResponse, FitRating, NeedStatus } from '@bank-sim/shared';

/*
 * The words used for each verdict on the feedback page and in the downloaded copy,
 * kept in one place so the two always match.
 */

export type Tone = 'good' | 'mixed' | 'bad' | 'neutral';

export interface Label {
  label: string;
  symbol: string;
  tone: Tone;
}

export const NEED_STATUS: Record<NeedStatus, Label> = {
  found: { label: 'Found', symbol: '✓', tone: 'good' },
  partly: { label: 'Partly found', symbol: '◐', tone: 'mixed' },
  missed: { label: 'Missed', symbol: '✗', tone: 'bad' },
};

export const FIT: Record<FitRating, Label> = {
  suitable: { label: 'Suitable', symbol: '✓', tone: 'good' },
  acceptable: { label: 'Acceptable', symbol: '◐', tone: 'mixed' },
  unsuitable: { label: 'Unsuitable', symbol: '✗', tone: 'bad' },
  'not-relevant': { label: 'Not a match', symbol: '–', tone: 'neutral' },
};

export const ACCURACY: Record<FeedbackResponse['productAccuracy']['status'], Label> = {
  accurate: { label: 'Accurate', symbol: '✓', tone: 'good' },
  issues: { label: 'Some information was wrong', symbol: '✗', tone: 'bad' },
  'no-claims': { label: 'No product details given', symbol: '–', tone: 'neutral' },
};

/** Shown for a recommended product that isn't in the client's answer key. */
export function notRelevantReason(firstName: string): string {
  return `This isn't one of the products the bank considers relevant to ${firstName}'s needs.`;
}

export function firstNameOf(name: string): string {
  return name.split(' ')[0] ?? name;
}

export function needsFoundLine(feedback: FeedbackResponse, firstName: string): string {
  const found = feedback.needs.filter((n) => n.status === 'found').length;
  return `You fully uncovered ${found} of ${firstName}'s ${feedback.needs.length} needs.`;
}
