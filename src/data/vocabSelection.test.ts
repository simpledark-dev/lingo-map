import { describe, expect, it } from 'vitest';
import type { VocabularyPack } from './vocabularyPacks';
import {
  createInitialProgress,
  pickPromptEntry,
  recordAnswer,
} from './vocabSelection';

const pack: VocabularyPack = {
  id: 'test-pack',
  theme: 'Test',
  entries: [
    { target: 'chien', english: 'dog', pos: 'noun' },
    { target: 'chat', english: 'cat', pos: 'noun' },
    { target: 'courir', english: 'run', pos: 'verb' },
  ],
};

describe('vocabSelection immediate retry', () => {
  it('forces a missed word to be the next prompt', () => {
    const progress = recordAnswer(createInitialProgress(), 'chien', false);

    expect(pickPromptEntry(pack, progress).target).toBe('chien');
  });

  it('clears the immediate retry after the retry is answered correctly', () => {
    const missed = recordAnswer(createInitialProgress(), 'chien', false);
    const recovered = recordAnswer(missed, 'chien', true);

    expect(recovered.retryNext).toBeNull();
  });
});
