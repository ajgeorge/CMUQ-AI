import { useEffect, useReducer, useRef, useState } from 'react';
import type { Bank, ChatMessage, InterviewSummary, Product, PublicClient } from '@bank-sim/shared';
import { api, errorMessage } from './api';
import { ClientSelect } from './components/ClientSelect';
import { FeedbackReport } from './components/FeedbackReport';
import { InterviewChat } from './components/InterviewChat';
import { ProductPanel } from './components/ProductPanel';
import { StepIndicator } from './components/StepIndicator';
import { SummaryForm } from './components/SummaryForm';
import { loadSession, saveSession } from './session';
import { initialState, limitReached, reducer, type Action, type AppState } from './state';
import { useMediaQuery } from './use-media-query';
import './App.css';

const APP_NAME = 'Bank Client Discovery Simulator';

/** Where the products panel moves beside the chat (the same width as in App.css). */
const WIDE_SCREEN = '(min-width: 60rem)';

interface Catalogue {
  bank: Bank;
  clients: PublicClient[];
  products: Product[];
}

/** The coach's request, while the feedback screen has no feedback to show yet. */
type CoachRequest =
  /** Nothing sent: the page was reloaded while the coach was working. */
  { status: 'idle' } | { status: 'waiting' } | { status: 'failed'; message: string };

type Loading =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Catalogue };

export function App() {
  const [loading, setLoading] = useState<Loading>({ status: 'loading' });
  const [state, dispatch] = useReducer(reducer, initialState);
  // Becomes true once the student moves between steps; from then on each new screen's
  // heading takes focus. On the first page load focus is left alone.
  const [navigated, setNavigated] = useState(false);

  // The coach's request is sent from here when the summary is submitted, rather than from
  // an effect on the feedback screen, so it goes out exactly once per submit (effects run
  // twice in development, which would use up the AI's per-minute allowance).
  const feedbackRequest = useRef<AbortController | null>(null);
  const [coach, setCoach] = useState<CoachRequest>({ status: 'idle' });

  function requestFeedback(clientId: string, messages: ChatMessage[], summary: InterviewSummary) {
    feedbackRequest.current?.abort();
    const controller = new AbortController();
    feedbackRequest.current = controller;
    setCoach({ status: 'waiting' });
    api
      .feedback({ clientId, messages, summary }, controller.signal)
      .then((feedback) => {
        dispatch({ type: 'feedbackReceived', feedback });
        setCoach({ status: 'idle' });
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setCoach({ status: 'failed', message: errorMessage(err) });
      });
  }

  function act(action: Action) {
    if (action.type !== 'updateDraft') setNavigated(true);
    if (action.type === 'start' || action.type === 'restart' || action.type === 'backToSummary') {
      feedbackRequest.current?.abort();
      setCoach({ status: 'idle' });
    }
    dispatch(action);
    if (action.type === 'submit' && state.step === 'summary') {
      requestFeedback(state.client.id, state.messages, action.summary);
    }
  }

  function getFeedback() {
    if (state.step !== 'feedback') return;
    setNavigated(true);
    requestFeedback(state.client.id, state.messages, state.summary);
  }

  // Bumped by "Try again" to load the data once more.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.clients(controller.signal), api.products(controller.signal)])
      .then(([{ clients }, { bank, products }]) => {
        // Pick up an interview from before a page reload, now that it can be checked
        // against the current clients and products.
        const saved = loadSession({ clients, products });
        if (saved) dispatch({ type: 'restore', state: saved });
        setLoading({ status: 'ready', data: { bank, clients, products } });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoading({ status: 'error', message: errorMessage(err) });
      });
    return () => controller.abort();
  }, [attempt]);

  // Saved after every change, but only once any earlier interview has been restored,
  // so the empty starting state can't overwrite it.
  const ready = loading.status === 'ready';
  useEffect(() => {
    if (ready) saveSession(state);
  }, [ready, state]);

  function retry() {
    // The "Try again" button is about to disappear: focus the heading of what loads instead.
    setNavigated(true);
    setLoading({ status: 'loading' });
    setAttempt((n) => n + 1);
  }

  const bankName = loading.status === 'ready' ? loading.data.bank.name : null;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="site-header">
        <p className="site-title">{APP_NAME}</p>
        {bankName && <p className="site-subtitle">Practise client discovery at {bankName}</p>}
      </header>
      <StepIndicator current={state.step} />
      <main id="main" className="container">
        {loading.status === 'loading' && (
          <p role="status" className="lead">
            Loading clients and products…
          </p>
        )}
        {loading.status === 'error' && (
          <div role="alert" className="alert alert--error">
            <p>Could not load the clients and products. {loading.message}</p>
            <button type="button" className="button" onClick={retry}>
              Try again
            </button>
          </div>
        )}
        {loading.status === 'ready' && (
          <Screen
            state={state}
            data={loading.data}
            dispatch={act}
            focusHeading={navigated}
            coach={coach}
            onGetFeedback={getFeedback}
          />
        )}
      </main>
    </>
  );
}

interface ScreenProps {
  state: AppState;
  data: Catalogue;
  dispatch: (action: Action) => void;
  focusHeading: boolean;
  coach: CoachRequest;
  onGetFeedback: () => void;
}

/** The current step's content, with a heading that receives focus when the step changes. */
function Screen(props: ScreenProps) {
  const { state, data, dispatch, focusHeading, coach, onGetFeedback } = props;
  const title = screenTitle(state);
  const wide = useMediaQuery(WIDE_SCREEN);
  // Keyed so each new screen gets a fresh heading that takes focus when it appears. On the
  // feedback screen that includes each change of content (waiting, failed, report ready):
  // the button just pressed disappears, so focus would otherwise drop to the top of the page.
  const screenKey =
    state.step === 'feedback' ? `feedback-${state.feedback ? 'ready' : coach.status}` : state.step;
  const heading = <Heading key={screenKey} title={title} focus={focusHeading} />;

  switch (state.step) {
    case 'select':
      return (
        <>
          {heading}
          <p className="lead">
            Each client has needs they won&apos;t mention unless you ask the right questions. Find
            out what matters to them, then recommend suitable products.
          </p>
          <ClientSelect
            clients={data.clients}
            onStart={(client) => dispatch({ type: 'start', client })}
          />
        </>
      );

    case 'interview': {
      const chat = (
        <InterviewChat
          key="chat"
          client={state.client}
          messages={state.messages}
          onExchange={(question, reply) => dispatch({ type: 'exchange', question, reply })}
          onEnd={() => dispatch({ type: 'endInterview' })}
          onLeave={() => dispatch({ type: 'restart' })}
        />
      );
      const products = <ProductPanel key="products" products={data.products} />;
      return (
        <>
          {heading}
          <p className="lead">
            {state.client.occupation} · {capitalise(state.client.difficulty)}. Ask questions to
            understand their situation. The product list has the details you can share.
          </p>
          {/* Beside the chat on wide screens, above it on narrow ones. The page order
              follows what is on screen, so the keyboard moves through it in the order
              it is seen. Keyed, so switching layout moves them rather than resetting them. */}
          <div className="interview-layout">{wide ? [chat, products] : [products, chat]}</div>
        </>
      );
    }

    case 'summary':
      return (
        <>
          {heading}
          <p className="lead">
            Write up what you found and what you would recommend to{' '}
            {state.client.name.split(' ')[0]}. The coach compares this with the interview.
          </p>
          <SummaryForm
            client={state.client}
            products={data.products}
            messages={state.messages}
            draft={state.draft}
            canGoBack={!limitReached(state.messages)}
            onChange={(changes) => dispatch({ type: 'updateDraft', changes })}
            onBack={() => dispatch({ type: 'backToInterview' })}
            onSubmit={(summary) => dispatch({ type: 'submit', summary })}
          />
        </>
      );

    case 'feedback': {
      const waiting = !state.feedback && coach.status === 'waiting';
      return (
        <>
          {heading}
          {/* Stays on the page for the whole step, so screen readers reliably announce
              each change, including when the report arrives. */}
          <p role="status" className={waiting ? 'lead' : 'visually-hidden'}>
            {waiting
              ? 'The coach is reviewing your interview. This usually takes a few seconds…'
              : state.feedback
                ? 'Your feedback is ready.'
                : ''}
          </p>
          {state.feedback ? (
            <FeedbackReport
              client={state.client}
              products={data.products}
              messages={state.messages}
              summary={state.summary}
              feedback={state.feedback}
              onRestart={() => dispatch({ type: 'restart' })}
              onRetryClient={() => dispatch({ type: 'start', client: state.client })}
            />
          ) : waiting ? null : (
            <div
              role={coach.status === 'failed' ? 'alert' : undefined}
              className={`alert ${coach.status === 'failed' ? 'alert--error' : 'alert--info'}`}
            >
              <p>
                {coach.status === 'failed'
                  ? `The coach could not review your interview. ${coach.message}`
                  : 'Your interview and summary are saved, but the page was reloaded before the coach replied.'}
              </p>
              <div className="button-row">
                <button type="button" className="button" onClick={onGetFeedback}>
                  {coach.status === 'failed' ? 'Try again' : 'Get feedback'}
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => dispatch({ type: 'backToSummary' })}
                >
                  Back to your summary
                </button>
              </div>
            </div>
          )}
        </>
      );
    }
  }
}

/**
 * The page's main heading. When a new step appears it receives focus, so keyboard and
 * screen reader users start at the top of the new screen; the browser tab title follows.
 */
function Heading({ title, focus }: { title: string; focus: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = `${title} – ${APP_NAME}`;
  }, [title]);

  useEffect(() => {
    if (!focus) return;
    ref.current?.focus();
    window.scrollTo({ top: 0 });
  }, [focus]);

  return (
    <h1 ref={ref} tabIndex={-1}>
      {title}
    </h1>
  );
}

function screenTitle(state: AppState): string {
  switch (state.step) {
    case 'select':
      return 'Choose a client to interview';
    case 'interview':
      return `Interview with ${state.client.name}`;
    case 'summary':
      return 'Your summary and recommendations';
    case 'feedback':
      return `Feedback on your interview with ${state.client.name}`;
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
