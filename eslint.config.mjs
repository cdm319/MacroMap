import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    settings: {
      next: {
        rootDir: 'apps/web/',
      },
    },
  },
  globalIgnores([
    '**/.next/**',
    '**/out/**',
    '**/dist/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'cdk.out/**',
  ]),
]);
