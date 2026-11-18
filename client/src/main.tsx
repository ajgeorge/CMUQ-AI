import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Global styles first, so each component's own CSS can override them.
import './index.css';
import { App } from './App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found in index.html');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
