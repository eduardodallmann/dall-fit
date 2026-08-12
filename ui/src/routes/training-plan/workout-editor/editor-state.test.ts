import { describe, expect, it } from 'vitest';

import type { Exercise } from '@dall-fit/types';

import {
  insertEditorItem,
  mergeSavedExercise,
  orderEditorItems,
  type EditorExercise,
} from './editor-state';

describe('workout editor state', () => {
  it('applies canonical fields without overwriting a newer draft revision', () => {
    const current = editorExercise({
      id: 'exercise-1',
      type: 'youtube-short',
      name: 'Draft mais novo',
      youtubeId: 'ZA8gs8XP2bs',
      bodyArea: 'quadriceps',
      restSeconds: 60,
      sets: 4,
      repetitions: 12,
    });
    current.dirty = { name: 'Draft mais novo', sets: 4 };
    current.revisions = { name: 3, sets: 2 };
    current.status = 'saving';

    const result = mergeSavedExercise(
      current,
      {
        ...current.confirmed,
        name: 'Nome canônico anterior',
        sets: 4,
      } as Exercise,
      { name: 1, sets: 2 },
    );

    expect(result.draft).toMatchObject({
      name: 'Draft mais novo',
      sets: 4,
    });
    expect(result.dirty).toEqual({ name: 'Draft mais novo' });
    expect(result.status).toBe('debouncing');
  });

  it('restores only order while preserving current draft objects', () => {
    const first = editorExercise(pause('exercise-1', 90));
    const second = editorExercise(pause('exercise-2', 120));

    const result = orderEditorItems(
      [second, first],
      [first.draft.id, second.draft.id],
    );

    expect(result).toEqual([first, second]);
    expect(result[0]).toBe(first);
    expect(result[1]).toBe(second);
  });

  it('reinserts a removed draft at its prior position', () => {
    const first = editorExercise(pause('exercise-1', 60));
    const removed = editorExercise(pause('exercise-2', 90));
    removed.dirty = { restSeconds: 90 };
    removed.status = 'error';
    const third = editorExercise(pause('exercise-3', 120));

    const result = insertEditorItem([first, third], {
      index: 1,
      item: removed,
    });

    expect(result).toEqual([first, removed, third]);
    expect(result[1]?.dirty).toEqual({ restSeconds: 90 });
    expect(result[1]?.status).toBe('error');
  });
});

function editorExercise(exercise: Exercise): EditorExercise {
  return {
    confirmed: exercise,
    dirty: {},
    draft: exercise,
    revisions: {},
    status: 'idle',
    temporary: false,
  };
}

function pause(id: string, restSeconds: number): Exercise {
  return { id, type: 'pause', restSeconds };
}
