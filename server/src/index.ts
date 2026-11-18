import { env } from './env.js';
import { createApp } from './app.js';
import { ContentError, loadContent, type Content } from './content.js';

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

const app = createApp(content);

const server = app.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Graceful shutdown so in-flight requests can finish (e.g. when a container stops).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
