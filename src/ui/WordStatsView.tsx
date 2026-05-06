'use client';

/**
 * Word Stats — global progress view across every vocabulary pack.
 * Lists every word the player COULD see (catalog union, not just
 * encountered), tagged with its source pack, and the lifetime
 * tallies + state pulled from each pack's persisted progress.
 *
 * Filters mirror the user's mental model of "show me where I'm
 * leaking points":
 *   - All
 *   - Most correct (descending correct count)
 *   - Most wrong  (descending wrong count)
 *   - Worst ratio (lowest correct / total — ties broken by total seen)
 *   - Not seen    (seenCount === 0)
 *   - In review   (currently in any pack's wrong-queue)
 *
 * Read-only: no actions on rows. The point is the data, not the
 * verb. Tap a row to expand its meaning + example, same affordance
 * as VocabularyListView so the muscle memory transfers.
 */

import { useMemo, useState } from 'react';
import { VOCABULARY_PACKS, type VocabularyEntry, getExamples, getMeaning } from '../data/vocabularyPacks';
import { t } from '../data/i18n';
import { loadProgress, type WordState } from '../data/vocabSelection';
import { speakVocabWord } from './wordSpeak';
import { cancelDialogueSpeech } from './tts';
import { getUiTheme } from './uiThemes';

const UI_THEME = getUiTheme();
const COLORS = UI_THEME.colors;

type FilterId = 'all' | 'most-correct' | 'most-wrong' | 'worst-ratio' | 'not-seen' | 'in-review';

interface FilterDef {
  id: FilterId;
  label: string;
  /** One-line caption shown under the dropdown so the player knows
   *  exactly what they're looking at without re-reading the option. */
  hint: string;
}

function getFilters(): FilterDef[] { return [
  { id: 'all', label: t('wordStats.filter.all'), hint: t('wordStats.filter.allHint') },
  { id: 'most-correct', label: t('wordStats.filter.mostCorrect'), hint: t('wordStats.filter.mostCorrectHint') },
  { id: 'most-wrong', label: t('wordStats.filter.mostWrong'), hint: t('wordStats.filter.mostWrongHint') },
  { id: 'worst-ratio', label: t('wordStats.filter.worstRatio'), hint: t('wordStats.filter.worstRatioHint') },
  { id: 'not-seen', label: t('wordStats.filter.notSeen'), hint: t('wordStats.filter.notSeenHint') },
  { id: 'in-review', label: t('wordStats.filter.inReview'), hint: t('wordStats.filter.inReviewHint') },
]; }

interface RowData {
  entry: VocabularyEntry;
  packId: string;
  packTheme: string;
  /** Word may live in multiple packs (e.g. Saba reuses Mira's
   *  numbers). We aggregate the WordState across all packs that
   *  contain it so the player sees their TRUE lifetime mastery,
   *  not a per-pack split that misleads. */
  state: WordState;
}

interface WordStatsViewProps {
  onClose: () => void;
}

export default function WordStatsView({ onClose }: WordStatsViewProps) {
  const [filter, setFilter] = useState<FilterId>('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Aggregate every catalog word, summing per-pack progress when the
  // same target appears in multiple packs. The displayed `packTheme`
  // is whichever pack the player actually has progress on, falling
  // back to the alphabetically-first pack so a never-touched word
  // still shows a sensible source.
  const rows = useMemo<RowData[]>(() => {
    const progressByPack = new Map<string, ReturnType<typeof loadProgress>>();
    const wrongQueueWords = new Set<string>();
    for (const packId of Object.keys(VOCABULARY_PACKS)) {
      const p = loadProgress(packId);
      progressByPack.set(packId, p);
      for (const w of p.wrongQueue) wrongQueueWords.add(w);
    }
    // Aggregate by target. Each target accumulates tallies from
    // every pack that contains it; the "home" pack for display
    // purposes is whichever pack contributed the most exposure
    // (highest seenCount), with a stable alphabetical tiebreaker.
    type Agg = {
      entry: VocabularyEntry;
      perPack: Array<{ packId: string; packTheme: string; ws: WordState }>;
    };
    const aggs = new Map<string, Agg>();
    for (const pack of Object.values(VOCABULARY_PACKS)) {
      for (const entry of pack.entries) {
        const key = entry.target;
        const ws: WordState = progressByPack.get(pack.id)!.byWord[key] ?? {
          seenCount: 0,
          streak: 0,
          inWrongQueue: false,
          correctCount: 0,
          wrongCount: 0,
        };
        const existing = aggs.get(key);
        if (existing) {
          existing.perPack.push({ packId: pack.id, packTheme: pack.theme, ws });
        } else {
          aggs.set(key, { entry, perPack: [{ packId: pack.id, packTheme: pack.theme, ws }] });
        }
      }
    }
    const out: RowData[] = [];
    for (const { entry, perPack } of aggs.values()) {
      const seenCount = perPack.reduce((s, p) => s + p.ws.seenCount, 0);
      const correctCount = perPack.reduce((s, p) => s + p.ws.correctCount, 0);
      const wrongCount = perPack.reduce((s, p) => s + p.ws.wrongCount, 0);
      const inWrongQueue = perPack.some((p) => p.ws.inWrongQueue) || wrongQueueWords.has(entry.target);
      const streak = Math.max(...perPack.map((p) => p.ws.streak));
      // Pick the most-engaged pack as the "home" tag for display.
      const home = [...perPack].sort((a, b) => b.ws.seenCount - a.ws.seenCount || a.packId.localeCompare(b.packId))[0];
      out.push({
        entry,
        packId: home.packId,
        packTheme: home.packTheme,
        state: { seenCount, correctCount, wrongCount, inWrongQueue, streak },
      });
    }
    return out;
  }, []);

  const filtered = useMemo(() => {
    const base = [...rows];
    switch (filter) {
      case 'most-correct':
        return base.sort((a, b) =>
          b.state.correctCount - a.state.correctCount
          || b.state.seenCount - a.state.seenCount
          || a.entry.target.localeCompare(b.entry.target),
        );
      case 'most-wrong':
        return base.sort((a, b) =>
          b.state.wrongCount - a.state.wrongCount
          || b.state.seenCount - a.state.seenCount
          || a.entry.target.localeCompare(b.entry.target),
        );
      case 'worst-ratio':
        // Only words with seenCount > 0 — a 0/0 ratio is meaningless.
        // Within unseen-excluded set, sort by ratio ASC (worst first),
        // ties broken by seenCount DESC so "I've taken many shots and
        // missed most" beats "took 1 shot and missed it."
        return base
          .filter((r) => r.state.seenCount > 0)
          .sort((a, b) => {
            const ra = a.state.correctCount / a.state.seenCount;
            const rb = b.state.correctCount / b.state.seenCount;
            return ra - rb
              || b.state.seenCount - a.state.seenCount
              || a.entry.target.localeCompare(b.entry.target);
          });
      case 'not-seen':
        return base
          .filter((r) => r.state.seenCount === 0)
          .sort((a, b) => a.entry.target.localeCompare(b.entry.target));
      case 'in-review':
        return base
          .filter((r) => r.state.inWrongQueue)
          .sort((a, b) =>
            b.state.wrongCount - a.state.wrongCount
            || a.entry.target.localeCompare(b.entry.target),
          );
      case 'all':
      default:
        return base.sort((a, b) => a.entry.target.localeCompare(b.entry.target));
    }
  }, [rows, filter]);

  const totalSeen = rows.reduce((s, r) => s + r.state.seenCount, 0);
  const totalCorrect = rows.reduce((s, r) => s + r.state.correctCount, 0);
  const totalWrong = rows.reduce((s, r) => s + r.state.wrongCount, 0);
  const overallPct = totalSeen > 0 ? Math.round((totalCorrect / totalSeen) * 100) : null;

  const handleSpeak = (entry: VocabularyEntry, packId: string) => {
    cancelDialogueSpeech();
    const pack = VOCABULARY_PACKS[packId];
    if (pack) speakVocabWord(pack, entry.target);
  };

  const activeFilter = getFilters().find((f) => f.id === filter)!;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          ...UI_THEME.modal.panelStyle,
          width: 'min(520px, 100%)',
          maxHeight: '90dvh',
          padding: 16,
          gap: 12,
        }}
      >
        {/* Header — title + overall summary chip + close. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: COLORS.text, letterSpacing: 0.5 }}>
            📊 {t('wordStats.title')}
          </div>
          {totalSeen > 0 && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: COLORS.text,
                background: COLORS.parchmentLight,
                border: `2px solid ${COLORS.cardBorder}`,
                padding: '4px 10px',
                borderRadius: 4,
              }}
              title={t('wordStats.lifetimeTip', { correct: totalCorrect, wrong: totalWrong, seen: totalSeen })}
            >
              <span style={{
                color: overallPct != null && overallPct >= 80 ? COLORS.correct
                  : overallPct != null && overallPct >= 50 ? COLORS.accentGoldDark
                  : COLORS.wrong,
                marginRight: 6,
                fontWeight: 700,
              }}>
                {overallPct ?? 0}%
              </span>
              {totalCorrect}✓ {totalWrong}✕
            </div>
          )}
          <button
            onClick={onClose}
            aria-label={t('wordStats.closeAria')}
            style={{
              width: 28, height: 28,
              background: COLORS.parchmentLight,
              border: `2px solid ${COLORS.cardBorder}`,
              borderRadius: 4,
              color: COLORS.text,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Filter row — pill toggles. Wraps on narrow viewports. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {getFilters().map((f) => {
              const active = f.id === filter;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  style={{
                    fontFamily: 'inherit',
                    fontSize: 11,
                    fontWeight: 700,
                    color: active ? '#fdf6e0' : COLORS.text,
                    background: active ? COLORS.accentGold : COLORS.cardRest,
                    border: `2px solid ${active ? COLORS.accentGoldDark : COLORS.cardBorder}`,
                    borderRadius: 999,
                    padding: '4px 10px',
                    letterSpacing: 0.4,
                    cursor: 'pointer',
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: COLORS.hintText, fontStyle: 'italic' }}>
            {activeFilter.hint}
            {' '}<span style={{ color: COLORS.text, fontStyle: 'normal', fontWeight: 700 }}>
              ({filtered.length})
            </span>
          </div>
        </div>

        {/* List body — scrolls. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                fontSize: 12,
                color: COLORS.hintText,
                textAlign: 'center',
                padding: '20px 8px',
                fontStyle: 'italic',
              }}
            >
              {filter === 'in-review'
                ? 'Nothing in review right now. Nice.'
                : filter === 'not-seen'
                  ? 'You\u2019ve seen every word at least once.'
                  : 'No words to show.'}
            </div>
          )}
          {filtered.map((row) => {
            const key = `${row.packId}:${row.entry.target}`;
            const expanded = expandedKey === key;
            const examples = expanded ? getExamples(row.entry) : [];
            const ratioPct = row.state.seenCount > 0
              ? Math.round((row.state.correctCount / row.state.seenCount) * 100)
              : null;
            return (
              <div
                key={key}
                style={{
                  background: COLORS.cardRest,
                  border: `2px solid ${COLORS.cardBorder}`,
                  borderRadius: 6,
                  padding: '8px 10px',
                  boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedKey(expanded ? null : key)}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>
                    {row.entry.target}
                  </span>
                  <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, color: COLORS.hintText, fontWeight: 700 }}>
                    {row.entry.pos}
                  </span>
                  <span style={{ fontSize: 12, color: COLORS.hintText }}>
                    — {getMeaning(row.entry)}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {row.state.seenCount === 0 ? (
                      <span style={{ color: COLORS.hintText, fontStyle: 'italic' }}>
                        {t('wordStats.notSeenShort')}
                      </span>
                    ) : (
                      <>
                        <span style={{ color: COLORS.correct }}>{row.state.correctCount}✓</span>
                        <span style={{ color: COLORS.wrong }}>{row.state.wrongCount}✕</span>
                        {ratioPct != null && (
                          <span style={{
                            color: ratioPct >= 80 ? COLORS.correct
                              : ratioPct >= 50 ? COLORS.accentGoldDark
                              : COLORS.wrong,
                          }}>
                            {ratioPct}%
                          </span>
                        )}
                      </>
                    )}
                    {row.state.inWrongQueue && (
                      <span style={{
                        background: COLORS.warn,
                        color: '#fdf6e0',
                        padding: '1px 5px',
                        borderRadius: 999,
                        fontSize: 9,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}>
                        Review
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ marginTop: 4, fontSize: 10, color: COLORS.hintText, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>{row.packTheme}</span>
                  <span>·</span>
                  <span>{row.state.seenCount} seen</span>
                  {row.state.streak > 0 && (
                    <>
                      <span>·</span>
                      <span>{row.state.streak} streak</span>
                    </>
                  )}
                </div>

                {expanded && (
                  <div
                    style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: `1px dashed ${COLORS.cardBorder}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => handleSpeak(row.entry, row.packId)}
                        style={{
                          fontFamily: 'inherit',
                          fontSize: 11,
                          background: COLORS.speakerBg,
                          border: `2px solid ${COLORS.cardBorder}`,
                          boxShadow: `inset 1px 1px 0 0 ${COLORS.parchmentLight}, 0 2px 0 0 ${COLORS.cardBorder}`,
                          padding: '3px 8px',
                          color: COLORS.text,
                          cursor: 'pointer',
                        }}
                      >
                        🔊 {t('wordStats.hearIt')}
                      </button>
                      <span style={{ fontSize: 11, color: COLORS.hintText }}>
                        {t('wordStats.fromPack')} <strong>{row.packTheme}</strong>
                      </span>
                    </div>
                    {examples.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.7, color: COLORS.accentGoldDark, fontWeight: 700 }}>
                          {t('common.examples')}
                        </div>
                        {examples.map((sentence, i) => (
                          <div key={i} style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.4 }}>
                            <span style={{ color: COLORS.accentGoldDark, marginRight: 4 }}>·</span>
                            {sentence}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
