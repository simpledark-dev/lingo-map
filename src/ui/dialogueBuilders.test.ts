/**
 * Pure tests for the dialogue builders. Each test resets modules
 * + localStorage so module-level caches in the data layer don't
 * leak across cases. Imports are dynamic for the same reason —
 * static imports would resolve before resetModules took effect.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DialogueState } from '../core/types';

const stub: DialogueState = {
  npcId: 'test-npc',
  npcName: 'NPC',
  lines: ['stub'],
  currentLine: 0,
};

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
  vi.resetModules();
});

describe('buildLenderDialogue', () => {
  it('shows borrow + maybe-later when debt is zero', async () => {
    const { buildLenderDialogue } = await import('./dialogueBuilders');
    const result = buildLenderDialogue(stub);
    const ids = result.options?.map((o) => o.id);
    expect(ids).toEqual(['lender-borrow', 'lender-repay', 'lender-leave']);
    expect(result.options?.[0].disabled).toBeFalsy();
    expect(result.options?.[1].disabled).toBe(true); // can't repay 0
    expect(result.lines[0]).toMatch(/Need a hand/);
  });

  it('disables repay when debt > 0 but balance is empty', async () => {
    const { buildLenderDialogue } = await import('./dialogueBuilders');
    const { borrowFromTheo } = await import('../data/debt');
    const { addBalance, getBalance } = await import('../data/wallet');
    borrowFromTheo();
    addBalance(-getBalance()); // drain wallet to 0
    const result = buildLenderDialogue(stub);
    expect(result.options?.[1].id).toBe('lender-repay');
    expect(result.options?.[1].disabled).toBe(true);
    expect(result.lines[0]).toMatch(/You owe me/);
  });

  it('enables repay when debt > 0 and balance > 0', async () => {
    const { buildLenderDialogue } = await import('./dialogueBuilders');
    const { borrowFromTheo } = await import('../data/debt');
    borrowFromTheo();
    const result = buildLenderDialogue(stub);
    expect(result.options?.[1].disabled).toBe(false);
  });

  it('disables borrow when debt is at the cap', async () => {
    const { buildLenderDialogue } = await import('./dialogueBuilders');
    const { borrowFromTheo, MAX_DEBT_CENTS, BORROW_INCREMENT_CENTS } =
      await import('../data/debt');
    const loops = Math.ceil(MAX_DEBT_CENTS / BORROW_INCREMENT_CENTS);
    for (let i = 0; i < loops; i++) borrowFromTheo();
    const result = buildLenderDialogue(stub);
    expect(result.options?.[0].id).toBe('lender-borrow');
    expect(result.options?.[0].disabled).toBe(true);
    expect(result.options?.[0].hint).toMatch(/maxed out/);
  });
});

describe('buildCeoIntroDialogue', () => {
  it('returns Stage 1 greeting + apply/decline when intro quest is active', async () => {
    const { buildCeoIntroDialogue } = await import('./dialogueBuilders');
    const { startQuest } = await import('../data/quests');
    startQuest('intro-translator-job');
    const result = buildCeoIntroDialogue(stub);
    expect(result.dialogueKind).toBe('ceo-intro');
    expect(result.lines[0]).toMatch(/Welcome, stranger/);
    // Critical: CEO must NOT use the player's name on first contact.
    expect(result.lines[0]).not.toMatch(/dad/);
    expect(result.options?.map((o) => o.id)).toEqual([
      'ceo-apply',
      'ceo-decline-apply',
    ]);
  });

  it('returns paycheck progress check-in when active and earnings < threshold', async () => {
    const { buildCeoIntroDialogue } = await import('./dialogueBuilders');
    const { startQuest, completeQuest } = await import('../data/quests');
    completeQuest('intro-translator-job');
    startQuest('first-paycheck');
    const result = buildCeoIntroDialogue(stub);
    expect(result.options).toBeUndefined();
    expect(result.lines.length).toBe(2);
    expect(result.lines[0]).toMatch(/Translating going alright/);
    expect(result.lines[1]).toMatch(/bonus waiting/);
  });

  it('returns claim dialogue with options when earnings >= threshold', async () => {
    const { buildCeoIntroDialogue } = await import('./dialogueBuilders');
    const { startQuest, completeQuest, FIRST_PAYCHECK_THRESHOLD_CENTS } =
      await import('../data/quests');
    const { creditEarnings } = await import('../data/wallet');
    completeQuest('intro-translator-job');
    startQuest('first-paycheck');
    creditEarnings(FIRST_PAYCHECK_THRESHOLD_CENTS);
    const result = buildCeoIntroDialogue(stub);
    expect(result.lines.length).toBe(2);
    expect(result.lines[0]).toMatch(/Word is you've cleared/);
    expect(result.options?.map((o) => o.id)).toEqual([
      'ceo-paycheck-claim',
      'ceo-paycheck-decline',
    ]);
    // Claim button is the FIRST option — guards against ordering
    // regressions that would change the keyboard-default action.
    expect(result.options?.[0].id).toBe('ceo-paycheck-claim');
  });

  it('falls back to engine stub when no relevant quest is active', async () => {
    const { buildCeoIntroDialogue } = await import('./dialogueBuilders');
    const result = buildCeoIntroDialogue(stub);
    // Untouched — same lines, no options.
    expect(result.lines).toEqual(stub.lines);
    expect(result.options).toBeUndefined();
  });
});

describe('buildChildSandwichDialogue', () => {
  it('uses the player-typed child name in place of the engine npcName', async () => {
    const { buildChildSandwichDialogue } = await import('./dialogueBuilders');
    const { setProfile } = await import('../data/profile');
    setProfile('Khoa', 'Pip');
    const result = buildChildSandwichDialogue({ ...stub, npcName: 'Mim' });
    expect(result.npcName).toBe('Pip');
  });

  it('returns the "good luck" line while intro quest is still active', async () => {
    const { buildChildSandwichDialogue } = await import('./dialogueBuilders');
    const { startQuest } = await import('../data/quests');
    startQuest('intro-translator-job');
    const result = buildChildSandwichDialogue(stub);
    expect(result.lines[0]).toMatch(/Good luck/);
    expect(result.options).toBeUndefined();
  });

  it('shows the give-sandwich option when sandwich quest is active and asked-flag is set', async () => {
    const { buildChildSandwichDialogue } = await import('./dialogueBuilders');
    const { startQuest, completeQuest } = await import('../data/quests');
    const { setFlag, FLAGS } = await import('../data/eventFlags');
    completeQuest('intro-translator-job');
    completeQuest('first-paycheck');
    startQuest('child-sandwich');
    setFlag(FLAGS.CHILD_ASKED_FOR_SANDWICH);
    const result = buildChildSandwichDialogue(stub);
    expect(result.options?.map((o) => o.id)).toEqual([
      'child-give-sandwich',
      'child-decline',
    ]);
  });

  it('returns the thank-you line when sandwich quest is completed', async () => {
    const { buildChildSandwichDialogue } = await import('./dialogueBuilders');
    const { completeQuest } = await import('../data/quests');
    completeQuest('intro-translator-job');
    completeQuest('first-paycheck');
    completeQuest('child-sandwich');
    const result = buildChildSandwichDialogue(stub);
    expect(result.lines[0]).toMatch(/Thanks for the sandwich/);
    expect(result.options).toBeUndefined();
  });
});

describe('APARTMENT_DIALOGUE script', () => {
  it('alternates speakers in the expected sequence', async () => {
    const { APARTMENT_DIALOGUE } = await import('./dialogueBuilders');
    const speakers = APARTMENT_DIALOGUE.map((s) => s.speaker);
    // First few lines are parent, then a child interjection, etc.
    // Exact sequence is part of the narrative beat — locking it
    // means a copy-paste reorder would surface in tests.
    expect(speakers).toEqual([
      'parent', 'parent', 'parent', 'parent',
      'child',
      'parent', 'parent',
      'child',
      'parent', 'parent',
    ]);
  });

  it('substitutes the child name in the closing line', async () => {
    const { APARTMENT_DIALOGUE } = await import('./dialogueBuilders');
    const last = APARTMENT_DIALOGUE[APARTMENT_DIALOGUE.length - 1];
    const text = last.text({ parent: 'You', child: 'Pip' });
    expect(text).toContain('Pip');
    expect(text).toMatch(/Stay here/);
  });
});
