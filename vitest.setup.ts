/**
 * Test bootstrap. Two responsibilities:
 *   1. Wire @testing-library/jest-dom matchers into Vitest's
 *      `expect` so component tests can use `toBeInTheDocument`,
 *      `toHaveTextContent`, etc.
 *   2. Reset localStorage between tests — most of the data layer
 *      (wallet/inventory/energy/debt/profile/flags/quests) reads
 *      and writes localStorage with module-level caches. Without a
 *      reset, test order would leak state.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';

// jsdom provides localStorage; node does not. Guard so pure tests
// (running in node) don't trip on a missing global.
beforeEach(() => {
  if (typeof globalThis.localStorage === 'undefined') return;
  globalThis.localStorage.clear();
});

afterEach(() => {
  if (typeof globalThis.localStorage === 'undefined') return;
  globalThis.localStorage.clear();
});
