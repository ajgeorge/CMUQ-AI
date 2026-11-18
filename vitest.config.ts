import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve @bank-sim/shared to its TypeScript source, so tests don't need a build first.
  resolve: { conditions: ['development'] },
  ssr: { resolve: { conditions: ['development'] } },
  test: {
    include: ['{server,shared,client}/src/**/*.test.{ts,tsx}'],
  },
});
