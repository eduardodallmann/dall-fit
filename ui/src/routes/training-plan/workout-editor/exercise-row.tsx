import { useEffect, useRef, useState } from 'react';

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
import { GripVertical, Trash2 } from 'lucide-react';

import {
  BODY_AREAS,
  type BodyArea,
  type Exercise,
  type UpdateExerciseRequest,
} from '@dall-fit/types';

import { ImageFilePicker } from '~/core/components/image-file-picker';

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
  isSaving: boolean;
  onDelete: () => void;
  onDraftPendingChange: (pending: boolean) => void;
  onImageError: (message: string) => void;
  onRemoveImage: () => void;
  onSave: (changes: UpdateExerciseRequest) => void;
  onUploadImage: (file: File) => void;
}

export function ExerciseRow({
  exercise,
  isSaving,
  onDelete,
  onDraftPendingChange,
  onImageError,
  onRemoveImage,
  onSave,
  onUploadImage,
}: Readonly<ExerciseRowProps>) {
  const [draft, setDraft] = useState(exercise);
  const pending = useRef<UpdateExerciseRequest>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { attributes, listeners, setNodeRef } = useSortable({
    id: exercise.id,
  });

  useEffect(() => {
    setDraft((current) =>
      exercise.type === current.type
        ? { ...exercise, ...pending.current }
        : exercise,
    );
  }, [exercise]);
  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );

  const schedule = (changes: UpdateExerciseRequest, next: Exercise) => {
    setDraft(next);
    pending.current = { ...pending.current, ...changes };
    onDraftPendingChange(true);
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      const payload = pending.current;
      pending.current = {};
      onDraftPendingChange(false);
      onSave(payload);
    }, 3000);
  };

  return (
    <li className={styles.exerciseItem()} ref={setNodeRef}>
      <button
        aria-label={`Mover ${typeLabels[draft.type]}`}
        className={styles.handle()}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" />
      </button>
      <div className={styles.exerciseFields()}>
        {'name' in draft ? (
          <TextInput
            label="Nome"
            maxLength={40}
            value={draft.name}
            onChange={(name) => schedule({ name }, { ...draft, name })}
          />
        ) : null}
        {'youtubeId' in draft ? (
          <TextInput
            label="Vídeo"
            maxLength={2048}
            value={draft.youtubeId}
            onChange={(youtubeId) =>
              schedule({ youtubeId }, { ...draft, youtubeId })
            }
          />
        ) : null}
        {'youtubeId' in draft ? (
          <img
            alt={`Miniatura de ${draft.name}`}
            className={styles.youtubeThumbnail()}
            src={`https://img.youtube.com/vi/${draft.youtubeId}/default.jpg`}
          />
        ) : null}
        {draft.type === 'image' ? (
          <ImageFilePicker
            imageUrl={draft.image?.thumbnailUrl}
            isPending={isSaving}
            label={`Imagem de ${draft.name}`}
            onError={onImageError}
            onRemove={draft.image === null ? undefined : onRemoveImage}
            onSelect={onUploadImage}
          />
        ) : null}
        {'bodyArea' in draft ? (
          <BodyAreaSelect
            value={draft.bodyArea}
            onChange={(bodyArea) =>
              schedule({ bodyArea }, { ...draft, bodyArea })
            }
          />
        ) : null}
        {'restSeconds' in draft ? (
          <NumericInput
            label="Descanso (s)"
            max={3600}
            min={draft.type === 'pause' ? 1 : 0}
            value={draft.restSeconds}
            onChange={(restSeconds) =>
              schedule({ restSeconds }, { ...draft, restSeconds })
            }
          />
        ) : null}
        {'sets' in draft ? (
          <NumericInput
            label="Séries"
            max={100}
            min={1}
            value={draft.sets}
            onChange={(sets) => schedule({ sets }, { ...draft, sets })}
          />
        ) : null}
        {'repetitions' in draft ? (
          <NumericInput
            label="Repetições"
            max={1000}
            min={1}
            value={draft.repetitions}
            onChange={(repetitions) =>
              schedule({ repetitions }, { ...draft, repetitions })
            }
          />
        ) : null}
        {'durationMinutes' in draft ? (
          <NumericInput
            label="Duração (min)"
            max={1440}
            min={1}
            value={draft.durationMinutes}
            onChange={(durationMinutes) =>
              schedule({ durationMinutes }, { ...draft, durationMinutes })
            }
          />
        ) : null}
      </div>
      <div className={styles.exerciseActions()}>
        <Chip>{typeLabels[draft.type]}</Chip>
        {isSaving ? (
          <Spinner aria-label="Salvando exercício" size="sm" />
        ) : (
          <Popover>
            <Button
              aria-label={`Excluir ${typeLabels[draft.type]}`}
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
    </li>
  );
}

function TextInput({
  label,
  maxLength,
  onChange,
  value,
}: Readonly<{
  label: string;
  maxLength: number;
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <TextField>
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
  label,
  max,
  min,
  onChange,
  value,
}: Readonly<{
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}>) {
  return (
    <NumberField
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
  onChange,
  value,
}: Readonly<{ onChange: (value: BodyArea) => void; value: BodyArea }>) {
  return (
    <Select
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
