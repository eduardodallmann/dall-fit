import { useCallback, useRef, useState } from 'react';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Button,
  Dropdown,
  Input,
  Label,
  TextField,
  toast,
} from '@heroui/react';
import { useBlocker } from '@tanstack/react-router';
import { Check, Pencil, Plus, X } from 'lucide-react';

import type {
  Exercise,
  ExerciseType,
  TrainingPlanWorkoutDetails,
  UpdateExerciseRequest,
} from '@dall-fit/types';

import { trackUiEvent, type AnalyticsControl } from '~/core/analytics';
import {
  createTrainingPlanExercise,
  deleteTrainingPlanExercise,
  removeTrainingPlanExerciseImage,
  reorderTrainingPlanExercises,
  updateTrainingPlanExercise,
  updateTrainingPlanWorkout,
  uploadTrainingPlanExerciseImage,
  type MockTrainingPlansScenario,
} from '~/routes/training-plan/training-plan-service';

import { ExerciseRow } from './exercise-row';
import { workoutEditorStyles } from './styles';
import { useAggregateMutationQueue } from './use-aggregate-mutation-queue';

const styles = workoutEditorStyles();
const exerciseTypes: readonly { id: ExerciseType; label: string }[] = [
  { id: 'youtube-short', label: 'YouTube Short' },
  { id: 'youtube-long', label: 'YouTube Longo' },
  { id: 'image', label: 'Imagem' },
  { id: 'pause', label: 'Pausa' },
  { id: 'duration', label: 'Duração' },
];
type EditorOperation =
  | 'workout_update'
  | 'exercise_create'
  | 'exercise_update'
  | 'exercise_delete'
  | 'exercise_reorder'
  | 'exercise_image_upload'
  | 'exercise_image_replace'
  | 'exercise_image_remove';

function trackStarted(
  operation: EditorOperation,
  control: AnalyticsControl,
): void {
  trackUiEvent({
    eventName: 'ui_operation_started',
    operation,
    control,
    surface: 'workout',
  });
}

function trackCompleted(
  operation: EditorOperation,
  control: AnalyticsControl,
  outcome: 'success' | 'error',
): void {
  trackUiEvent({
    eventName: 'ui_operation_completed',
    operation,
    outcome,
    control,
    surface: 'workout',
  });
}

interface WorkoutEditorProps {
  data: TrainingPlanWorkoutDetails;
  mockScenario: MockTrainingPlansScenario;
  onConflict: () => void;
}

export function WorkoutEditor({
  data,
  mockScenario,
  onConflict,
}: Readonly<WorkoutEditorProps>) {
  const [exercises, setExercises] = useState<readonly Exercise[]>(
    data.exercises,
  );
  const [workoutName, setWorkoutName] = useState(data.name);
  const [nameDraft, setNameDraft] = useState(data.name);
  const confirmedWorkoutName = useRef(data.name);
  const [editingName, setEditingName] = useState(false);
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(new Set());
  const [draftIds, setDraftIds] = useState<ReadonlySet<string>>(new Set());
  const queue = useAggregateMutationQueue(data.version, onConflict);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  useBlocker({
    disabled: draftIds.size === 0,
    enableBeforeUnload: false,
    shouldBlockFn: () =>
      !window.confirm(
        'Há alterações ainda não enviadas. Deseja sair e descartá-las?',
      ),
  });

  const saveName = () => {
    const name = nameDraft.trim();
    if (name.length === 0 || name.length > 120) return;
    setEditingName(false);
    setWorkoutName(name);
    trackStarted('workout_update', 'workout_name');
    let rollbackName = confirmedWorkoutName.current;
    const promise = queue.enqueue(async (version) => {
      rollbackName = confirmedWorkoutName.current;
      const result = await updateTrainingPlanWorkout(
        data.trainingPlan.id,
        data.id,
        name,
        version,
        mockScenario,
      );
      confirmedWorkoutName.current = result.data.name;
      return result;
    });
    toast.promise(promise, {
      loading: 'Salvando nome…',
      success: 'Nome atualizado.',
      error: 'Não foi possível salvar o nome.',
    });
    void promise
      .then((saved) => {
        setWorkoutName(saved.name);
        setNameDraft(saved.name);
        trackCompleted('workout_update', 'workout_name', 'success');
      })
      .catch(() => {
        setWorkoutName(rollbackName);
        setEditingName(true);
        trackCompleted('workout_update', 'workout_name', 'error');
      });
  };

  const markSaving = (id: string, saving: boolean) =>
    setSavingIds((current) => {
      const next = new Set(current);
      if (saving) next.add(id);
      else next.delete(id);
      return next;
    });

  const saveExercise = useCallback(
    (exerciseId: string, changes: UpdateExerciseRequest) => {
      markSaving(exerciseId, true);
      trackStarted('exercise_update', 'exercise_field');
      void queue
        .enqueue((version) =>
          updateTrainingPlanExercise(
            data.trainingPlan.id,
            data.id,
            exerciseId,
            changes,
            version,
            mockScenario,
          ),
        )
        .then((saved) => {
          setExercises((current) =>
            current.map((item) => (item.id === saved.id ? saved : item)),
          );
          trackCompleted('exercise_update', 'exercise_field', 'success');
        })
        .catch(() => {
          trackCompleted('exercise_update', 'exercise_field', 'error');
          toast.danger(
            'Não foi possível salvar o exercício. O rascunho foi preservado.',
          );
        })
        .finally(() => markSaving(exerciseId, false));
    },
    [data.id, data.trainingPlan.id, mockScenario, queue],
  );

  const addExercise = (type: ExerciseType) => {
    const temporaryId = `temporary-${crypto.randomUUID()}`;
    const temporary = createTemporaryExercise(type, temporaryId);
    setExercises((current) => [...current, temporary]);
    markSaving(temporaryId, true);
    trackStarted('exercise_create', 'add_exercise');
    void queue
      .enqueue((version) =>
        createTrainingPlanExercise(
          data.trainingPlan.id,
          data.id,
          { type },
          version,
          mockScenario,
        ),
      )
      .then((created) => {
        setExercises((current) =>
          current.map((item) => (item.id === temporaryId ? created : item)),
        );
        trackCompleted('exercise_create', 'add_exercise', 'success');
      })
      .catch(() => {
        setExercises((current) =>
          current.filter((item) => item.id !== temporaryId),
        );
        trackCompleted('exercise_create', 'add_exercise', 'error');
        toast.danger('Não foi possível adicionar o exercício.');
      })
      .finally(() => markSaving(temporaryId, false));
  };

  const deleteExercise = (exerciseId: string) => {
    const index = exercises.findIndex((item) => item.id === exerciseId);
    const removed = exercises[index];
    if (removed === undefined) return;
    setExercises((current) => current.filter((item) => item.id !== exerciseId));
    markSaving(exerciseId, true);
    trackStarted('exercise_delete', 'delete_exercise');
    void queue
      .enqueue(async (version) => ({
        data: undefined,
        version: await deleteTrainingPlanExercise(
          data.trainingPlan.id,
          data.id,
          exerciseId,
          version,
          mockScenario,
        ),
      }))
      .then(() =>
        trackCompleted('exercise_delete', 'delete_exercise', 'success'),
      )
      .catch(() => {
        setExercises((current) => [
          ...current.slice(0, index),
          removed,
          ...current.slice(index),
        ]);
        trackCompleted('exercise_delete', 'delete_exercise', 'error');
        toast.danger('Não foi possível excluir o exercício.');
      })
      .finally(() => markSaving(exerciseId, false));
  };

  const dragEnd = (event: DragEndEvent) => {
    if (event.over === null || event.active.id === event.over.id) return;
    const previous = exercises;
    const oldIndex = previous.findIndex((item) => item.id === event.active.id);
    const newIndex = previous.findIndex((item) => item.id === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const ordered = arrayMove([...previous], oldIndex, newIndex);
    setExercises(ordered);
    trackStarted('exercise_reorder', 'reorder_handle');
    void queue
      .enqueue(async (version) => ({
        data: undefined,
        version: await reorderTrainingPlanExercises(
          data.trainingPlan.id,
          data.id,
          { exerciseIds: ordered.map((item) => item.id) },
          version,
          mockScenario,
        ),
      }))
      .then(() =>
        trackCompleted('exercise_reorder', 'reorder_handle', 'success'),
      )
      .catch(() => {
        setExercises(previous);
        trackCompleted('exercise_reorder', 'reorder_handle', 'error');
        toast.danger('Não foi possível reordenar os exercícios.');
      });
  };

  const uploadImage = (exerciseId: string, file: File) => {
    markSaving(exerciseId, true);
    const replacing = exercises.some(
      (exercise) =>
        exercise.id === exerciseId &&
        exercise.type === 'image' &&
        exercise.image !== null,
    );
    const operation = replacing
      ? 'exercise_image_replace'
      : 'exercise_image_upload';
    const control = replacing ? 'image_replace' : 'image_upload';
    trackStarted(operation, control);
    void queue
      .enqueue((version) =>
        uploadTrainingPlanExerciseImage(
          data.trainingPlan.id,
          data.id,
          exerciseId,
          file,
          version,
          mockScenario,
        ),
      )
      .then((image) => {
        setExercises((current) =>
          current.map((item) =>
            item.id === exerciseId && item.type === 'image'
              ? { ...item, image }
              : item,
          ),
        );
        trackCompleted(operation, control, 'success');
      })
      .catch(() => {
        trackCompleted(operation, control, 'error');
        toast.danger('Não foi possível processar a imagem.');
      })
      .finally(() => markSaving(exerciseId, false));
  };

  const removeImage = (exerciseId: string) => {
    markSaving(exerciseId, true);
    trackStarted('exercise_image_remove', 'image_remove');
    void queue
      .enqueue(async (version) => ({
        data: undefined,
        version: await removeTrainingPlanExerciseImage(
          data.trainingPlan.id,
          data.id,
          exerciseId,
          version,
          mockScenario,
        ),
      }))
      .then(() => {
        setExercises((current) =>
          current.map((item) =>
            item.id === exerciseId && item.type === 'image'
              ? { ...item, image: null }
              : item,
          ),
        );
        trackCompleted('exercise_image_remove', 'image_remove', 'success');
      })
      .catch(() => {
        trackCompleted('exercise_image_remove', 'image_remove', 'error');
        toast.danger('Não foi possível remover a imagem.');
      })
      .finally(() => markSaving(exerciseId, false));
  };

  return (
    <section aria-label="Exercícios" className={styles.editor()}>
      <header className={styles.titleRow()}>
        <div>
          <h1>Treino</h1>
          {editingName ? (
            <TextField
              isInvalid={
                nameDraft.trim().length === 0 || nameDraft.trim().length > 120
              }
            >
              <Label>Nome do treino</Label>
              <Input
                autoFocus
                maxLength={120}
                onChange={(event) => setNameDraft(event.target.value)}
                value={nameDraft}
              />
            </TextField>
          ) : (
            <h2>{workoutName}</h2>
          )}
        </div>
        <div className={styles.inlineActions()}>
          {editingName ? (
            <>
              <Button
                aria-label="Cancelar edição do nome"
                isIconOnly
                onPress={() => {
                  setNameDraft(workoutName);
                  setEditingName(false);
                }}
                size="sm"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
              <Button
                aria-label="Salvar nome do treino"
                isIconOnly
                onPress={saveName}
                size="sm"
              >
                <Check aria-hidden="true" />
              </Button>
            </>
          ) : (
            <Button
              aria-label="Editar nome do treino"
              isIconOnly
              onPress={() => setEditingName(true)}
              size="sm"
              variant="ghost"
            >
              <Pencil aria-hidden="true" />
            </Button>
          )}
        </div>
      </header>
      <header className={styles.exerciseHeader()}>
        <h2>Exercícios</h2>
        <Dropdown>
          <Dropdown.Trigger
            className={styles.addTrigger()}
            isDisabled={queue.paused || exercises.length >= 50}
          >
            <Plus aria-hidden="true" />
            Adicionar
          </Dropdown.Trigger>
          <Dropdown.Popover>
            <Dropdown.Menu
              aria-label="Tipo do exercício"
              items={exerciseTypes}
              onAction={(key) => addExercise(key as ExerciseType)}
            >
              {(item) => (
                <Dropdown.Item id={item.id} textValue={item.label}>
                  {item.label}
                </Dropdown.Item>
              )}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </header>
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={dragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={exercises.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol
            aria-label="Exercícios em ordem"
            className={styles.exerciseList()}
          >
            {exercises.map((exercise) => (
              <ExerciseRow
                exercise={exercise}
                isSaving={savingIds.has(exercise.id)}
                key={exercise.id}
                onDelete={() => deleteExercise(exercise.id)}
                onDraftPendingChange={(pending) =>
                  setDraftIds((current) => {
                    const next = new Set(current);
                    if (pending) next.add(exercise.id);
                    else next.delete(exercise.id);
                    return next;
                  })
                }
                onImageError={(message) => toast.danger(message)}
                onRemoveImage={() => removeImage(exercise.id)}
                onSave={(changes) => saveExercise(exercise.id, changes)}
                onUploadImage={(file) => uploadImage(exercise.id, file)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {queue.isPending ? (
        <p aria-live="polite" className={styles.status()}>
          Alterações sendo salvas em ordem…
        </p>
      ) : null}
    </section>
  );
}

function createTemporaryExercise(type: ExerciseType, id: string): Exercise {
  switch (type) {
    case 'youtube-short':
      return {
        id,
        type,
        name: 'Novo exercício',
        youtubeId: 'ZA8gs8XP2bs',
        bodyArea: 'other',
        restSeconds: 60,
        sets: 3,
        repetitions: 12,
      };
    case 'image':
      return {
        id,
        type,
        name: 'Novo exercício',
        image: null,
        bodyArea: 'other',
        restSeconds: 60,
        sets: 3,
        repetitions: 12,
      };
    case 'youtube-long':
      return {
        id,
        type,
        name: 'Novo exercício',
        youtubeId: '2isq0vuKruE',
        bodyArea: 'other',
      };
    case 'pause':
      return { id, type, restSeconds: 60 };
    case 'duration':
      return {
        id,
        type,
        name: 'Novo exercício',
        bodyArea: 'other',
        durationMinutes: 15,
      };
  }
}
