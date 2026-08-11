import { useCallback, useEffect, useRef, useState } from 'react';

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
  AlertDialog,
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

import {
  createEditorExercise,
  insertEditorItem,
  mergeExercise,
  mergeSavedExercise,
  orderEditorItems,
  updateEditorItem,
  type EditorExercise,
  type ExerciseSaveStatus,
  type RemovedExercise,
} from './editor-state';
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
  const initialItems = data.exercises.map(createEditorExercise);
  const [items, setItemsState] =
    useState<readonly EditorExercise[]>(initialItems);
  const itemsRef = useRef<readonly EditorExercise[]>(initialItems);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const removed = useRef(new Map<string, RemovedExercise>());
  const revision = useRef(0);
  const saveExerciseRef = useRef<(exerciseId: string) => void>(() => undefined);
  const [workoutName, setWorkoutName] = useState(data.name);
  const [nameDraft, setNameDraft] = useState(data.name);
  const [nameStatus, setNameStatus] = useState<ExerciseSaveStatus>('idle');
  const [editingName, setEditingName] = useState(false);
  const [savingImageIds, setSavingImageIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [structuralPending, setStructuralPending] = useState(false);
  const focusAfterReorder = useRef<string | undefined>(undefined);
  const queue = useAggregateMutationQueue(
    data.trainingPlan.id,
    data.version,
    onConflict,
  );
  const queueRef = useRef(queue);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    const exerciseId = focusAfterReorder.current;
    if (structuralPending || exerciseId === undefined) return;
    focusAfterReorder.current = undefined;
    requestAnimationFrame(() => {
      const selector = `[data-exercise-drag-handle="${CSS.escape(exerciseId)}"]`;
      const handle = document.querySelector<HTMLButtonElement>(selector);
      handle?.focus();
    });
  }, [structuralPending]);

  const setItems = useCallback(
    (
      updater: (
        current: readonly EditorExercise[],
      ) => readonly EditorExercise[],
    ) => {
      setItemsState((current) => {
        const next = updater(current);
        itemsRef.current = next;
        return next;
      });
    },
    [],
  );

  const clearTimer = useCallback((exerciseId: string) => {
    const timer = timers.current.get(exerciseId);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(exerciseId);
  }, []);
  const clearAllTimers = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);

  const scheduleTimer = useCallback(
    (exerciseId: string) => {
      clearTimer(exerciseId);
      timers.current.set(
        exerciseId,
        setTimeout(() => {
          timers.current.delete(exerciseId);
          saveExerciseRef.current(exerciseId);
        }, 3000),
      );
    },
    [clearTimer],
  );

  useEffect(() => () => clearAllTimers(), [clearAllTimers]);
  useEffect(() => {
    if (!queue.paused) return;
    clearAllTimers();
  }, [clearAllTimers, queue.paused]);

  const saveExercise = useCallback(
    (exerciseId: string) => {
      const item = itemsRef.current.find(
        (candidate) => candidate.draft.id === exerciseId,
      );
      if (
        item === undefined ||
        item.temporary ||
        queueRef.current.paused ||
        Object.keys(item.dirty).length === 0 ||
        item.status === 'queued' ||
        item.status === 'saving'
      )
        return;

      clearTimer(exerciseId);
      const submitted = { ...item.dirty };
      const submittedRevisions = Object.fromEntries(
        Object.keys(submitted).map((field) => [field, item.revisions[field]]),
      );
      setItems((current) =>
        updateEditorItem(current, exerciseId, (candidate) => ({
          ...candidate,
          status: 'queued',
        })),
      );
      trackStarted('exercise_update', 'exercise_field');
      void queueRef.current
        .enqueue((version) => {
          setItems((current) =>
            updateEditorItem(current, exerciseId, (candidate) => ({
              ...candidate,
              status: 'saving',
            })),
          );
          return updateTrainingPlanExercise(
            data.trainingPlan.id,
            data.id,
            exerciseId,
            submitted,
            version,
            mockScenario,
          );
        })
        .then((saved) => {
          let shouldSchedule = false;
          setItems((current) =>
            updateEditorItem(current, exerciseId, (candidate) => {
              const next = mergeSavedExercise(
                candidate,
                saved,
                submittedRevisions,
              );
              shouldSchedule = Object.keys(next.dirty).length > 0;
              return next;
            }),
          );
          const removedEntry = removed.current.get(exerciseId);
          if (removedEntry !== undefined) {
            removed.current.set(exerciseId, {
              ...removedEntry,
              item: mergeSavedExercise(
                removedEntry.item,
                saved,
                submittedRevisions,
              ),
            });
          }
          if (shouldSchedule && !queueRef.current.paused)
            scheduleTimer(exerciseId);
          trackCompleted('exercise_update', 'exercise_field', 'success');
        })
        .catch(() => {
          setItems((current) =>
            updateEditorItem(current, exerciseId, (candidate) => ({
              ...candidate,
              status: 'error',
            })),
          );
          const removedEntry = removed.current.get(exerciseId);
          if (removedEntry !== undefined) {
            removed.current.set(exerciseId, {
              ...removedEntry,
              item: { ...removedEntry.item, status: 'error' },
            });
          }
          trackCompleted('exercise_update', 'exercise_field', 'error');
          toast.danger(
            'Não foi possível salvar o exercício. O rascunho foi preservado.',
          );
        });
    },
    [
      clearTimer,
      data.id,
      data.trainingPlan.id,
      mockScenario,
      scheduleTimer,
      setItems,
    ],
  );
  useEffect(() => {
    saveExerciseRef.current = saveExercise;
  }, [saveExercise]);

  const changeExercise = (
    exerciseId: string,
    changes: UpdateExerciseRequest,
  ) => {
    const fieldRevisions: Record<string, number> = {};
    for (const field of Object.keys(changes)) {
      revision.current += 1;
      fieldRevisions[field] = revision.current;
    }
    setItems((current) =>
      updateEditorItem(current, exerciseId, (item) => ({
        ...item,
        dirty: { ...item.dirty, ...changes },
        draft: mergeExercise(item.draft, changes),
        revisions: { ...item.revisions, ...fieldRevisions },
        status: 'debouncing',
      })),
    );
    if (!queue.paused) scheduleTimer(exerciseId);
  };

  const saveName = () => {
    const name = nameDraft.trim();
    if (
      name.length === 0 ||
      name.length > 120 ||
      queue.paused ||
      nameStatus === 'queued' ||
      nameStatus === 'saving'
    )
      return;
    setNameStatus('queued');
    trackStarted('workout_update', 'workout_name');
    const promise = queue.enqueue((version) => {
      setNameStatus('saving');
      return updateTrainingPlanWorkout(
        data.trainingPlan.id,
        data.id,
        name,
        version,
        mockScenario,
      );
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
        setNameStatus('idle');
        setEditingName(false);
        trackCompleted('workout_update', 'workout_name', 'success');
      })
      .catch(() => {
        setNameStatus('error');
        setEditingName(true);
        trackCompleted('workout_update', 'workout_name', 'error');
      });
  };

  const markSavingImage = (id: string, saving: boolean) =>
    setSavingImageIds((current) => {
      const next = new Set(current);
      if (saving) next.add(id);
      else next.delete(id);
      return next;
    });

  const addExercise = (type: ExerciseType) => {
    if (structuralPending || queue.paused) return;
    const temporaryId = `temporary-${crypto.randomUUID()}`;
    const temporary = createTemporaryExercise(type, temporaryId);
    setStructuralPending(true);
    trackStarted('exercise_create', 'add_exercise');
    void queue
      .enqueue((version) => {
        setItems((current) => [
          ...current,
          {
            confirmed: temporary,
            dirty: {},
            draft: temporary,
            revisions: {},
            status: 'saving',
            temporary: true,
          },
        ]);
        return createTrainingPlanExercise(
          data.trainingPlan.id,
          data.id,
          { type },
          version,
          mockScenario,
        );
      })
      .then((created) => {
        setItems((current) =>
          current.map((item) =>
            item.draft.id === temporaryId
              ? createEditorExercise(created)
              : item,
          ),
        );
        trackCompleted('exercise_create', 'add_exercise', 'success');
      })
      .catch(() => {
        setItems((current) =>
          current.filter((item) => item.draft.id !== temporaryId),
        );
        trackCompleted('exercise_create', 'add_exercise', 'error');
        toast.danger('Não foi possível adicionar o exercício.');
      })
      .finally(() => setStructuralPending(false));
  };

  const deleteExercise = (exerciseId: string) => {
    if (structuralPending || queue.paused) return;
    const index = itemsRef.current.findIndex(
      (item) => item.draft.id === exerciseId,
    );
    const item = itemsRef.current[index];
    if (item === undefined || item.temporary) return;
    clearTimer(exerciseId);
    setStructuralPending(true);
    trackStarted('exercise_delete', 'delete_exercise');
    void queue
      .enqueue(async (version) => {
        clearTimer(exerciseId);
        const currentIndex = itemsRef.current.findIndex(
          (candidate) => candidate.draft.id === exerciseId,
        );
        const currentItem = itemsRef.current[currentIndex];
        if (currentItem === undefined || currentItem.temporary)
          throw new Error('Exercise is unavailable for deletion.');
        removed.current.set(exerciseId, {
          index: currentIndex,
          item: currentItem,
        });
        setItems((current) =>
          current.filter((candidate) => candidate.draft.id !== exerciseId),
        );
        const nextVersion = await deleteTrainingPlanExercise(
          data.trainingPlan.id,
          data.id,
          exerciseId,
          version,
          mockScenario,
        );
        return { data: undefined, version: nextVersion };
      })
      .then(() => {
        removed.current.delete(exerciseId);
        trackCompleted('exercise_delete', 'delete_exercise', 'success');
      })
      .catch(() => {
        const rollback = removed.current.get(exerciseId);
        if (rollback !== undefined) {
          const recoverable =
            Object.keys(rollback.item.dirty).length === 0
              ? rollback
              : {
                  ...rollback,
                  item: { ...rollback.item, status: 'error' as const },
                };
          setItems((current) => insertEditorItem(current, recoverable));
          removed.current.delete(exerciseId);
        }
        trackCompleted('exercise_delete', 'delete_exercise', 'error');
        toast.danger('Não foi possível excluir o exercício.');
      })
      .finally(() => setStructuralPending(false));
  };

  const dragEnd = (event: DragEndEvent) => {
    if (
      structuralPending ||
      queue.paused ||
      event.over === null ||
      event.active.id === event.over.id ||
      itemsRef.current.some((item) => item.temporary)
    )
      return;
    focusAfterReorder.current = String(event.active.id);
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    let previousIds: readonly string[] | undefined;
    setStructuralPending(true);
    trackStarted('exercise_reorder', 'reorder_handle');
    void queue
      .enqueue(async (version) => {
        const currentItems = itemsRef.current;
        if (currentItems.some((item) => item.temporary))
          throw new Error('Temporary exercise cannot be reordered.');
        previousIds = currentItems.map((item) => item.draft.id);
        const oldIndex = previousIds.indexOf(activeId);
        const newIndex = previousIds.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0)
          throw new Error('Exercise order target is unavailable.');
        const ordered = arrayMove([...currentItems], oldIndex, newIndex);
        const orderedIds = ordered.map((item) => item.draft.id);
        setItems(() => ordered);
        const nextVersion = await reorderTrainingPlanExercises(
          data.trainingPlan.id,
          data.id,
          { exerciseIds: orderedIds },
          version,
          mockScenario,
        );
        return { data: undefined, version: nextVersion };
      })
      .then(() =>
        trackCompleted('exercise_reorder', 'reorder_handle', 'success'),
      )
      .catch(() => {
        if (previousIds !== undefined)
          setItems((current) => orderEditorItems(current, previousIds ?? []));
        trackCompleted('exercise_reorder', 'reorder_handle', 'error');
        toast.danger('Não foi possível reordenar os exercícios.');
      })
      .finally(() => setStructuralPending(false));
  };

  const uploadImage = (exerciseId: string, file: File) => {
    if (queue.paused) return;
    markSavingImage(exerciseId, true);
    const replacing = itemsRef.current.some(
      (item) =>
        item.draft.id === exerciseId &&
        item.draft.type === 'image' &&
        item.draft.image !== null,
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
        setItems((current) =>
          updateEditorItem(current, exerciseId, (item) =>
            item.draft.type === 'image' && item.confirmed.type === 'image'
              ? {
                  ...item,
                  confirmed: { ...item.confirmed, image },
                  draft: { ...item.draft, image },
                }
              : item,
          ),
        );
        trackCompleted(operation, control, 'success');
      })
      .catch(() => {
        trackCompleted(operation, control, 'error');
        toast.danger('Não foi possível processar a imagem.');
      })
      .finally(() => markSavingImage(exerciseId, false));
  };

  const removeImage = (exerciseId: string) => {
    if (queue.paused) return;
    markSavingImage(exerciseId, true);
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
        setItems((current) =>
          updateEditorItem(current, exerciseId, (item) =>
            item.draft.type === 'image' && item.confirmed.type === 'image'
              ? {
                  ...item,
                  confirmed: { ...item.confirmed, image: null },
                  draft: { ...item.draft, image: null },
                }
              : item,
          ),
        );
        trackCompleted('exercise_image_remove', 'image_remove', 'success');
      })
      .catch(() => {
        trackCompleted('exercise_image_remove', 'image_remove', 'error');
        toast.danger('Não foi possível remover a imagem.');
      })
      .finally(() => markSavingImage(exerciseId, false));
  };

  const hasUnsavedWork =
    structuralPending ||
    queue.isPending ||
    nameStatus !== 'idle' ||
    (editingName && nameDraft !== workoutName) ||
    items.some(
      (item) =>
        item.temporary ||
        item.status !== 'idle' ||
        Object.keys(item.dirty).length > 0,
    );
  const navigationBlocker = useBlocker({
    disabled: !hasUnsavedWork,
    enableBeforeUnload: hasUnsavedWork,
    shouldBlockFn: () => true,
    withResolver: true,
  });

  const structureDisabled = structuralPending || queue.paused;
  const namePending = nameStatus === 'queued' || nameStatus === 'saving';

  return (
    <section aria-label="Exercícios" className={styles.editor()}>
      <header className={styles.titleRow()}>
        <div>
          <h1>Treino</h1>
          {editingName ? (
            <TextField
              isDisabled={namePending}
              isInvalid={
                nameDraft.trim().length === 0 || nameDraft.trim().length > 120
              }
            >
              <Label>Nome do treino</Label>
              <Input
                autoFocus
                maxLength={120}
                onChange={(event) => {
                  setNameDraft(event.target.value);
                  if (nameStatus === 'error') setNameStatus('idle');
                }}
                value={nameDraft}
              />
            </TextField>
          ) : (
            <h2>{workoutName}</h2>
          )}
          {nameStatus === 'error' ? (
            <p className={styles.status()} role="alert">
              Não foi possível salvar o nome. O rascunho foi preservado.
            </p>
          ) : null}
        </div>
        <div className={styles.inlineActions()}>
          {editingName ? (
            <>
              <Button
                aria-label="Cancelar edição do nome"
                isDisabled={namePending}
                isIconOnly
                onPress={() => {
                  setNameDraft(workoutName);
                  setNameStatus('idle');
                  setEditingName(false);
                }}
                size="sm"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
              <Button
                aria-label="Salvar nome do treino"
                isDisabled={queue.paused}
                isIconOnly
                isPending={namePending}
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
            isDisabled={structureDisabled || items.length >= 50}
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
          items={items.map((item) => item.draft.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol
            aria-label="Exercícios em ordem"
            className={styles.exerciseList()}
          >
            {items.map((item) => (
              <ExerciseRow
                exercise={item.draft}
                isDisabled={item.temporary}
                isSavingImage={savingImageIds.has(item.draft.id)}
                isStructureDisabled={structureDisabled}
                key={item.draft.id}
                onChange={(changes) => changeExercise(item.draft.id, changes)}
                onDelete={() => deleteExercise(item.draft.id)}
                onImageError={(message) => toast.danger(message)}
                onRemoveImage={() => removeImage(item.draft.id)}
                onRetry={() => saveExercise(item.draft.id)}
                onUploadImage={(file) => uploadImage(item.draft.id, file)}
                status={item.status}
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
      <AlertDialog
        isOpen={navigationBlocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open && navigationBlocker.status === 'blocked')
            navigationBlocker.reset();
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Heading>
                  Descartar alterações locais?
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                Há alterações ainda não enviadas. Deseja sair e descartá-las?
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  onPress={() => {
                    if (navigationBlocker.status === 'blocked')
                      navigationBlocker.reset();
                  }}
                  variant="secondary"
                >
                  Permanecer
                </Button>
                <Button
                  onPress={() => {
                    if (navigationBlocker.status !== 'blocked') return;
                    clearAllTimers();
                    navigationBlocker.proceed();
                  }}
                  variant="danger"
                >
                  Sair e descartar
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
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
