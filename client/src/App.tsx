import { useEffect, useState } from 'react';
import type { HealthResponse } from '@bank-sim/shared';
import { api, ApiRequestError } from './api';

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; data: HealthResponse }
  | { status: 'error'; message: string };

/**
 * Placeholder shell for Phase 0 — confirms the client can reach the API.
 * Replaced by the Select → Interview → Summary → Feedback flow in Phase 4.
 */
export function App() {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    api
      .health(controller.signal)
      .then((data) => setHealth({ status: 'ok', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof ApiRequestError ? err.message : 'Unexpected error.';
        setHealth({ status: 'error', message });
      });
    return () => controller.abort();
  }, []);

  return (
    <>
      <header className="site-header">
        <p className="site-title">Bank Client Discovery Simulator</p>
      </header>
      <main id="main" className="container">
        <h1>Setup check</h1>
        <p role="status" aria-live="polite">
          {health.status === 'loading' && 'Connecting to the server…'}
          {health.status === 'ok' &&
            `Server is running (version ${health.data.version}, up ${health.data.uptimeSeconds}s).`}
          {health.status === 'error' && `Server unavailable: ${health.message}`}
        </p>
      </main>
    </>
  );
}
