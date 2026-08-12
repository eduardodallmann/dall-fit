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

import { ImageFilePicker } from '~/core/components/image-file-picker';

import type { ExerciseSaveStatus } from './editor-state';
import { workoutEditorStyles } from './styles';

const styles = workoutEditorStyles();

const bodyAreaLabels: Record<BodyArea, string> = {
  stretching: 'Alongamentos',
  abdomen: 'Abdômen',
  quadriceps: 'Quadríceps',
  mobility: 'Mobilidade',
  other: 'Outros',
  chest: 'Peito',
  shoulder: 'Ombro',
  triceps: 'Tríceps',
  back: 'Costas',
  biceps: 'Bíceps',
  'lower-back': 'Lombar',
  glutes: 'Glúteo',
  calf: 'Panturrilha',
  adductor: 'Adutor',
  hamstrings: 'Posterior de coxa',
  cardio: 'Cardio',
};

const typeLabels: Record<Exercise['type'], string> = {
  'youtube-short': 'YouTube Short',
  image: 'Imagem',
  'youtube-long': 'YouTube Longo',
  pause: 'Pausa',
  duration: 'Duração',
};

interface ExerciseRowProps {
  exercise: Exercise;
  isDisabled: boolean;
  isSavingImage: boolean;
  isStructureDisabled: boolean;
  onChange: (changes: UpdateExerciseRequest) => void;
  onDelete: () => void;
  onImageError: (message: string) => void;
  onRemoveImage: () => void;
  onRetry: () => void;
  onUploadImage: (file: File) => void;
  status: ExerciseSaveStatus;
}

export function ExerciseRow({
  exercise,
  isDisabled,
  isSavingImage,
  isStructureDisabled,
  onChange,
  onDelete,
  onImageError,
  onRemoveImage,
  onRetry,
  onUploadImage,
  status,
}: Readonly<ExerciseRowProps>) {
  const isSaving = status === 'queued' || status === 'saving';
  const { attributes, listeners, setNodeRef } = useSortable({
    disabled: isDisabled || isStructureDisabled,
    id: exercise.id,
  });

  return (
    <li className={styles.exerciseItem()} ref={setNodeRef}>
      <button
        aria-label={`Mover ${typeLabels[exercise.type]}`}
        className={styles.handle()}
        data-exercise-drag-handle={exercise.id}
        disabled={isDisabled || isStructureDisabled}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" />
      </button>
      <ExerciseFields
        exercise={exercise}
        isDisabled={isDisabled}
        isSavingImage={isSavingImage}
        isStructureDisabled={isStructureDisabled}
        onChange={onChange}
        onImageError={onImageError}
        onRemoveImage={onRemoveImage}
        onUploadImage={onUploadImage}
      />
      <div className={styles.exerciseActions()}>
        <Chip>{typeLabels[exercise.type]}</Chip>
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
        {isSaving || isSavingImage ? (
          <Spinner aria-label="Salvando exercício" size="sm" />
        ) : (
          <Popover>
            <Button
              aria-label={`Excluir ${typeLabels[exercise.type]}`}
              isDisabled={isDisabled || isStructureDisabled}
              isIconOnly
              size="sm"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
            </Button>
            <Popover.Content>
              <Popover.Dialog>
                <Popover.Heading>Excluir exercício?</Popover.Heading>
                <Button onPress={onDelete} variant="danger">
                  Excluir
                </Button>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        )}
      </div>
      {status === 'debouncing' ? (
        <p className={styles.status()}>Alterações aguardando autosave.</p>
      ) : null}
      {status === 'error' ? (
        <p className={styles.status()} role="alert">
          Não foi possível salvar. O rascunho foi preservado.
        </p>
      ) : null}
    </li>
  );
}

function ExerciseFields({
  exercise,
  isDisabled,
  isSavingImage,
  isStructureDisabled,
  onChange,
  onImageError,
  onRemoveImage,
  onUploadImage,
}: Readonly<
  Pick<
    ExerciseRowProps,
    | 'exercise'
    | 'isDisabled'
    | 'isSavingImage'
    | 'isStructureDisabled'
    | 'onChange'
    | 'onImageError'
    | 'onRemoveImage'
    | 'onUploadImage'
  >
>) {
  return (
    <div className={styles.exerciseFields()}>
      {'name' in exercise ? (
        <TextInput
          isDisabled={isDisabled}
          label="Nome"
          maxLength={40}
          onChange={(name) => onChange({ name })}
          value={exercise.name}
        />
      ) : null}
      {'youtubeId' in exercise ? (
        <TextInput
          isDisabled={isDisabled}
          label="Vídeo"
          maxLength={2048}
          onChange={(youtubeId) => onChange({ youtubeId })}
          value={exercise.youtubeId}
        />
      ) : null}
      {'youtubeId' in exercise ? (
        <img
          alt={`Miniatura de ${exercise.name}`}
          className={styles.youtubeThumbnail()}
          src={`https://img.youtube.com/vi/${exercise.youtubeId}/default.jpg`}
        />
      ) : null}
      {exercise.type === 'image' ? (
        <ImageFilePicker
          imageUrl={exercise.image?.thumbnailUrl}
          isPending={isDisabled || isSavingImage || isStructureDisabled}
          label={`Imagem de ${exercise.name}`}
          onError={onImageError}
          onRemove={exercise.image === null ? undefined : onRemoveImage}
          onSelect={onUploadImage}
        />
      ) : null}
      {'bodyArea' in exercise ? (
        <BodyAreaSelect
          isDisabled={isDisabled}
          onChange={(bodyArea) => onChange({ bodyArea })}
          value={exercise.bodyArea}
        />
      ) : null}
      {'restSeconds' in exercise ? (
        <NumericInput
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
  isDisabled,
  label,
  maxLength,
  onChange,
  value,
}: Readonly<{
  isDisabled: boolean;
  label: string;
  maxLength: number;
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <TextField isDisabled={isDisabled}>
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
  isDisabled,
  label,
  max,
  min,
  onChange,
  value,
}: Readonly<{
  isDisabled: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}>) {
  return (
    <NumberField
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
  isDisabled,
  onChange,
  value,
}: Readonly<{
  isDisabled: boolean;
  onChange: (value: BodyArea) => void;
  value: BodyArea;
}>) {
  return (
    <Select
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
