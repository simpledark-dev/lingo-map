/**
 * DialogueOverlay tap-flow tests.
 *
 * Covers the matrix that bit us in 0.1.161 → 0.1.173:
 *   - hasOptions × multi-line × is-last-line × is-fully-revealed
 *
 * The bug: a multi-line dialogue with options got stuck on line 0
 * because handleBoxClick bailed on `hasOptions` for any line. Fix
 * was to gate that bail on `isLastLine` too, so intermediate lines
 * advance like a normal sequence.
 *
 * Each scenario uses fake timers so we can fast-forward the
 * typewriter (22ms/char) and the 250ms options settle without
 * waiting in real time.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import DialogueOverlay from './DialogueOverlay';
import type { DialogueState } from '../core/types';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Walk the typewriter to the end of the current line. Each
 *  character takes 22ms (TYPEWRITER_INTERVAL_MS). +50ms slack for
 *  the trailing tick + state flush. */
function flushTypewriter(charCount: number) {
  act(() => {
    vi.advanceTimersByTime(charCount * 22 + 50);
  });
}

/** Walk past the 250ms options-settle delay after the last line is
 *  fully revealed. Set generously to avoid edge-case flakes. */
function flushOptionsSettle() {
  act(() => {
    vi.advanceTimersByTime(300);
  });
}

function makeDialogue(over: Partial<DialogueState>): DialogueState {
  return {
    npcId: 'npc',
    npcName: 'Speaker',
    lines: ['Default line.'],
    currentLine: 0,
    ...over,
  };
}

describe('DialogueOverlay tap flow', () => {
  it('single line, no options: tap after typewriter calls onAdvance', () => {
    const onAdvance = vi.fn();
    const dialogue = makeDialogue({ lines: ['Hello.'] });
    render(<DialogueOverlay dialogue={dialogue} onAdvance={onAdvance} />);
    flushTypewriter(dialogue.lines[0].length);
    fireEvent.click(screen.getByText(/Hello/));
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it('single line, no options: tap during typewriter fast-forwards instead of advancing', () => {
    const onAdvance = vi.fn();
    const dialogue = makeDialogue({ lines: ['A long line of text here.'] });
    render(<DialogueOverlay dialogue={dialogue} onAdvance={onAdvance} />);
    // Mid-typewriter, only a couple chars revealed.
    act(() => {
      vi.advanceTimersByTime(40);
    });
    fireEvent.click(screen.getByText(/A/));
    // Fast-forward, not advance.
    expect(onAdvance).not.toHaveBeenCalled();
    // Full text now visible.
    expect(screen.getByText(/A long line of text here\./)).toBeInTheDocument();
  });

  it('multi line, no options: tap walks line-by-line and final tap calls onAdvance', () => {
    const onAdvance = vi.fn();
    const dialogue = makeDialogue({
      lines: ['First.', 'Second.', 'Third.'],
    });
    const { rerender } = render(
      <DialogueOverlay dialogue={dialogue} onAdvance={onAdvance} />,
    );
    flushTypewriter(dialogue.lines[0].length);
    fireEvent.click(screen.getByText(/First/));
    expect(onAdvance).toHaveBeenCalledTimes(1);

    // Parent would advance currentLine; simulate that.
    rerender(
      <DialogueOverlay
        dialogue={{ ...dialogue, currentLine: 1 }}
        onAdvance={onAdvance}
      />,
    );
    flushTypewriter(dialogue.lines[1].length);
    fireEvent.click(screen.getByText(/Second/));
    expect(onAdvance).toHaveBeenCalledTimes(2);

    rerender(
      <DialogueOverlay
        dialogue={{ ...dialogue, currentLine: 2 }}
        onAdvance={onAdvance}
      />,
    );
    flushTypewriter(dialogue.lines[2].length);
    fireEvent.click(screen.getByText(/Third/));
    expect(onAdvance).toHaveBeenCalledTimes(3);
  });

  it('single line + options: options appear after settle and clicking fires onSelectOption', () => {
    const onAdvance = vi.fn();
    const onSelectOption = vi.fn();
    const dialogue = makeDialogue({
      lines: ['Pick one:'],
      options: [
        { id: 'a', label: 'Choice A' },
        { id: 'b', label: 'Choice B' },
      ],
    });
    render(
      <DialogueOverlay
        dialogue={dialogue}
        onAdvance={onAdvance}
        onSelectOption={onSelectOption}
      />,
    );
    flushTypewriter(dialogue.lines[0].length);
    // Pre-settle: options must NOT yet be visible.
    expect(screen.queryByText('Choice A')).not.toBeInTheDocument();
    flushOptionsSettle();
    expect(screen.getByText('Choice A')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Choice A'));
    expect(onSelectOption).toHaveBeenCalledWith('a');
    // Tap on option must NOT bubble up as advance.
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('REGRESSION: multi-line + options does not get stuck on line 0', () => {
    const onAdvance = vi.fn();
    const onSelectOption = vi.fn();
    // Mirrors the CEO paycheck claim shape — 2 lines + options on
    // the LAST line. Before the 0.1.173 fix, the player got stuck
    // on line 0 because handleBoxClick bailed on hasOptions for
    // any line, never advancing past the first.
    const dialogue = makeDialogue({
      lines: [
        'Word is you cleared the threshold!',
        'Here — a bonus for showing up.',
      ],
      options: [
        { id: 'claim', label: 'Claim bonus' },
        { id: 'later', label: 'Maybe later' },
      ],
    });
    const { rerender } = render(
      <DialogueOverlay
        dialogue={dialogue}
        onAdvance={onAdvance}
        onSelectOption={onSelectOption}
      />,
    );

    // Line 0 typewriter completes.
    flushTypewriter(dialogue.lines[0].length);
    // CRITICAL: tap on line 0 must advance, NOT bail. Options
    // exist but shouldn't be reachable from a non-last line.
    expect(screen.queryByText('Claim bonus')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Word is/));
    expect(onAdvance).toHaveBeenCalledTimes(1);

    // Parent advances currentLine to 1 in response.
    rerender(
      <DialogueOverlay
        dialogue={{ ...dialogue, currentLine: 1 }}
        onAdvance={onAdvance}
        onSelectOption={onSelectOption}
      />,
    );
    flushTypewriter(dialogue.lines[1].length);
    flushOptionsSettle();

    // Now options are visible.
    expect(screen.getByText('Claim bonus')).toBeInTheDocument();

    // Tap on the box itself must be locked on the last line —
    // otherwise the same tap that opens the choice menu would
    // also dismiss it.
    fireEvent.click(screen.getByText(/Here/));
    expect(onAdvance).toHaveBeenCalledTimes(1); // still 1, no change

    fireEvent.click(screen.getByText('Claim bonus'));
    expect(onSelectOption).toHaveBeenCalledWith('claim');
  });

  it('skipTypewriter renders the line fully and surfaces options without delay', () => {
    const onSelectOption = vi.fn();
    const dialogue = makeDialogue({
      lines: ['Restored line.'],
      options: [{ id: 'ok', label: 'OK' }],
      skipTypewriter: true,
    });
    render(
      <DialogueOverlay
        dialogue={dialogue}
        onAdvance={vi.fn()}
        onSelectOption={onSelectOption}
      />,
    );
    // No typewriter flush, no settle flush — options are right
    // there because skipTypewriter is set.
    expect(screen.getByText('Restored line.')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });
});
