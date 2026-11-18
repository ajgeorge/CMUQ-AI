import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import type { HealthResponse } from '@bank-sim/shared';
import type { Content } from './content.js';
import { sendError } from './http.js';
import { CLIENT_DIST, REPO_ROOT } from './paths.js';
import { contentRouter } from './routes/content.js';

function readVersion(): string {
  const pkgPath = path.join(REPO_ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}

export function createApp(content: Content): express.Express {
  const app = express();
  const version = readVersion();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // --- API routes ---
  const api = express.Router();

  api.get('/health', (_req: Request, res: Response<HealthResponse>) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()), version });
  });

  api.use(contentRouter(content));

  // Unknown API route → JSON 404 (never fall through to the SPA).
  api.use((req, res) => {
    sendError(res, 404, 'NOT_FOUND', `No API route for ${req.method} ${req.originalUrl}`);
  });

  app.use('/api', api);

  // --- Built React app (production only; in dev, Vite serves the client) ---
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  // --- Error handler: never leak stack traces to the browser ---
  const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
    if (err instanceof SyntaxError && 'body' in err) {
      sendError(res, 400, 'BAD_REQUEST', 'Request body is not valid JSON.');
      return;
    }
    console.error(err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong on the server.');
  };
  app.use(errorHandler);

  return app;
}
