import type { Exercise, UpdateExerciseRequest } from '@dall-fit/types';

export type ExerciseSaveStatus =
  'idle' | 'debouncing' | 'queued' | 'saving' | 'error';

export interface EditorExercise {
  confirmed: Exercise;
  dirty: UpdateExerciseRequest;
  draft: Exercise;
  revisions: Readonly<Record<string, number>>;
  status: ExerciseSaveStatus;
  temporary: boolean;
}

export interface RemovedExercise {
  index: number;
  item: EditorExercise;
}

export function createEditorExercise(exercise: Exercise): EditorExercise {
  return {
    confirmed: exercise,
    dirty: {},
    draft: exercise,
    revisions: {},
    status: 'idle',
    temporary: false,
  };
}

export function mergeExercise(
  exercise: Exercise,
  changes: UpdateExerciseRequest,
): Exercise {
  const merged = { ...exercise, ...changes } as Exercise;
  if (merged.type === 'duration') {
    if (changes.youtubeId === null) delete merged.youtubeId;
    else if (typeof changes.youtubeId === 'string') merged.image = null;
    if (changes.instructions === null) delete merged.instructions;
  }
  return merged;
}

export function applyExerciseImage(
  exercise: Exercise,
  image: Extract<Exercise, { type: 'image' }>['image'],
): Exercise {
  if (exercise.type !== 'image' && exercise.type !== 'duration')
    return exercise;
  const result = { ...exercise, image };
  if (result.type === 'duration' && image !== null) delete result.youtubeId;
  return result;
}

export function refreshExerciseMedia(
  exercise: Exercise,
  source: Exercise,
): Exercise {
  const result = applyExerciseImage(
    exercise,
    'image' in source ? (source.image ?? null) : null,
  );
  if (result.type === 'duration' && source.type === 'duration') {
    if (source.youtubeId === undefined) delete result.youtubeId;
    else result.youtubeId = source.youtubeId;
  }
  return result;
}

export function mergeSavedExercise(
  current: EditorExercise,
  saved: Exercise,
  submittedRevisions: Readonly<Record<string, number | undefined>>,
): EditorExercise {
  const dirty = { ...current.dirty } as Record<string, unknown>;
  const savedDraft = { ...saved } as unknown as Record<string, unknown>;
  const currentDraft = current.draft as unknown as Record<string, unknown>;
  for (const field of Object.keys(dirty)) {
    if (current.revisions[field] === submittedRevisions[field]) {
      delete dirty[field];
    } else {
      savedDraft[field] = currentDraft[field];
    }
  }
  const hasDirty = Object.keys(dirty).length > 0;
  return {
    ...current,
    confirmed: saved,
    dirty,
    draft: savedDraft as unknown as Exercise,
    status: hasDirty ? 'debouncing' : 'idle',
  };
}

export function updateEditorItem(
  current: readonly EditorExercise[],
  exerciseId: string,
  update: (item: EditorExercise) => EditorExercise,
): readonly EditorExercise[] {
  return current.map((item) =>
    item.draft.id === exerciseId ? update(item) : item,
  );
}

export function insertEditorItem(
  current: readonly EditorExercise[],
  removed: RemovedExercise,
): readonly EditorExercise[] {
  if (current.some((item) => item.draft.id === removed.item.draft.id))
    return current;
  const index = Math.min(removed.index, current.length);
  return [...current.slice(0, index), removed.item, ...current.slice(index)];
}

export function orderEditorItems(
  current: readonly EditorExercise[],
  orderedIds: readonly string[],
): readonly EditorExercise[] {
  const byId = new Map(current.map((item) => [item.draft.id, item]));
  const ordered = orderedIds.flatMap((id) => {
    const item = byId.get(id);
    if (item === undefined) return [];
    byId.delete(id);
    return [item];
  });
  return [...ordered, ...byId.values()];
}
