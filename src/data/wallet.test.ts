/**
 * Wallet module unit tests. Validates the split between
 * `creditEarnings` (translator-job income — counts toward
 * lifetime + paycheck threshold) and `addBalance` (everything
 * else — borrows, penalties, shop spend — must NOT count).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
  vi.resetModules();
});

describe('wallet', () => {
  it('starts with the default starting balance and zero lifetime earnings', async () => {
    const { getBalance, getLifetimeEarnings } = await import('./wallet');
    // Starting balance is 200 cents = $2.00 — see STARTING_BALANCE_CENTS.
    expect(getBalance()).toBe(200);
    expect(getLifetimeEarnings()).toBe(0);
  });

  it('creditEarnings bumps both balance and lifetime', async () => {
    const { creditEarnings, getBalance, getLifetimeEarnings } = await import(
      './wallet'
    );
    const before = getBalance();
    creditEarnings(50);
    expect(getBalance()).toBe(before + 50);
    expect(getLifetimeEarnings()).toBe(50);
  });

  it('addBalance bumps only balance — must not contaminate lifetime', async () => {
    const { addBalance, getBalance, getLifetimeEarnings } = await import(
      './wallet'
    );
    const before = getBalance();
    addBalance(500); // simulating a Theo borrow
    expect(getBalance()).toBe(before + 500);
    // CRITICAL: borrowed money must NOT count toward the
    // first-paycheck threshold. If this regresses, the player can
    // close the paycheck quest by borrowing money.
    expect(getLifetimeEarnings()).toBe(0);
  });

  it('addBalance with a negative delta deducts from balance only', async () => {
    const { addBalance, creditEarnings, getBalance, getLifetimeEarnings } =
      await import('./wallet');
    creditEarnings(100);
    addBalance(-50); // simulating a wrong-answer penalty
    expect(getBalance()).toBe(200 + 100 - 50);
    expect(getLifetimeEarnings()).toBe(100);
  });
});
