/**
 * Quest module unit tests. Each case resets modules so the
 * status map + completion-order cache start clean.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
  vi.resetModules();
});

describe('arePrereqsMet', () => {
  it('returns true for quests with no prereqs', async () => {
    const { arePrereqsMet, QUESTS } = await import('./quests');
    expect(
      arePrereqsMet(QUESTS['intro-translator-job'].requiresCompleted, {}),
    ).toBe(true);
  });

  it('returns false when a prereq is not yet completed', async () => {
    const { arePrereqsMet, QUESTS } = await import('./quests');
    expect(
      arePrereqsMet(QUESTS['first-paycheck'].requiresCompleted, {
        'intro-translator-job': 'active',
      }),
    ).toBe(false);
  });

  it('returns true when all prereqs are completed', async () => {
    const { arePrereqsMet, QUESTS } = await import('./quests');
    expect(
      arePrereqsMet(QUESTS['first-paycheck'].requiresCompleted, {
        'intro-translator-job': 'completed',
      }),
    ).toBe(true);
  });
});

describe('isAvailable', () => {
  it('returns false when prereqs are not met', async () => {
    const { isAvailable, QUESTS } = await import('./quests');
    expect(isAvailable(QUESTS['child-sandwich'], {})).toBe(false);
  });

  it('returns false when the quest is already active', async () => {
    const { isAvailable, QUESTS } = await import('./quests');
    expect(
      isAvailable(QUESTS['intro-translator-job'], {
        'intro-translator-job': 'active',
      }),
    ).toBe(false);
  });

  it('returns true when prereqs are met and quest has not yet started', async () => {
    const { isAvailable, QUESTS } = await import('./quests');
    expect(
      isAvailable(QUESTS['first-paycheck'], {
        'intro-translator-job': 'completed',
      }),
    ).toBe(true);
  });
});

describe('completeQuest + getCompletionOrder', () => {
  it('appends each completion to the order list', async () => {
    const { startQuest, completeQuest, getCompletionOrder } = await import(
      './quests'
    );
    startQuest('intro-translator-job');
    completeQuest('intro-translator-job');
    startQuest('first-paycheck');
    completeQuest('first-paycheck');
    expect(getCompletionOrder()).toEqual([
      'intro-translator-job',
      'first-paycheck',
    ]);
  });

  it('is idempotent — completing the same quest twice does not duplicate the order entry', async () => {
    const { startQuest, completeQuest, getCompletionOrder } = await import(
      './quests'
    );
    startQuest('intro-translator-job');
    completeQuest('intro-translator-job');
    completeQuest('intro-translator-job');
    expect(getCompletionOrder()).toEqual(['intro-translator-job']);
  });
});

describe('subscribeQuestTransitions', () => {
  it('fires `started` and `completed` events as the quest progresses', async () => {
    const { startQuest, completeQuest, subscribeQuestTransitions } =
      await import('./quests');
    const events: Array<{ id: string; kind: string }> = [];
    const unsub = subscribeQuestTransitions((e) => {
      events.push({ id: e.def.id, kind: e.kind });
    });
    startQuest('intro-translator-job');
    completeQuest('intro-translator-job');
    unsub();
    expect(events).toEqual([
      { id: 'intro-translator-job', kind: 'started' },
      { id: 'intro-translator-job', kind: 'completed' },
    ]);
  });

  it('does not refire on repeat startQuest calls', async () => {
    const { startQuest, subscribeQuestTransitions } = await import('./quests');
    const events: string[] = [];
    subscribeQuestTransitions((e) => events.push(e.kind));
    startQuest('intro-translator-job');
    startQuest('intro-translator-job');
    startQuest('intro-translator-job');
    expect(events).toEqual(['started']);
  });
});

describe('getObjective', () => {
  it('returns the static objective when no computeObjective is defined', async () => {
    const { getObjective, QUESTS } = await import('./quests');
    expect(getObjective(QUESTS['first-paycheck'])).toBe(
      QUESTS['first-paycheck'].objective,
    );
  });

  it('first-paycheck objective references the threshold dollar amount', async () => {
    const { getObjective, QUESTS } = await import('./quests');
    // Locks in: copy must mention $1.00 so the player knows the
    // target. If we change the threshold constant, we should
    // notice this test fail and update the copy together.
    expect(getObjective(QUESTS['first-paycheck'])).toMatch(/\$1\.00/);
  });
});
