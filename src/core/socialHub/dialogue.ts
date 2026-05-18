/**
 * Dialogue tree runner for the social hub.
 *
 * Owns the "where are we in the conversation right now" state for
 * the ONE NPC the player is currently talking to. The scene
 * component instantiates / advances / closes this runner — it
 * doesn't know anything about React, sprites, money, or POIs.
 *
 * The runner is value-typed: each step returns a NEW `ActiveDialogue`
 * rather than mutating in place. Keeps the React useState wiring
 * straightforward.
 */

import {
  DialogueNode,
  InteractionTree,
  PlayerChoice,
  pickNpcLine,
} from '../../data/socialHub/interactions';

/** Snapshot of the conversation right now. Held by the scene in
 *  React state while a dialogue is open. */
export interface ActiveDialogue {
  /** Runtime NPC id this dialogue is with. */
  npcId: string;
  /** Display name for the panel header. */
  npcName: string;
  /** Tree being walked. */
  tree: InteractionTree;
  /** Current node id within the tree. */
  nodeId: string;
  /** The NPC line being shown right now. Resolved once when entering
   *  the node so a typewriter / repeat-tap doesn't re-roll the line. */
  currentNpcLine: string;
  /** When the previous outcome had `npcReplies`, this holds the
   *  picked reply, shown BEFORE the next node's `currentNpcLine`.
   *  Cleared when the player acknowledges / picks a new option. */
  pendingNpcReply: string | null;
}

/** Begin a fresh dialogue with the given NPC + interaction tree. */
export function openDialogue(
  npcId: string,
  npcName: string,
  tree: InteractionTree,
): ActiveDialogue {
  const node = tree.nodes[tree.startNodeId];
  return {
    npcId,
    npcName,
    tree,
    nodeId: tree.startNodeId,
    currentNpcLine: pickNpcLine(node),
    pendingNpcReply: null,
  };
}

export function currentNode(state: ActiveDialogue): DialogueNode | undefined {
  return state.tree.nodes[state.nodeId];
}

/** Player picks an option. Returns either:
 *   – next ActiveDialogue (branch)
 *   – { terminal: true, outcome } (interaction over — caller applies
 *     the outcome to runtime state)
 *
 *  When the choice branches with `npcReplies`, the runner FIRST
 *  returns an interim state that shows the reply on top of the
 *  current node — caller renders, player taps "Continue", caller
 *  re-invokes `advancePastReply` to step into the next node. */
export type PickResult =
  | { kind: 'branch'; state: ActiveDialogue }
  | { kind: 'reply'; state: ActiveDialogue }
  | {
      kind: 'terminal';
      outcome: {
        tipCents?: number;
        satisfactionDelta?: number;
        npcLeaves?: boolean;
        happy?: boolean;
        staffTask?: 'coffee' | 'charger' | 'blanket' | 'book' | 'wifi';
      };
    };

export function pickChoice(
  state: ActiveDialogue,
  choice: PlayerChoice,
): PickResult {
  const outcome = choice.outcome;
  if ('end' in outcome && outcome.end) {
    return {
      kind: 'terminal',
      outcome: {
        tipCents: outcome.tipCents,
        satisfactionDelta: outcome.satisfactionDelta,
        npcLeaves: outcome.npcLeaves,
        happy: outcome.happy,
        staffTask: outcome.staffTask,
      },
    };
  }
  // Branch path — `outcome.nextNode` is guaranteed since end is false.
  const nextNodeId = outcome.nextNode;
  const nextNode = state.tree.nodes[nextNodeId];
  if (!nextNode) {
    // Tree authoring error — fall through to terminal so the player
    // isn't stuck staring at a dead choice. Logging in non-prod
    // keeps the bug visible.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[social-hub] unknown nextNode '${nextNodeId}' in '${state.tree.id}'`);
    }
    return { kind: 'terminal', outcome: {} };
  }
  const reply = outcome.npcReplies && outcome.npcReplies.length > 0
    ? outcome.npcReplies[Math.floor(Math.random() * outcome.npcReplies.length)]
    : null;
  if (reply) {
    // Show the interim reply first; the next render renders this
    // as the NPC line. The caller asks us to advance again on tap.
    return {
      kind: 'reply',
      state: {
        ...state,
        nodeId: nextNodeId,
        currentNpcLine: reply,
        // After the player acknowledges, we'll swap to the node's
        // real line. Hold the target node line in pending? No —
        // simpler: once the player taps, the next call to
        // `advancePastReply` picks a fresh node line.
        pendingNpcReply: pickNpcLine(nextNode),
      },
    };
  }
  return {
    kind: 'branch',
    state: {
      ...state,
      nodeId: nextNodeId,
      currentNpcLine: pickNpcLine(nextNode),
      pendingNpcReply: null,
    },
  };
}

/** Called after the player taps "Continue" on an interim NPC reply
 *  bubble. Swaps the displayed line to the next node's real line. */
export function advancePastReply(state: ActiveDialogue): ActiveDialogue {
  if (!state.pendingNpcReply) return state;
  return {
    ...state,
    currentNpcLine: state.pendingNpcReply,
    pendingNpcReply: null,
  };
}
