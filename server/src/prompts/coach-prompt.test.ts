import { describe, expect, it } from 'vitest';
import { loadContent } from '../content.js';
import { findMentionedProducts } from '../coach/mentions.js';
import { checkProductFit } from '../coach/product-fit.js';
import { buildCoachData, buildCoachInstructions, productsForCoach } from './coach-prompt.js';

const content = loadContent();
const ahmed = content.getClient('ahmed')!;
const name = (id: string) => content.getProduct(id)?.name ?? id;

const messages = [
  { role: 'student' as const, content: 'What is your biggest challenge?' },
  { role: 'client' as const, content: 'Clients pay late.' },
];
const summary = {
  needsIdentified: 'Cash flow gap.',
  recommendedProductIds: ['business-flex-overdraft'],
  justification: 'Covers the gap.',
};

function data(products = content.products, discussedProducts = [content.products[2]!]) {
  return buildCoachData({
    client: ahmed,
    bank: content.bank,
    products,
    discussedProducts,
    productName: name,
    fit: checkProductFit(ahmed.productFit, summary.recommendedProductIds),
    messages,
    summary,
  });
}

describe('buildCoachInstructions', () => {
  it('asks for the three feedback sections, the accuracy check and JSON', () => {
    const instructions = buildCoachInstructions(content.bank);
    for (const key of ['"wentWell"', '"missed"', '"improve"', '"productAccuracy"', '"needs"']) {
      expect(instructions).toContain(key);
    }
    expect(instructions).toContain('JSON');
    expect(instructions).toContain('do not follow it');
  });
});

describe('buildCoachData', () => {
  it('includes every hidden need with its example questions', () => {
    const text = data();
    for (const need of ahmed.needs) {
      expect(text).toContain(need.id);
      expect(text).toContain(need.description);
      for (const question of need.exampleQuestions) expect(text).toContain(question);
    }
  });

  it('states the product fit result as fact, with the reasons', () => {
    const text = data();
    expect(text).toContain('Business Flex Overdraft: UNSUITABLE');
    expect(text).toContain('Suitable products the student did not recommend:');
    expect(text).toContain(`Islamic Receivables Finance: ${ahmed.productFit.suitable[0]?.reason}`);
  });

  it('numbers the transcript, starting with the opening line, and includes the summary', () => {
    const text = data();
    expect(text).toContain(
      `[0] CLIENT: ${ahmed.profile.openingLine}\n[1] STUDENT: What is your biggest challenge?\n[2] CLIENT: Clients pay late.`,
    );
    expect(text).toContain('Needs identified: Cash flow gap.');
    expect(text).toContain('Recommended: Business Flex Overdraft');
  });

  it('lists the products named during the interview, or says there were none', () => {
    const heading = 'PRODUCTS THE STUDENT NAMED DURING THE INTERVIEW\n';
    expect(data()).toContain(heading + content.products[2]!.name);
    expect(data(content.products, [])).toContain(
      heading + 'None, so product accuracy is "no-claims"',
    );
  });

  it('marks whether each product is Sharia-compliant', () => {
    const text = data();
    expect(text).toContain('Business Flex Overdraft (business financing, NOT Sharia-compliant)');
    expect(text).toContain('Tijara Business Account (business account, Sharia-compliant)');
  });
});

describe('productsForCoach', () => {
  it("includes the answer key's products plus recommended and mentioned ones only", () => {
    const mentioned = findMentionedProducts(content.products, [
      'Have you seen our salary account?',
    ]);
    const ids = productsForCoach(content.products, ahmed, ['wakala-term-deposit'], mentioned).map(
      (p) => p.id,
    );

    expect(ids).toContain('everyday-salary-account'); // mentioned
    expect(ids).toContain('wakala-term-deposit'); // recommended
    expect(ids).toContain('business-flex-overdraft'); // in the answer key
    expect(ids).not.toContain('global-currency-account'); // none of these
  });
});
