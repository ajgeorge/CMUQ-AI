import type {
  ChatMessage,
  FeedbackResponse,
  InterviewSummary,
  Product,
  PublicClient,
} from '@bank-sim/shared';
import {
  ACCURACY,
  FIT,
  NEED_STATUS,
  firstNameOf,
  needsFoundLine,
  notRelevantReason,
  type Label,
} from './feedback-labels';

/*
 * The finished interview as a Markdown file the student can keep: the transcript,
 * their summary and the coach's feedback, in the same words as the feedback page.
 */

export interface InterviewRecord {
  client: PublicClient;
  products: Product[];
  messages: ChatMessage[];
  summary: InterviewSummary;
  feedback: FeedbackResponse;
  date: Date;
}

export function toMarkdown(record: InterviewRecord): string {
  const { client, products, messages, summary, feedback, date } = record;
  const firstName = firstNameOf(client.name);
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const badge = ({ symbol, label }: Label) => `${symbol} ${label}`;

  const lines: string[] = [
    `# Interview with ${client.name}`,
    '',
    `${client.age}, ${client.occupation}, ${client.location}. Difficulty: ${client.difficulty}.`,
    '',
    `Bank Client Discovery Simulator, ${longDate(date)}`,
    '',
    '## Interview',
    '',
    `**${firstName}:** ${inline(client.openingLine)}`,
  ];
  for (const m of messages) {
    lines.push('', `**${m.role === 'client' ? firstName : 'Student'}:** ${inline(m.content)}`);
  }

  lines.push(
    '',
    "## Student's summary",
    '',
    '### Needs identified',
    '',
    block(summary.needsIdentified),
    '',
    '### Recommended products',
    '',
    ...summary.recommendedProductIds.map((id) => `- ${productName(id)}`),
    '',
    '### Justification',
    '',
    block(summary.justification),
    '',
    '## Coach feedback',
    '',
    needsFoundLine(feedback, firstName),
    '',
    '### What went well',
    '',
    ...feedback.wentWell.map((point) => `- ${inline(point)}`),
    '',
    '### What was missed',
    '',
    ...(feedback.missed.length > 0
      ? feedback.missed.map((point) => `- ${inline(point)}`)
      : ['Nothing important was missed.']),
    '',
    '### How to improve',
    '',
    ...feedback.improve.map(
      ({ advice, exampleQuestion }) =>
        `- ${inline(advice)}` +
        (exampleQuestion ? `  \n  Try asking: "${inline(exampleQuestion)}"` : ''),
    ),
    '',
    `### What ${firstName} needed`,
  );

  for (const need of feedback.needs) {
    const critical = need.importance === 'critical' ? ' (critical need)' : '';
    lines.push('', `#### ${need.title}: ${badge(NEED_STATUS[need.status])}${critical}`, '');
    lines.push(inline(need.description));
    if (need.evidence) lines.push('', `You asked: "${inline(need.evidence)}"`);
    lines.push('', inline(need.comment));
  }

  lines.push('', '### Recommendations', '');
  for (const { productId, rating, reason } of feedback.productFit.recommended) {
    lines.push(
      `- **${productName(productId)}** (${badge(FIT[rating])}): ${inline(reason ?? notRelevantReason(firstName))}`,
    );
  }
  if (feedback.productFit.missedSuitable.length > 0) {
    lines.push('', "Suitable products the student didn't recommend:", '');
    for (const { productId, reason } of feedback.productFit.missedSuitable) {
      lines.push(`- **${productName(productId)}**: ${inline(reason)}`);
    }
  }

  lines.push(
    '',
    '### Accuracy of product information',
    '',
    `${badge(ACCURACY[feedback.productAccuracy.status])}. ${inline(feedback.productAccuracy.comment)}`,
    '',
  );
  return lines.join('\n');
}

/** For example interview-ahmed-2026-11-19.md, using the student's local date. */
export function fileName(client: PublicClient, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `interview-${client.id}-${day}.md`;
}

/** Saves the interview to the student's downloads. */
export function downloadMarkdown(record: InterviewRecord): void {
  const url = URL.createObjectURL(
    new Blob([toMarkdown(record)], { type: 'text/markdown;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(record.client, record.date);
  link.click();
  // Give the browser a moment to start the download before the file is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function longDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Text on one line or list item: keeps the student's line breaks as Markdown breaks. */
function inline(text: string): string {
  return text.trim().replace(/\s*\n\s*/g, '  \n');
}

/** A paragraph of the student's own writing, keeping blank lines between paragraphs. */
function block(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map(inline)
    .join('\n\n');
}
