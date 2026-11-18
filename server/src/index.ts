import { env } from './env.js';
import { createApp } from './app.js';

const app = createApp();

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
