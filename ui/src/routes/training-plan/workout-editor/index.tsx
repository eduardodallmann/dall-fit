import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
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
  Description,
  Dropdown,
  Input,
  Label,
  Separator,
  TextField,
  toast,
} from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import {
  Check,
  ChevronDown,
  CirclePause,
  Clock,
  FileImage,
  ListPlus,
  Pencil,
  Plus,
  TvMinimalPlay,
  Video,
  X,
} from 'lucide-react';

import type {
  Exercise,
  ExerciseType,
  TrainingPlanWorkoutDetails,
  UpdateExerciseRequest,
} from '@dall-fit/types';

import { trackUiEvent, type AnalyticsControl } from '~/core/analytics';
import { isExpectedCancellation } from '~/core/http/http-error';
import {
  createTrainingPlanExercise,
  deleteTrainingPlanExercise,
  removeTrainingPlanExerciseImage,
  reorderTrainingPlanExercises,
  updateTrainingPlanExercise,
  updateTrainingPlanWorkout,
  uploadTrainingPlanExerciseImage,
  type MockTrainingPlansScenario,
  type TrainingPlanResource,
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
import { ExerciseDragPreview, ExerciseRow } from './exercise-row';
import { workoutEditorStyles } from './styles';
import { useAggregateMutationQueue } from './use-aggregate-mutation-queue';
import {
  reorderCachedExercises,
  replaceCachedExercise,
  synchronizeWorkoutMutation,
} from './workout-cache';

const styles = workoutEditorStyles();
const exerciseTypes = [
  {
    description: 'Vídeo curto com descanso, séries e repetições.',
    icon: Video,
    id: 'youtube-short',
    label: 'YouTube Short',
  },
  {
    description: 'Vídeo longo para orientar a execução do exercício.',
    icon: TvMinimalPlay,
    id: 'youtube-long',
    label: 'YouTube Longo',
  },
  {
    description: 'Exercício ilustrado por uma imagem.',
    icon: FileImage,
    id: 'image',
    label: 'Imagem',
  },
  {
    description: 'Intervalo de descanso entre exercícios.',
    icon: CirclePause,
    id: 'pause',
    label: 'Pausa',
  },
  {
    description: 'Atividade controlada por tempo.',
    icon: Clock,
    id: 'duration',
    label: 'Duração',
  },
] as const satisfies readonly {
  description: string;
  icon: typeof Video;
  id: ExerciseType;
  label: string;
}[];

const dragAnnouncements: Announcements = {
  onDragCancel: () => 'Reordenação cancelada.',
  onDragEnd: ({ over }) =>
    over === null ? 'Reordenação cancelada.' : 'Reordenação finalizada.',
  onDragOver: ({ over }) =>
    over === null ? undefined : 'Nova posição de destino selecionada.',
  onDragStart: () => 'Exercício selecionado para reordenação.',
};

const dragScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'Para iniciar a reordenação, pressione espaço. Use as setas para mover, espaço para confirmar e escape para cancelar.',
};

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
  onImageLoadError: (signedUrlExpiresAt: string) => void;
  onRetryImage: () => void;
  onUnsavedWorkChange?: (hasUnsavedWork: boolean) => void;
  resource?: TrainingPlanResource;
}

export function WorkoutEditor({
  data,
  mockScenario,
  onImageLoadError,
  onRetryImage,
  onUnsavedWorkChange,
  resource = 'global',
}: Readonly<WorkoutEditorProps>) {
  const queryClient = useQueryClient();
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
  const [activeExerciseId, setActiveExerciseId] = useState<string>();
  const dragDirection = useRef(0);
  const focusAfterReorder = useRef<string | undefined>(undefined);
  const queue = useAggregateMutationQueue(data.trainingPlan.id, data.version);
  const queueRef = useRef(queue);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: (event, args) => {
        if (event.code === 'ArrowUp' || event.code === 'ArrowLeft')
          dragDirection.current = -1;
        if (event.code === 'ArrowDown' || event.code === 'ArrowRight')
          dragDirection.current = 1;
        return sortableKeyboardCoordinates(event, args);
      },
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

  useEffect(() => {
    setItems((current) =>
      current.map((item) => {
        if (
          item.temporary ||
          item.draft.type !== 'image' ||
          item.confirmed.type !== 'image' ||
          savingImageIds.has(item.draft.id)
        )
          return item;
        const refreshed = data.exercises.find(
          (exercise) =>
            exercise.id === item.draft.id && exercise.type === 'image',
        );
        if (refreshed?.type !== 'image') return item;
        const result = {
          ...item,
          confirmed: { ...item.confirmed, image: refreshed.image },
          draft: { ...item.draft, image: refreshed.image },
        };
        return result;
      }),
    );
  }, [data.exercises, savingImageIds, setItems]);

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
      let confirmedVersion = data.version;
      void queueRef.current
        .enqueue(async (version) => {
          setItems((current) =>
            updateEditorItem(current, exerciseId, (candidate) => ({
              ...candidate,
              status: 'saving',
            })),
          );
          const result = await updateTrainingPlanExercise(
            data.trainingPlan.id,
            data.id,
            exerciseId,
            submitted,
            version,
            mockScenario,
            resource,
          );
          confirmedVersion = result.version;
          return result;
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
          synchronizeWorkoutMutation(queryClient, {
            mockScenario,
            resource,
            trainingPlanId: data.trainingPlan.id,
            updateWorkout: (workout) => ({
              ...workout,
              exercises: replaceCachedExercise(workout.exercises, saved),
            }),
            version: confirmedVersion,
            workoutId: data.id,
          });
          trackCompleted('exercise_update', 'exercise_field', 'success');
        })
        .catch((error: unknown) => {
          if (isExpectedCancellation(error)) return;
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
      data.version,
      mockScenario,
      queryClient,
      resource,
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
    let confirmedVersion = data.version;
    const promise = queue.enqueue(async (version) => {
      setNameStatus('saving');
      const result = await updateTrainingPlanWorkout(
        data.trainingPlan.id,
        data.id,
        name,
        version,
        mockScenario,
        resource,
      );
      confirmedVersion = result.version;
      return result;
    });
    void promise
      .then((saved) => {
        toast.success('Nome atualizado.');
        setWorkoutName(saved.name);
        setNameDraft(saved.name);
        setNameStatus('idle');
        setEditingName(false);
        synchronizeWorkoutMutation(queryClient, {
          mockScenario,
          resource,
          trainingPlanId: data.trainingPlan.id,
          updateDetail: (detail) => ({
            ...detail,
            workouts: detail.workouts.map((workout) =>
              workout.id === data.id
                ? { ...workout, name: saved.name }
                : workout,
            ),
          }),
          updateWorkout: (workout) => ({
            ...workout,
            name: saved.name,
            updatedAt: saved.updatedAt,
          }),
          version: confirmedVersion,
          workoutId: data.id,
        });
        trackCompleted('workout_update', 'workout_name', 'success');
      })
      .catch((error: unknown) => {
        if (isExpectedCancellation(error)) return;
        toast.danger('Não foi possível salvar o nome.');
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
    let confirmedVersion = data.version;
    void queue
      .enqueue(async (version) => {
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
        const result = await createTrainingPlanExercise(
          data.trainingPlan.id,
          data.id,
          { type },
          version,
          mockScenario,
          resource,
        );
        confirmedVersion = result.version;
        return result;
      })
      .then((created) => {
        setItems((current) =>
          current.map((item) =>
            item.draft.id === temporaryId
              ? createEditorExercise(created)
              : item,
          ),
        );
        synchronizeWorkoutMutation(queryClient, {
          mockScenario,
          resource,
          trainingPlanId: data.trainingPlan.id,
          updateDetail: (detail) => ({
            ...detail,
            workouts: detail.workouts.map((workout) =>
              workout.id === data.id
                ? { ...workout, exerciseCount: workout.exerciseCount + 1 }
                : workout,
            ),
          }),
          updateWorkout: (workout) => ({
            ...workout,
            exercises: [...workout.exercises, created],
          }),
          version: confirmedVersion,
          workoutId: data.id,
        });
        trackCompleted('exercise_create', 'add_exercise', 'success');
      })
      .catch((error: unknown) => {
        if (isExpectedCancellation(error)) return;
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
    let confirmedVersion = data.version;
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
          resource,
        );
        confirmedVersion = nextVersion;
        return { data: undefined, version: nextVersion };
      })
      .then(() => {
        removed.current.delete(exerciseId);
        synchronizeWorkoutMutation(queryClient, {
          mockScenario,
          resource,
          trainingPlanId: data.trainingPlan.id,
          updateDetail: (detail) => ({
            ...detail,
            workouts: detail.workouts.map((workout) =>
              workout.id === data.id
                ? {
                    ...workout,
                    exerciseCount: Math.max(0, workout.exerciseCount - 1),
                  }
                : workout,
            ),
          }),
          updateWorkout: (workout) => ({
            ...workout,
            exercises: workout.exercises.filter(
              (exercise) => exercise.id !== exerciseId,
            ),
          }),
          version: confirmedVersion,
          workoutId: data.id,
        });
        trackCompleted('exercise_delete', 'delete_exercise', 'success');
      })
      .catch((error: unknown) => {
        if (isExpectedCancellation(error)) return;
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

  const dragStart = (event: DragStartEvent) => {
    dragDirection.current = 0;
    setActiveExerciseId(String(event.active.id));
  };

  const dragMove = (event: DragMoveEvent) => {
    const direction = Math.sign(event.delta.y);
    if (direction !== 0) dragDirection.current = direction;
  };

  const dragCancel = (event: DragCancelEvent) => {
    const exerciseId = String(event.active.id);
    dragDirection.current = 0;
    setActiveExerciseId(undefined);
    requestAnimationFrame(() => {
      const selector = `[data-exercise-drag-handle="${CSS.escape(exerciseId)}"]`;
      document.querySelector<HTMLButtonElement>(selector)?.focus();
    });
  };

  const dragEnd = (event: DragEndEvent) => {
    setActiveExerciseId(undefined);
    if (
      structuralPending ||
      queue.paused ||
      event.over === null ||
      itemsRef.current.some((item) => item.temporary)
    )
      return;
    focusAfterReorder.current = String(event.active.id);
    const activeId = String(event.active.id);
    const currentIds = itemsRef.current.map((item) => item.draft.id);
    const activeIndex = currentIds.indexOf(activeId);
    const collisionId = String(event.over.id);
    const keyboardDirection = dragDirection.current;
    dragDirection.current = 0;
    const fallbackIndex = Math.min(
      Math.max(activeIndex + keyboardDirection, 0),
      currentIds.length - 1,
    );
    const overId =
      collisionId === activeId &&
      event.activatorEvent instanceof KeyboardEvent &&
      keyboardDirection !== 0
        ? (currentIds[fallbackIndex] ?? activeId)
        : collisionId;
    if (activeId === overId) return;
    let previousIds: readonly string[] | undefined;
    let confirmedIds: readonly string[] | undefined;
    let confirmedVersion = data.version;
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
        confirmedIds = orderedIds;
        setItems(() => ordered);
        const nextVersion = await reorderTrainingPlanExercises(
          data.trainingPlan.id,
          data.id,
          { exerciseIds: orderedIds },
          version,
          mockScenario,
          resource,
        );
        confirmedVersion = nextVersion;
        return { data: undefined, version: nextVersion };
      })
      .then(() => {
        if (confirmedIds !== undefined)
          synchronizeWorkoutMutation(queryClient, {
            mockScenario,
            resource,
            trainingPlanId: data.trainingPlan.id,
            updateWorkout: (workout) => ({
              ...workout,
              exercises: reorderCachedExercises(
                workout.exercises,
                confirmedIds ?? [],
              ),
            }),
            version: confirmedVersion,
            workoutId: data.id,
          });
        trackCompleted('exercise_reorder', 'reorder_handle', 'success');
      })
      .catch((error: unknown) => {
        if (isExpectedCancellation(error)) return;
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
    let confirmedVersion = data.version;
    void queue
      .enqueue(async (version) => {
        const result = await uploadTrainingPlanExerciseImage(
          data.trainingPlan.id,
          data.id,
          exerciseId,
          file,
          version,
          mockScenario,
          resource,
        );
        confirmedVersion = result.version;
        return result;
      })
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
        synchronizeWorkoutMutation(queryClient, {
          mockScenario,
          resource,
          trainingPlanId: data.trainingPlan.id,
          updateWorkout: (workout) => ({
            ...workout,
            exercises: workout.exercises.map((exercise) =>
              exercise.id === exerciseId && exercise.type === 'image'
                ? { ...exercise, image }
                : exercise,
            ),
          }),
          version: confirmedVersion,
          workoutId: data.id,
        });
        trackCompleted(operation, control, 'success');
      })
      .catch((error: unknown) => {
        if (isExpectedCancellation(error)) return;
        trackCompleted(operation, control, 'error');
        toast.danger('Não foi possível processar a imagem.');
      })
      .finally(() => markSavingImage(exerciseId, false));
  };

  const removeImage = (exerciseId: string) => {
    if (queue.paused) return;
    markSavingImage(exerciseId, true);
    trackStarted('exercise_image_remove', 'image_remove');
    let confirmedVersion = data.version;
    void queue
      .enqueue(async (version) => {
        const nextVersion = await removeTrainingPlanExerciseImage(
          data.trainingPlan.id,
          data.id,
          exerciseId,
          version,
          mockScenario,
          resource,
        );
        confirmedVersion = nextVersion;
        return { data: undefined, version: nextVersion };
      })
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
        synchronizeWorkoutMutation(queryClient, {
          mockScenario,
          resource,
          trainingPlanId: data.trainingPlan.id,
          updateWorkout: (workout) => ({
            ...workout,
            exercises: workout.exercises.map((exercise) =>
              exercise.id === exerciseId && exercise.type === 'image'
                ? { ...exercise, image: null }
                : exercise,
            ),
          }),
          version: confirmedVersion,
          workoutId: data.id,
        });
        trackCompleted('exercise_image_remove', 'image_remove', 'success');
      })
      .catch((error: unknown) => {
        if (isExpectedCancellation(error)) return;
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
  useLayoutEffect(() => {
    onUnsavedWorkChange?.(hasUnsavedWork);
    return () => onUnsavedWorkChange?.(false);
  }, [hasUnsavedWork, onUnsavedWorkChange]);
  const navigationBlocker = useBlocker({
    disabled: !hasUnsavedWork,
    enableBeforeUnload: hasUnsavedWork,
    shouldBlockFn: () => true,
    withResolver: true,
  });

  const structureDisabled = structuralPending || queue.paused;
  const namePending = nameStatus === 'queued' || nameStatus === 'saving';
  const activeExercise = items.find(
    (item) => item.draft.id === activeExerciseId,
  )?.draft;

  return (
    <section aria-label="Exercícios" className={styles.editor()}>
      <header className={styles.titleGroup()}>
        <p className={styles.contextLabel()}>Treino</p>
        <div className={styles.titleRow()}>
          {editingName ? (
            <div className={styles.nameEditor()}>
              <h1 className={styles.srOnly()}>{workoutName}</h1>
              <TextField
                aria-label="Nome do treino"
                isDisabled={namePending}
                isInvalid={
                  nameDraft.trim().length === 0 || nameDraft.trim().length > 120
                }
              >
                <Input
                  aria-label="Nome do treino"
                  autoFocus
                  maxLength={120}
                  onChange={(event) => {
                    setNameDraft(event.target.value);
                    if (nameStatus === 'error') setNameStatus('idle');
                  }}
                  value={nameDraft}
                />
              </TextField>
            </div>
          ) : (
            <h1 className={styles.pageTitle()}>{workoutName}</h1>
          )}
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
        </div>
        {nameStatus === 'error' ? (
          <p className={styles.status()} role="alert">
            Não foi possível salvar o nome. O rascunho foi preservado.
          </p>
        ) : null}
      </header>
      <header className={styles.exerciseHeader()}>
        <h2 className={styles.sectionTitle()}>Exercícios</h2>
      </header>
      <DndContext
        accessibility={{
          announcements: dragAnnouncements,
          screenReaderInstructions: dragScreenReaderInstructions,
        }}
        collisionDetection={closestCenter}
        onDragCancel={dragCancel}
        onDragEnd={dragEnd}
        onDragMove={dragMove}
        onDragStart={dragStart}
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
                onImageLoadError={onImageLoadError}
                onRemoveImage={() => removeImage(item.draft.id)}
                onRetry={() => saveExercise(item.draft.id)}
                onRetryImage={onRetryImage}
                onUploadImage={(file) => uploadImage(item.draft.id, file)}
                status={item.status}
              />
            ))}
          </ol>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeExercise === undefined ? null : (
            <ExerciseDragPreview exercise={activeExercise} />
          )}
        </DragOverlay>
      </DndContext>
      {items.length === 0 ? (
        <div aria-live="polite" className={styles.emptyState()}>
          <ListPlus aria-hidden="true" className={styles.emptyIcon()} />
          <div className={styles.emptyContent()}>
            <h3 className={styles.emptyTitle()}>Nenhum exercício</h3>
            <p className={styles.emptyDescription()}>
              Adicione o primeiro exercício para começar a montar este treino.
            </p>
          </div>
        </div>
      ) : null}
      <div className={styles.addExerciseRow()}>
        <Separator className={styles.addSeparator()} />
        <Dropdown>
          <Dropdown.Trigger
            className={styles.addTrigger()}
            isDisabled={structureDisabled || items.length >= 50}
          >
            <Plus aria-hidden="true" />
            Adicionar exercício
            <ChevronDown aria-hidden="true" className={styles.addIndicator()} />
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom">
            <Dropdown.Menu
              aria-label="Tipo do exercício"
              items={exerciseTypes}
              onAction={(key) => addExercise(key as ExerciseType)}
            >
              {(item) => {
                const Icon = item.icon;
                return (
                  <Dropdown.Item id={item.id} textValue={item.label}>
                    <Icon aria-hidden="true" className={styles.typeIcon()} />
                    <div className={styles.typeDescription()}>
                      <Label>{item.label}</Label>
                      <Description>{item.description}</Description>
                    </div>
                  </Dropdown.Item>
                );
              }}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        <Separator className={styles.addSeparator()} />
      </div>
      {queue.isPending ? (
        <span aria-live="polite" className={styles.srOnly()}>
          Alterações sendo salvas em ordem…
        </span>
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
