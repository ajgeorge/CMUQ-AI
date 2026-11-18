import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/dist', '**/node_modules', '**/coverage']),

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // Node: server, shared, tooling config files
  {
    files: ['server/**/*.ts', 'shared/**/*.ts', '*.{js,ts}', 'client/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // Browser: React client
  {
    files: ['client/src/**/*.{ts,tsx}'],
    extends: [
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
      // Strict accessibility rules — part of meeting WCAG 2.1 AA.
      jsxA11y.flatConfigs.strict,
    ],
    languageOptions: { globals: globals.browser },
  },
]);
