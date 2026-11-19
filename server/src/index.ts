import { existsSync } from 'node:fs';
import { env } from './env.js';
import { createApp } from './app.js';
import { aiConfigFromEnv, createAi } from './ai/client.js';
import { ContentError, loadContent, type Content } from './content.js';
import { CLIENT_DIST } from './paths.js';

function loadContentOrExit(): Content {
  try {
    return loadContent();
  } catch (err) {
    if (err instanceof ContentError) {
      console.error(`\n${err.message}\n\nFix the files in the content folder and restart.\n`);
      process.exit(1);
    }
    throw err;
  }
}

const content = loadContentOrExit();
console.log(
  `Loaded ${content.clients.length} clients and ${content.products.length} products ` +
    `for ${content.bank.name}.`,
);

const withBackup = (model: string, backup: string | undefined) =>
  backup ? `${model} (backup: ${backup})` : model;
console.log(
  `AI: client uses ${withBackup(env.CLIENT_MODEL, env.CLIENT_FALLBACK_MODEL)}, ` +
    `coach uses ${withBackup(env.COACH_MODEL, env.COACH_FALLBACK_MODEL)}.`,
);

const app = createApp({ content, ai: createAi(aiConfigFromEnv(env)) });

const server = app.listen(env.PORT, () => {
  const url = `http://localhost:${env.PORT}`;
  console.log(
    existsSync(CLIENT_DIST)
      ? `Server listening on ${url}, serving the built app and the API.`
      : `API listening on ${url}. The app itself is served by Vite (npm run dev).`,
  );
});

// Graceful shutdown so in-flight requests can finish (e.g. when a container stops).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
