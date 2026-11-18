import { useEffect, useReducer, useRef, useState } from 'react';
import type { Bank, Product, PublicClient } from '@bank-sim/shared';
import { api, errorMessage } from './api';
import { ClientSelect } from './components/ClientSelect';
import { InterviewChat } from './components/InterviewChat';
import { ProductPanel } from './components/ProductPanel';
import { StepIndicator } from './components/StepIndicator';
import { SummaryForm } from './components/SummaryForm';
import { initialState, limitReached, reducer, type Action, type AppState } from './state';
import './App.css';

const APP_NAME = 'Bank Client Discovery Simulator';

interface Catalogue {
  bank: Bank;
  clients: PublicClient[];
  products: Product[];
}

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

  function act(action: Action) {
    if (action.type !== 'updateDraft') setNavigated(true);
    dispatch(action);
  }

  // Bumped by "Try again" to load the data once more.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.clients(controller.signal), api.products(controller.signal)])
      .then(([{ clients }, { bank, products }]) =>
        setLoading({ status: 'ready', data: { bank, clients, products } }),
      )
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoading({ status: 'error', message: errorMessage(err) });
      });
    return () => controller.abort();
  }, [attempt]);

  function retry() {
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
          <Screen state={state} data={loading.data} dispatch={act} focusHeading={navigated} />
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
}

/** The current step's content, with a heading that receives focus when the step changes. */
function Screen({ state, data, dispatch, focusHeading }: ScreenProps) {
  const title = screenTitle(state);
  // Keyed by step so each screen gets a fresh heading that takes focus when it appears.
  const heading = <Heading key={state.step} title={title} focus={focusHeading} />;

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

    case 'interview':
      return (
        <>
          {heading}
          <p className="lead">
            {state.client.occupation} · {capitalise(state.client.difficulty)}. Ask questions to
            understand their situation. The product list has the details you can share.
          </p>
          <div className="interview-layout">
            <InterviewChat
              client={state.client}
              messages={state.messages}
              onExchange={(question, reply) => dispatch({ type: 'exchange', question, reply })}
              onEnd={() => dispatch({ type: 'endInterview' })}
              onLeave={() => dispatch({ type: 'restart' })}
            />
            <ProductPanel products={data.products} />
          </div>
        </>
      );

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

    case 'submitted':
      // Replaced by the coach's feedback in the next phase.
      return (
        <>
          {heading}
          <p className="lead">
            Coach feedback will appear here once the AI coach is added. Your summary recommended:{' '}
            {state.summary.recommendedProductIds
              .map((id) => data.products.find((p) => p.id === id)?.name ?? id)
              .join(', ')}
            .
          </p>
          <button type="button" className="button" onClick={() => dispatch({ type: 'restart' })}>
            Interview another client
          </button>
        </>
      );
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
    case 'submitted':
      return 'Summary submitted';
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
