import { useEffect, useRef, useState } from 'react';

import {
  Alert,
  Button,
  Input,
  Label,
  ListBox,
  NumberField,
  Select,
  TextArea,
  TextField,
} from '@heroui/react';

import {
  BODY_AREAS,
  type Exercise,
  type UpdateExerciseRequest,
} from '@dall-fit/types';

import { trackUiEvent } from '~/core/analytics';
import { ImageFilePicker } from '~/core/components/image-file-picker';
import { bodyAreaLabels } from '~/routes/training-plan/exercise-presentation';
import { ExerciseVideoPreview } from '~/routes/training-plan/exercise-video-preview';

import { durationFieldStyles } from './styles';

type Duration = Extract<Exercise, { type: 'duration' }>;
type MediaMode = 'none' | 'image' | 'video';
const styles = durationFieldStyles();
const modes = [
  { id: 'none', label: 'Sem mídia' },
  { id: 'image', label: 'Imagem' },
  { id: 'video', label: 'Vídeo' },
] as const;
function modeOf(exercise: Duration): MediaMode {
  if (exercise.image != null) return 'image';
  return exercise.youtubeId ? 'video' : 'none';
}

export interface DurationFieldsProps {
  exercise: Duration;
  confirmed: Duration;
  isDisabled: boolean;
  mediaDisabled: boolean;
  isSavingImage: boolean;
  onChange: (changes: UpdateExerciseRequest) => void;
  onCancelMediaDraft: () => void;
  onMediaDraftChange: (exerciseId: string, dirty: boolean) => void;
  onImageError: (message: string) => void;
  onImageLoadError: (expiration: string) => void;
  onRetryImage: () => void;
  onUploadImage: (file: File) => Promise<boolean>;
  onRemoveImage: () => Promise<boolean>;
}

export function DurationFields({
  exercise,
  confirmed,
  isDisabled,
  mediaDisabled,
  isSavingImage,
  onChange,
  onCancelMediaDraft,
  onMediaDraftChange,
  onImageError,
  onImageLoadError,
  onRetryImage,
  onUploadImage,
  onRemoveImage,
}: Readonly<DurationFieldsProps>) {
  const canonicalMode = modeOf(confirmed);
  const [selection, setSelection] = useState<{
    base: MediaMode;
    mode: MediaMode;
  }>();
  const mode =
    selection?.base === canonicalMode ? selection.mode : canonicalMode;
  const [file, setFile] = useState<File>();
  const [mediaError, setMediaError] = useState(false);
  const focused = useRef(new Set<string>());
  const dirty = mode !== canonicalMode || file !== undefined;
  const id = exercise.id;
  useEffect(() => {
    onMediaDraftChange(id, dirty);
    return () => onMediaDraftChange(id, false);
  }, [dirty, id, onMediaDraftChange]);
  const focus = (field: 'instructions' | 'youtubeId') => {
    if (focused.current.has(field)) return;
    focused.current.add(field);
    trackUiEvent({
      eventName: 'ui_field_focused',
      field,
      form: 'duration_exercise',
      control: 'exercise_field',
      surface: 'workout',
    });
  };
  const complete = (field: 'instructions' | 'youtubeId', value: string) => {
    trackUiEvent({
      eventName: 'ui_field_completed',
      field,
      form: 'duration_exercise',
      state: value.trim() ? 'valid' : 'empty',
      control: 'exercise_field',
      surface: 'workout',
    });
  };
  const upload = (selected: File) => {
    setFile(selected);
    setMediaError(false);
    void onUploadImage(selected).then((success) => {
      if (success) setFile(undefined);
      setMediaError(!success);
    });
  };
  const remove = () => {
    setMediaError(false);
    void onRemoveImage().then((success) => setMediaError(!success));
  };
  const cancel = () => {
    onCancelMediaDraft();
    setSelection(undefined);
    setFile(undefined);
    setMediaError(false);
  };
  return (
    <div className={styles.fields()}>
      <div className={styles.information()}>
        <TextField className={styles.nameField()} isDisabled={isDisabled}>
          <Label>Nome</Label>
          <Input
            maxLength={40}
            value={exercise.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </TextField>
        <Select
          className={styles.area()}
          isDisabled={isDisabled}
          value={exercise.bodyArea}
          onChange={(key) => {
            const area = BODY_AREAS.find((item) => item === key);
            if (area !== undefined) onChange({ bodyArea: area });
          }}
        >
          <Label>Local do corpo</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox
              items={BODY_AREAS.map((area) => ({
                id: area,
                label: bodyAreaLabels[area],
              }))}
            >
              {(area) => (
                <ListBox.Item id={area.id} textValue={area.label}>
                  {area.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              )}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
      <NumberField
        isDisabled={isDisabled}
        minValue={1}
        maxValue={1440}
        value={exercise.durationMinutes}
        onChange={(durationMinutes) => onChange({ durationMinutes })}
      >
        <Label>Duração (min)</Label>
        <NumberField.Group>
          <NumberField.DecrementButton />
          <NumberField.Input />
          <NumberField.IncrementButton />
        </NumberField.Group>
      </NumberField>
      <TextField isDisabled={isDisabled}>
        <Label>Instruções (opcional)</Label>
        <TextArea
          maxLength={300}
          value={exercise.instructions ?? ''}
          onFocus={() => focus('instructions')}
          onBlur={() => complete('instructions', exercise.instructions ?? '')}
          onChange={(event) =>
            onChange({
              instructions: event.target.value.trim()
                ? event.target.value
                : null,
            })
          }
        />
      </TextField>
      <Select
        isDisabled={mediaDisabled}
        value={mode}
        onChange={(key) => {
          const selected = modes.find((item) => item.id === key)?.id;
          if (selected === undefined || selected === mode) return;
          onCancelMediaDraft();
          setSelection({ base: canonicalMode, mode: selected });
          setFile(undefined);
          setMediaError(false);
          trackUiEvent({
            eventName: 'ui_button_pressed',
            action: `duration_media_${selected}`,
            control: 'exercise_field',
            surface: 'workout',
          });
          if (selected === 'none') {
            if (confirmed.image != null) remove();
            else if (confirmed.youtubeId !== undefined)
              onChange({ youtubeId: null });
          }
        }}
      >
        <Label>Mídia demonstrativa</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox items={modes}>
            {(item) => (
              <ListBox.Item id={item.id} textValue={item.label}>
                {item.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            )}
          </ListBox>
        </Select.Popover>
      </Select>
      {mode === 'video' ? (
        <div className={styles.media()}>
          <TextField isDisabled={mediaDisabled}>
            <Label>Vídeo do YouTube (opcional)</Label>
            <Input
              maxLength={2048}
              value={exercise.youtubeId ?? ''}
              onFocus={() => focus('youtubeId')}
              onBlur={() => complete('youtubeId', exercise.youtubeId ?? '')}
              onChange={(event) =>
                onChange({
                  youtubeId: event.target.value.trim()
                    ? event.target.value
                    : null,
                })
              }
            />
          </TextField>
          {confirmed.youtubeId ? (
            <div className={styles.preview()}>
              <ExerciseVideoPreview
                exerciseName={exercise.name}
                youtubeId={confirmed.youtubeId}
                orientation="horizontal"
                isDisabled={mediaDisabled}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {mode === 'image' ? (
        <div className={styles.preview()}>
          <ImageFilePicker
            label={`Imagem de ${exercise.name}`}
            previewTitle={exercise.name}
            imageUrl={confirmed.image?.thumbnailUrl}
            displayImageUrl={confirmed.image?.displayUrl}
            isDisabled={mediaDisabled}
            isPending={isSavingImage}
            onSelect={upload}
            onRemove={
              confirmed.image == null
                ? undefined
                : () => {
                    setSelection({ base: canonicalMode, mode: 'none' });
                    remove();
                  }
            }
            onError={onImageError}
            onRetry={onRetryImage}
            onImageLoadError={() => {
              if (confirmed.image != null)
                onImageLoadError(confirmed.image.signedUrlExpiresAt);
            }}
            onPreviewOpen={() =>
              trackUiEvent({
                eventName: 'ui_overlay_opened',
                control: 'image_preview',
                overlay: 'exercise_image_preview',
                surface: 'workout',
              })
            }
            onPreviewClose={(reason) =>
              trackUiEvent({
                eventName: 'ui_overlay_closed',
                control: 'image_preview',
                overlay: 'exercise_image_preview',
                surface: 'workout',
                reason,
              })
            }
          />
        </div>
      ) : null}
      {mediaError ? (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>Não foi possível salvar a mídia.</Alert.Title>
            <Alert.Description>
              Tente novamente ou cancele a troca. Se solicitado, recarregue o
              treino antes de continuar.
            </Alert.Description>
          </Alert.Content>
          <Button
            isDisabled={mediaDisabled}
            variant="secondary"
            onPress={() => {
              if (file !== undefined) upload(file);
              else remove();
            }}
          >
            Tentar novamente
          </Button>
        </Alert>
      ) : null}
      {dirty || mediaError ? (
        <div className={styles.actions()}>
          <Button
            isDisabled={mediaDisabled}
            variant="secondary"
            onPress={cancel}
          >
            Cancelar troca de mídia
          </Button>
        </div>
      ) : null}
    </div>
  );
}
