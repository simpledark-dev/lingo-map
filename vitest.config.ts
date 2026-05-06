import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vitest config — kept as small as possible. The project already
 * uses Next.js + Pixi for the runtime; this exists purely to give
 * Vitest enough JSX + path-alias support to test the dialogue
 * builders, quest helpers, and the DialogueOverlay component.
 *
 * Tests live alongside source files as `*.test.ts(x)`. The
 * `environmentMatchGlobs` split lets pure logic run in node (fast)
 * while only the DialogueOverlay test pays for jsdom.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    environment: 'node',
    environmentMatchGlobs: [
      ['src/ui/**/*.test.tsx', 'jsdom'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
