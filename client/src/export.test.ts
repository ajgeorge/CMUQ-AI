import { describe, expect, it } from 'vitest';
import type { FeedbackResponse, Product, PublicClient } from '@bank-sim/shared';
import { fileName, toMarkdown, type InterviewRecord } from './export';

const ahmed: PublicClient = {
  id: 'ahmed',
  name: 'Ahmed Al-Sayed',
  age: 42,
  occupation: 'Owner, Saffron Table Catering',
  location: 'Doha, Qatar',
  difficulty: 'intermediate',
  summary: 'Runs a catering company.',
  openingLine: 'I need to sort out some banking for the business.',
};

const products = [
  { id: 'islamic-receivables-finance', name: 'Islamic Receivables Finance' },
  { id: 'tijara-business-account', name: 'Tijara Business Account' },
  { id: 'growth-equity-fund', name: 'Growth Equity Fund' },
] as Product[];

const feedback: FeedbackResponse = {
  moments: [],
  needs: [
    {
      id: 'cash-flow-gap',
      title: 'Gap between paying costs and getting paid',
      importance: 'critical',
      description: 'Hotels pay in 60 to 90 days.',
      status: 'found',
      evidence: 'What is your biggest challenge right now?',
      comment: 'You found this early.',
    },
    {
      id: 'sharia-only',
      title: 'Only uses Sharia-compliant products',
      importance: 'critical',
      description: 'He will not use interest-based products.',
      status: 'missed',
      evidence: null,
      comment: 'You never asked about his preferences.',
    },
  ],
  productFit: {
    recommended: [
      { productId: 'islamic-receivables-finance', rating: 'suitable', reason: 'Covers the gap.' },
      { productId: 'growth-equity-fund', rating: 'not-relevant', reason: null },
    ],
    missedSuitable: [{ productId: 'tijara-business-account', reason: 'He needs an account too.' }],
  },
  wentWell: ['Open first question.'],
  missed: [],
  improve: [
    { advice: 'Ask about preferences.', exampleQuestion: 'Do you have any banking requirements?' },
    { advice: 'Summarise back to the client.', exampleQuestion: null },
  ],
  productAccuracy: { status: 'no-claims', comment: 'No products were described.' },
};

const record: InterviewRecord = {
  client: ahmed,
  products,
  messages: [
    { role: 'student', content: 'What is your biggest challenge right now?' },
    { role: 'client', content: 'Hotels pay late.' },
  ],
  summary: {
    needsIdentified: 'Cash flow gap.\nHotels pay in 60 to 90 days.',
    recommendedProductIds: ['islamic-receivables-finance', 'growth-equity-fund'],
    justification: 'Covers the gap.\n\nAlso helps him grow.',
  },
  feedback,
  date: new Date(2026, 10, 19),
};

const markdown = toMarkdown(record);

describe('toMarkdown', () => {
  it('starts with the client and the date', () => {
    expect(markdown).toMatch(/^# Interview with Ahmed Al-Sayed\n/);
    expect(markdown).toContain('42, Owner, Saffron Table Catering, Doha, Qatar.');
    expect(markdown).toContain('19 November 2026');
  });

  it('has the whole conversation in order, starting with the opening line', () => {
    expect(markdown).toContain(
      [
        '## Interview',
        '',
        '**Ahmed:** I need to sort out some banking for the business.',
        '',
        '**Student:** What is your biggest challenge right now?',
        '',
        '**Ahmed:** Hotels pay late.',
      ].join('\n'),
    );
  });

  it("has the student's summary, keeping their line breaks and paragraphs", () => {
    expect(markdown).toContain('Cash flow gap.  \nHotels pay in 60 to 90 days.');
    expect(markdown).toContain('- Islamic Receivables Finance\n- Growth Equity Fund');
    expect(markdown).toContain('Covers the gap.\n\nAlso helps him grow.');
  });

  it('has the three parts of the feedback', () => {
    expect(markdown).toContain('### What went well\n\n- Open first question.');
    expect(markdown).toContain('### What was missed\n\nNothing important was missed.');
    expect(markdown).toContain(
      '- Ask about preferences.  \n  Try asking: "Do you have any banking requirements?"\n- Summarise back to the client.',
    );
  });

  it('has each need with its verdict, and the question that found it', () => {
    expect(markdown).toContain(
      '#### Gap between paying costs and getting paid: ✓ Found (critical need)',
    );
    expect(markdown).toContain('You asked: "What is your biggest challenge right now?"');
    expect(markdown).toContain(
      '#### Only uses Sharia-compliant products: ✗ Missed (critical need)',
    );
  });

  it('has the recommendation check and the accuracy verdict', () => {
    expect(markdown).toContain('- **Islamic Receivables Finance** (✓ Suitable): Covers the gap.');
    expect(markdown).toContain(
      "- **Growth Equity Fund** (– Not a match): This isn't one of the products the bank considers relevant to Ahmed's needs.",
    );
    expect(markdown).toContain('- **Tijara Business Account**: He needs an account too.');
    expect(markdown).toContain('– No product details given. No products were described.');
  });
});

describe('fileName', () => {
  it("names the file after the client and the student's local date", () => {
    expect(fileName(ahmed, new Date(2026, 0, 5, 23, 30))).toBe('interview-ahmed-2026-01-05.md');
  });
});
