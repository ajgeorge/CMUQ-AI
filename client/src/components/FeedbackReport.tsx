import { useId, type ReactNode } from 'react';
import type {
  ChatMessage,
  FeedbackResponse,
  InterviewSummary,
  NeedFeedback,
  Product,
  PublicClient,
} from '@bank-sim/shared';
import { downloadMarkdown } from '../export';
import {
  ACCURACY,
  FIT,
  NEED_STATUS,
  firstNameOf,
  needsFoundLine,
  notRelevantReason,
  type Label,
} from '../feedback-labels';
import { Transcript } from './Transcript';
import './FeedbackReport.css';

interface Props {
  client: PublicClient;
  products: Product[];
  messages: ChatMessage[];
  summary: InterviewSummary;
  feedback: FeedbackResponse;
  onRestart: () => void;
  onRetryClient: () => void;
}

export function FeedbackReport(props: Props) {
  const { client, products, messages, summary, feedback, onRestart, onRetryClient } = props;
  const firstName = firstNameOf(client.name);
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="feedback">
      <p className="lead">
        {needsFoundLine(feedback, firstName)} Here is what the coach noticed, followed by everything{' '}
        {firstName} was waiting to be asked about.
      </p>

      <Section title="What went well" className="feedback__part feedback__part--good">
        <ul>
          {feedback.wentWell.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ul>
      </Section>

      <Section title="What was missed" className="feedback__part feedback__part--bad">
        {feedback.missed.length > 0 ? (
          <ul>
            {feedback.missed.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        ) : (
          <p>Nothing important was missed.</p>
        )}
      </Section>

      <Section title="How to improve" className="feedback__part">
        <ul>
          {feedback.improve.map(({ advice, exampleQuestion }, i) => (
            <li key={i}>
              {advice}
              {exampleQuestion && (
                <span className="feedback__example">
                  Try asking: <q>{exampleQuestion}</q>
                </span>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`What ${firstName} needed`}>
        <ul className="feedback__needs">
          {feedback.needs.map((need) => (
            <Need key={need.id} need={need} />
          ))}
        </ul>
      </Section>

      <Section title="Your recommendations">
        <ul className="feedback__fit">
          {feedback.productFit.recommended.map(({ productId, rating, reason }) => (
            <li key={productId}>
              <span className="feedback__fit-name">{productName(productId)}</span>{' '}
              <Badge {...FIT[rating]} />
              <p>{reason ?? notRelevantReason(firstName)}</p>
            </li>
          ))}
        </ul>
        {feedback.productFit.missedSuitable.length > 0 && (
          <>
            <h3>Suitable products you didn&apos;t recommend</h3>
            <ul className="feedback__fit">
              {feedback.productFit.missedSuitable.map(({ productId, reason }) => (
                <li key={productId}>
                  <span className="feedback__fit-name">{productName(productId)}</span>
                  <p>{reason}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="Accuracy of product information">
        <p>
          <Badge {...ACCURACY[feedback.productAccuracy.status]} />
        </p>
        <p>{feedback.productAccuracy.comment}</p>
      </Section>

      <Transcript client={client} messages={messages} label="Show your interview and summary">
        <dl className="feedback__summary">
          <dt>Needs you identified</dt>
          <dd>{summary.needsIdentified}</dd>
          <dt>Products you recommended</dt>
          <dd>{summary.recommendedProductIds.map(productName).join(', ')}</dd>
          <dt>Your justification</dt>
          <dd>{summary.justification}</dd>
        </dl>
      </Transcript>

      <div className="button-row">
        <button type="button" className="button" onClick={onRestart}>
          Interview another client
        </button>
        <button type="button" className="button button--secondary" onClick={onRetryClient}>
          Try {firstName} again
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={() =>
            downloadMarkdown({ client, products, messages, summary, feedback, date: new Date() })
          }
        >
          Download as Markdown
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`feedback__section ${className ?? ''}`}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

function Need({ need }: { need: NeedFeedback }) {
  return (
    <li className="feedback__need">
      <div className="feedback__need-header">
        <h3>{need.title}</h3>
        <Badge {...NEED_STATUS[need.status]} />
        {need.importance === 'critical' && <span className="badge">Critical need</span>}
      </div>
      <p>{need.description}</p>
      {need.evidence && (
        <p className="feedback__evidence">
          You asked: <q>{need.evidence}</q>
        </p>
      )}
      <p className="feedback__comment">{need.comment}</p>
    </li>
  );
}

function Badge({ label, symbol, tone }: Label) {
  return (
    <span className={`badge feedback__badge feedback__badge--${tone}`}>
      <span aria-hidden="true">{symbol}</span> {label}
    </span>
  );
}
