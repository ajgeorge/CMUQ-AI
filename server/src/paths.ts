import path from 'node:path';

/** Repository root (works from both `src/` in dev and `dist/` in production). */
export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Built React app, served by Express in production. */
export const CLIENT_DIST = path.join(REPO_ROOT, 'client', 'dist');
