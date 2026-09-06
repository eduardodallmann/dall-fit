import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';

import { useSortable } from '@dnd-kit/sortable';
import {
  Button,
  Chip,
  Input,
  Label,
  ListBox,
  NumberField,
  Popover,
  Select,
  Spinner,
  TextField,
} from '@heroui/react';
import { GripVertical, RotateCcw, Trash2 } from 'lucide-react';

import {
  BODY_AREAS,
  type BodyArea,
  type Exercise,
  type UpdateExerciseRequest,
} from '@dall-fit/types';

import { trackUiEvent } from '~/core/analytics';
import { ImageFilePicker } from '~/core/components/image-file-picker';
import {
  bodyAreaLabels,
  exerciseTypeIcons,
  exerciseTypeLabels,
} from '~/routes/training-plan/exercise-presentation';
import { ExerciseVideoPreview } from '~/routes/training-plan/exercise-video-preview';

import type { ExerciseSaveStatus } from './editor-state';
import { workoutEditorStyles } from './styles';

const styles = workoutEditorStyles();

interface ExerciseRowProps {
  exercise: Exercise;
  isDisabled: boolean;
  isSavingImage: boolean;
  isStructureDisabled: boolean;
  onChange: (changes: UpdateExerciseRequest) => void;
  onDelete: () => void;
  onImageError: (message: string) => void;
  onImageLoadError: (signedUrlExpiresAt: string) => void;
  onRemoveImage: () => void;
  onRetry: () => void;
  onRetryImage: () => void;
  onUploadImage: (file: File) => void;
  status: ExerciseSaveStatus;
}

type ExerciseFieldProps = Readonly<
  Pick<
    ExerciseRowProps,
    | 'exercise'
    | 'isDisabled'
    | 'isSavingImage'
    | 'isStructureDisabled'
    | 'onChange'
    | 'onImageError'
    | 'onImageLoadError'
    | 'onRemoveImage'
    | 'onRetryImage'
    | 'onUploadImage'
  >
>;

export function ExerciseRow({
  exercise,
  isDisabled,
  isSavingImage,
  isStructureDisabled,
  onChange,
  onDelete,
  onImageError,
  onImageLoadError,
  onRemoveImage,
  onRetry,
  onRetryImage,
  onUploadImage,
  status,
}: Readonly<ExerciseRowProps>) {
  const isSaving = status === 'queued' || status === 'saving';
  const nodeRef = useRef<HTMLLIElement | null>(null);
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    disabled: isDisabled || isStructureDisabled,
    id: exercise.id,
  });
  const setSortableNodeRef = useCallback(
    (node: HTMLLIElement | null) => {
      nodeRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (node === null) return;
    node.style.transform =
      transform === null
        ? ''
        : `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`;
    node.style.transition = transition ?? '';
  }, [transform, transition]);

  return (
    <li
      className={styles.exerciseItem({ isDragging })}
      ref={setSortableNodeRef}
    >
      <ExerciseCardHeader
        exercise={exercise}
        handle={
          <button
            aria-label={`Mover ${exerciseTypeLabels[exercise.type]}`}
            className={styles.handle()}
            data-exercise-drag-handle={exercise.id}
            disabled={isDisabled || isStructureDisabled}
            type="button"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" />
          </button>
        }
      >
        <div className={styles.exerciseActions()}>
          <Chip>{exerciseTypeLabels[exercise.type]}</Chip>
          {status === 'error' ? (
            <Button
              isDisabled={isDisabled || isStructureDisabled}
              onPress={onRetry}
              size="sm"
              variant="secondary"
            >
              <RotateCcw aria-hidden="true" />
              Tentar novamente
            </Button>
          ) : null}
          <div className={styles.deleteSlot()}>
            {isSaving || isSavingImage ? (
              <Spinner aria-label="Salvando exercício" size="sm" />
            ) : (
              <Popover>
                <Button
                  aria-label={`Excluir ${exerciseTypeLabels[exercise.type]}`}
                  isDisabled={isDisabled || isStructureDisabled}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
                <Popover.Content placement="bottom end">
                  <Popover.Dialog
                    aria-label={`Confirmar exclusão de ${exerciseTypeLabels[exercise.type]}`}
                  >
                    <Button onPress={onDelete} variant="danger">
                      Confirmar exclusão
                    </Button>
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
            )}
          </div>
        </div>
      </ExerciseCardHeader>
      <ExerciseFields
        exercise={exercise}
        isDisabled={isDisabled}
        isSavingImage={isSavingImage}
        isStructureDisabled={isStructureDisabled}
        onChange={onChange}
        onImageError={onImageError}
        onImageLoadError={onImageLoadError}
        onRemoveImage={onRemoveImage}
        onRetryImage={onRetryImage}
        onUploadImage={onUploadImage}
      />
      {status === 'error' ? (
        <p className={styles.status()} role="alert">
          Não foi possível salvar. O rascunho foi preservado.
        </p>
      ) : null}
    </li>
  );
}

export function ExerciseDragPreview({
  exercise,
}: Readonly<{ exercise: Exercise }>) {
  return (
    <div
      aria-hidden="true"
      className={styles.dragPreview()}
      data-drag-preview="true"
    >
      <ExerciseCardHeader
        exercise={exercise}
        handle={
          <span className={styles.handle()}>
            <GripVertical aria-hidden="true" />
          </span>
        }
      >
        <Chip>{exerciseTypeLabels[exercise.type]}</Chip>
      </ExerciseCardHeader>
      {'name' in exercise ? (
        <p className={styles.dragPreviewName()}>{exercise.name}</p>
      ) : null}
    </div>
  );
}

function ExerciseCardHeader({
  children,
  exercise,
  handle,
}: Readonly<{
  children: ReactNode;
  exercise: Exercise;
  handle: ReactNode;
}>) {
  const TypeIcon = exerciseTypeIcons[exercise.type];
  return (
    <div className={styles.cardHeader()}>
      <div className={styles.cardIdentity()}>
        {handle}
        <TypeIcon aria-hidden="true" className={styles.exerciseTypeIcon()} />
      </div>
      {children}
    </div>
  );
}

function ExerciseFields({
  exercise,
  isDisabled,
  isSavingImage,
  isStructureDisabled,
  onChange,
  onImageError,
  onImageLoadError,
  onRemoveImage,
  onRetryImage,
  onUploadImage,
}: ExerciseFieldProps) {
  const hasInformationFields = 'name' in exercise;
  const hasNumericFields =
    'restSeconds' in exercise || 'durationMinutes' in exercise;

  return (
    <div className={styles.exerciseFields()}>
      {hasInformationFields ? (
        <ExerciseInformationFields
          exercise={exercise}
          isDisabled={isDisabled}
          isSavingImage={isSavingImage}
          isStructureDisabled={isStructureDisabled}
          onChange={onChange}
          onImageError={onImageError}
          onImageLoadError={onImageLoadError}
          onRemoveImage={onRemoveImage}
          onRetryImage={onRetryImage}
          onUploadImage={onUploadImage}
        />
      ) : null}
      {hasNumericFields ? (
        <ExerciseNumericFields
          exercise={exercise}
          isDisabled={isDisabled}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}

function ExerciseInformationFields({
  exercise,
  isDisabled,
  isSavingImage,
  isStructureDisabled,
  onChange,
  onImageError,
  onImageLoadError,
  onRemoveImage,
  onRetryImage,
  onUploadImage,
}: ExerciseFieldProps) {
  if (!('name' in exercise)) return null;
  const nameField = (
    <TextInput
      className={styles.flexibleField()}
      isDisabled={isDisabled}
      label="Nome"
      maxLength={40}
      onChange={(name) => onChange({ name })}
      value={exercise.name}
    />
  );
  return (
    <div className={styles.informationFields()}>
      {exercise.type === 'image' ? (
        <div className={styles.nameMediaGroup()}>
          {nameField}
          <div className={styles.mediaRegion()}>
            <ImageFilePicker
              displayImageUrl={exercise.image?.displayUrl}
              imageUrl={exercise.image?.thumbnailUrl}
              isDisabled={isDisabled || isStructureDisabled}
              isPending={isSavingImage}
              label={`Imagem de ${exercise.name}`}
              onImageLoadError={() => {
                if (exercise.image !== null)
                  onImageLoadError(exercise.image.signedUrlExpiresAt);
              }}
              onError={onImageError}
              onPreviewClose={(reason) => {
                trackUiEvent({
                  control: 'image_preview',
                  eventName: 'ui_overlay_closed',
                  overlay: 'exercise_image_preview',
                  reason,
                  surface: 'workout',
                });
              }}
              onPreviewOpen={() => {
                trackUiEvent({
                  control: 'image_preview',
                  eventName: 'ui_overlay_opened',
                  overlay: 'exercise_image_preview',
                  surface: 'workout',
                });
              }}
              onRemove={exercise.image === null ? undefined : onRemoveImage}
              onRetry={onRetryImage}
              onSelect={onUploadImage}
              previewTitle={exercise.name}
            />
          </div>
        </div>
      ) : (
        nameField
      )}
      {exercise.type === 'youtube-long' || exercise.type === 'youtube-short' ? (
        <div className={styles.videoMediaGroup()}>
          <TextInput
            className={styles.flexibleField()}
            isDisabled={isDisabled}
            label="Vídeo (ID)"
            maxLength={2048}
            onChange={(youtubeId) => onChange({ youtubeId })}
            value={exercise.youtubeId}
          />
          <div className={styles.videoMediaRegion()}>
            <ExerciseVideoPreview
              exerciseName={exercise.name}
              isDisabled={isDisabled || isStructureDisabled}
              orientation={
                exercise.type === 'youtube-short' ? 'vertical' : 'horizontal'
              }
              youtubeId={exercise.youtubeId}
            />
          </div>
        </div>
      ) : null}
      <BodyAreaSelect
        className={styles.bodyAreaField()}
        isDisabled={isDisabled}
        onChange={(bodyArea) => onChange({ bodyArea })}
        value={exercise.bodyArea}
      />
    </div>
  );
}

function ExerciseNumericFields({
  exercise,
  isDisabled,
  onChange,
}: Pick<ExerciseFieldProps, 'exercise' | 'isDisabled' | 'onChange'>) {
  return (
    <div className={styles.numericFields()}>
      {'restSeconds' in exercise ? (
        <NumericInput
          className={styles.numericField()}
          isDisabled={isDisabled}
          label="Descanso (s)"
          max={3600}
          min={exercise.type === 'pause' ? 1 : 0}
          onChange={(restSeconds) => onChange({ restSeconds })}
          value={exercise.restSeconds}
        />
      ) : null}
      {'sets' in exercise ? (
        <NumericInput
          className={styles.numericField()}
          isDisabled={isDisabled}
          label="Séries"
          max={100}
          min={1}
          onChange={(sets) => onChange({ sets })}
          value={exercise.sets}
        />
      ) : null}
      {'repetitions' in exercise ? (
        <NumericInput
          className={styles.numericField()}
          isDisabled={isDisabled}
          label="Repetições"
          max={1000}
          min={1}
          onChange={(repetitions) => onChange({ repetitions })}
          value={exercise.repetitions}
        />
      ) : null}
      {'durationMinutes' in exercise ? (
        <NumericInput
          className={styles.numericField()}
          isDisabled={isDisabled}
          label="Duração (min)"
          max={1440}
          min={1}
          onChange={(durationMinutes) => onChange({ durationMinutes })}
          value={exercise.durationMinutes}
        />
      ) : null}
    </div>
  );
}

function TextInput({
  className,
  isDisabled,
  label,
  maxLength,
  onChange,
  value,
}: Readonly<{
  className?: string;
  isDisabled: boolean;
  label: string;
  maxLength: number;
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <TextField className={className} isDisabled={isDisabled}>
      <Label>{label}</Label>
      <Input
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </TextField>
  );
}

function NumericInput({
  className,
  isDisabled,
  label,
  max,
  min,
  onChange,
  value,
}: Readonly<{
  className?: string;
  isDisabled: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}>) {
  return (
    <NumberField
      className={className}
      isDisabled={isDisabled}
      maxValue={max}
      minValue={min}
      onChange={onChange}
      value={value}
    >
      <Label>{label}</Label>
      <NumberField.Group>
        <NumberField.DecrementButton />
        <NumberField.Input />
        <NumberField.IncrementButton />
      </NumberField.Group>
    </NumberField>
  );
}

function BodyAreaSelect({
  className,
  isDisabled,
  onChange,
  value,
}: Readonly<{
  className?: string;
  isDisabled: boolean;
  onChange: (value: BodyArea) => void;
  value: BodyArea;
}>) {
  return (
    <Select
      className={className}
      isDisabled={isDisabled}
      onChange={(key) => {
        if (typeof key === 'string') onChange(key as BodyArea);
      }}
      value={value}
    >
      <Label>Local do corpo</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox
          items={BODY_AREAS.map((id) => ({ id, label: bodyAreaLabels[id] }))}
        >
          {(item) => (
            <ListBox.Item id={item.id} textValue={item.label}>
              {item.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          )}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
