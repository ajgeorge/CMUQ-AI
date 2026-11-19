import type { Step } from '../state';
import './StepIndicator.css';

const STEPS: { label: string; steps: Step[] }[] = [
  { label: 'Choose a client', steps: ['select'] },
  { label: 'Interview', steps: ['interview'] },
  { label: 'Summary', steps: ['summary'] },
  { label: 'Feedback', steps: ['feedback'] },
];

export function StepIndicator({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.steps.includes(current));

  return (
    <nav aria-label="Progress" className="steps">
      <ol className="steps__list">
        {STEPS.map((step, i) => {
          const status = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
          return (
            <li
              key={step.label}
              className={`steps__item steps__item--${status}`}
              aria-current={status === 'current' ? 'step' : undefined}
            >
              <span className="steps__number" aria-hidden="true">
                {status === 'done' ? '✓' : i + 1}
              </span>
              <span>
                {step.label}
                {status === 'done' && <span className="visually-hidden"> (completed)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
