import { useId, type ReactNode } from 'react';
import { CHAT_LIMITS, type Difficulty } from '@bank-sim/shared';
import { DIFFICULTY } from '../difficulty';
import { DifficultyBadge } from './Difficulty';
import './Guide.css';

const STEPS: { name: string; what: string }[] = [
  {
    name: 'Choose a client',
    what: 'Each client has a different background, banking needs and difficulty level.',
  },
  {
    name: 'Interview',
    what: 'Ask questions to understand their situation. They only reveal what matters to them when you ask the right things.',
  },
  {
    name: 'Summary',
    what: 'Write down the needs you found and choose the products you would recommend, with your reasons.',
  },
  {
    name: 'Feedback',
    what: 'An AI coach reviews the interview: what went well, what you missed and how to improve.',
  },
];

const LEVELS: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

/** Each stage's buttons and what they do. */
const BUTTONS: { stage: string; buttons: { name: string; what: string }[] }[] = [
  {
    stage: 'Choosing a client',
    buttons: [{ name: 'Interview [name]', what: 'Starts an interview with that client.' }],
  },
  {
    stage: 'The interview',
    buttons: [
      {
        name: 'Send',
        what: 'Sends your question. Enter also sends; Shift+Enter starts a new line.',
      },
      {
        name: 'End interview',
        what: `Moves on to your summary. Available once you have asked at least ${CHAT_LIMITS.minStudentTurns} questions.`,
      },
      {
        name: 'Choose a different client',
        what: 'Leaves this interview and goes back to the client list. The conversation is lost.',
      },
      {
        name: 'Products',
        what: 'The bank’s products, with their features, limitations and fees. Select one to see its details. On a phone, use “Show products”.',
      },
    ],
  },
  {
    stage: 'Your summary',
    buttons: [
      {
        name: 'Show the interview transcript',
        what: 'Opens the conversation so you can check it.',
      },
      { name: 'Product checkboxes', what: 'Tick the products you would recommend.' },
      { name: 'Submit for feedback', what: 'Sends your interview and summary to the coach.' },
      { name: 'Back to the interview', what: 'Returns to the conversation to ask more questions.' },
    ],
  },
  {
    stage: 'Feedback',
    buttons: [
      {
        name: 'Download as Markdown',
        what: 'Saves the interview, your summary and the feedback as a file.',
      },
      { name: 'Try [name] again', what: 'Starts a fresh interview with the same client.' },
      { name: 'Interview another client', what: 'Goes back to the client list.' },
      {
        name: 'Try again / Back to your summary',
        what: 'Shown only if the coach could not review your interview.',
      },
    ],
  },
];

export function Guide({ onStart }: { onStart: () => void }) {
  const start = (
    <button type="button" className="button" onClick={onStart}>
      Start practising
    </button>
  );

  return (
    <div className="guide">
      <p className="lead">
        Practise the first conversation with a bank client. You interview a client played by AI, who
        has needs they won&apos;t mention unless you ask the right questions. Then you recommend
        products, and an AI coach gives you feedback on how you did.
      </p>
      <div className="guide__start">{start}</div>

      <GuideSection title="The four steps">
        <ol className="guide__steps guide__grid">
          {STEPS.map((step, i) => (
            <li key={step.name} className="guide__card">
              <span className="guide__number" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{step.name}</h3>
              <p>{step.what}</p>
            </li>
          ))}
        </ol>
      </GuideSection>

      <GuideSection title="Difficulty levels">
        <ul className="guide__grid">
          {LEVELS.map((level) => (
            <li key={level} className="guide__card">
              <DifficultyBadge level={level} />
              <p>{DIFFICULTY[level].description}</p>
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection title="What the buttons do">
        <div className="guide__grid guide__grid--wide">
          {BUTTONS.map(({ stage, buttons }) => (
            <div key={stage} className="guide__card">
              <h3>{stage}</h3>
              <dl>
                {buttons.map(({ name, what }) => (
                  <div key={name} className="guide__button">
                    <dt>{name}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </GuideSection>

      <GuideSection title="Good to know">
        <ul className="guide__grid">
          <li className="guide__card">
            You can ask up to {CHAT_LIMITS.maxStudentTurns} questions, each up to{' '}
            {CHAT_LIMITS.maxStudentMessageChars} characters.
          </li>
          <li className="guide__card">
            Your interview is kept if you refresh the page, but not once you close the tab. Download
            the feedback to keep it.
          </li>
          <li className="guide__card">
            The client and the coach are AI. Whether a product you recommend suits the client comes
            from the bank&apos;s own rules, not from the AI; the coach&apos;s comments are its
            judgement, to learn from.
          </li>
        </ul>
      </GuideSection>

      <div className="guide__start">{start}</div>
    </div>
  );
}

function GuideSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="guide__section">
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}
