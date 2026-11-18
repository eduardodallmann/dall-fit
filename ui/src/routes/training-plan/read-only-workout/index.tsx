import { Card, Chip } from '@heroui/react';
import { Dumbbell, ImageOff, VideoOff } from 'lucide-react';

import type { Exercise, TrainingPlanWorkoutDetails } from '@dall-fit/types';

import { trackUiEvent } from '~/core/analytics';
import { ImagePreview } from '~/core/components/image-preview';
import {
  bodyAreaLabels,
  exerciseTypeIcons,
  exerciseTypeLabels,
} from '~/routes/training-plan/exercise-presentation';
import { ExerciseVideoPreview } from '~/routes/training-plan/exercise-video-preview';

import { readOnlyWorkoutStyles } from './styles';

const styles = readOnlyWorkoutStyles();

interface ReadOnlyWorkoutProps {
  onImageLoadError: () => void;
  onRetryImage: () => void;
  workout: TrainingPlanWorkoutDetails;
}

interface ExerciseMetric {
  label: string;
  value: string;
}

export function ReadOnlyWorkout({
  onImageLoadError,
  onRetryImage,
  workout,
}: Readonly<ReadOnlyWorkoutProps>) {
  const exerciseCountLabel = `${workout.exercises.length} ${workout.exercises.length === 1 ? 'exercício' : 'exercícios'}`;

  return (
    <section aria-label="Treino em modo de leitura" className={styles.root()}>
      <div className={styles.header()}>
        <div className={styles.titleGroup()}>
          <h1 className={styles.title()}>{workout.name}</h1>
          <p className={styles.description()}>
            Exercícios definidos no modelo disponibilizado. Nenhuma informação
            pode ser alterada neste vínculo, mas você pode consultar imagens e
            vídeos.
          </p>
        </div>
        <Chip color="accent" size="sm" variant="soft">
          {exerciseCountLabel}
        </Chip>
      </div>
      {workout.exercises.length === 0 ? (
        <div className={styles.emptyState()}>
          <Dumbbell aria-hidden="true" className={styles.icon()} />
          <p>Este treino ainda não possui exercícios.</p>
        </div>
      ) : (
        <ol aria-label="Exercícios em ordem" className={styles.list()}>
          {workout.exercises.map((exercise, index) => (
            <li key={exercise.id}>
              <ReadOnlyExerciseCard
                exercise={exercise}
                index={index}
                onImageLoadError={onImageLoadError}
                onRetryImage={onRetryImage}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ReadOnlyExerciseCard({
  exercise,
  index,
  onImageLoadError,
  onRetryImage,
}: Readonly<{
  exercise: Exercise;
  index: number;
  onImageLoadError: () => void;
  onRetryImage: () => void;
}>) {
  const TypeIcon = exerciseTypeIcons[exercise.type];
  const hasMedia =
    exercise.type === 'image' ||
    exercise.type === 'youtube-long' ||
    exercise.type === 'youtube-short' ||
    (exercise.type === 'duration' &&
      (exercise.youtubeId !== undefined || exercise.image != null));
  const exerciseName = exercise.type === 'pause' ? 'Pausa' : exercise.name;

  return (
    <Card className={styles.card()} variant="secondary">
      <Card.Header className={styles.cardHeader()}>
        <div className={styles.cardIdentity()}>
          <span aria-hidden="true" className={styles.index()}>
            {index + 1}
          </span>
          <TypeIcon aria-hidden="true" className={styles.icon()} />
          <div className={styles.cardText()}>
            <h2 className={styles.cardTitle()}>{exerciseName}</h2>
            {exercise.type === 'duration' && exercise.instructions ? (
              <p>{exercise.instructions}</p>
            ) : null}
            {'bodyArea' in exercise ? (
              <p className={styles.bodyArea()}>
                {bodyAreaLabels[exercise.bodyArea]}
              </p>
            ) : null}
          </div>
        </div>
        <Chip color="accent" size="sm" variant="soft">
          {exerciseTypeLabels[exercise.type]}
        </Chip>
      </Card.Header>
      <Card.Content className={styles.cardContent()}>
        <div className={styles.content({ hasMedia })}>
          <ExerciseMetrics exercise={exercise} />
          <ExerciseMedia
            exercise={exercise}
            onImageLoadError={onImageLoadError}
            onRetryImage={onRetryImage}
          />
        </div>
      </Card.Content>
    </Card>
  );
}

function ExerciseMetrics({ exercise }: Readonly<{ exercise: Exercise }>) {
  const metrics = getExerciseMetrics(exercise);

  if (metrics.length === 0)
    return (
      <p className={styles.mediaHint()}>
        Abra o vídeo para acompanhar a demonstração.
      </p>
    );

  return (
    <dl className={styles.metricList()}>
      {metrics.map((metric) => (
        <div className={styles.metric()} key={metric.label}>
          <dt className={styles.metricLabel()}>{metric.label}</dt>
          <dd className={styles.metricValue()}>{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ExerciseMedia({
  exercise,
  onImageLoadError,
  onRetryImage,
}: Readonly<{
  exercise: Exercise;
  onImageLoadError: () => void;
  onRetryImage: () => void;
}>) {
  if (
    exercise.type === 'image' ||
    (exercise.type === 'duration' && exercise.image != null)
  ) {
    if (exercise.image == null)
      return (
        <div className={styles.mediaPlaceholder()} role="status">
          <ImageOff aria-hidden="true" className={styles.icon()} />
          <span>Sem imagem</span>
        </div>
      );

    return (
      <div className={styles.media()}>
        <ImagePreview
          displayImageUrl={exercise.image.displayUrl}
          imageUrl={exercise.image.thumbnailUrl}
          label={`Imagem de ${exercise.name}`}
          onImageLoadError={onImageLoadError}
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
          onRetry={onRetryImage}
          previewTitle={exercise.name}
          size="compact"
        />
      </div>
    );
  }

  if ('youtubeId' in exercise && exercise.youtubeId !== undefined) {
    if (exercise.youtubeId.length === 0)
      return (
        <div className={styles.mediaPlaceholder()} role="status">
          <VideoOff aria-hidden="true" className={styles.icon()} />
          <span>Sem vídeo</span>
        </div>
      );

    return (
      <div className={styles.media()}>
        <ExerciseVideoPreview
          exerciseName={exercise.name}
          isDisabled={false}
          orientation={
            exercise.type === 'youtube-short' ? 'vertical' : 'horizontal'
          }
          youtubeId={exercise.youtubeId}
        />
      </div>
    );
  }

  return null;
}

function getExerciseMetrics(exercise: Exercise): readonly ExerciseMetric[] {
  switch (exercise.type) {
    case 'youtube-short':
    case 'image':
      return [
        { label: 'Séries', value: String(exercise.sets) },
        { label: 'Repetições', value: String(exercise.repetitions) },
        { label: 'Descanso', value: `${exercise.restSeconds} s` },
      ];
    case 'pause':
      return [
        { label: 'Duração da pausa', value: `${exercise.restSeconds} s` },
      ];
    case 'duration':
      return [{ label: 'Duração', value: `${exercise.durationMinutes} min` }];
    case 'youtube-long':
      return [];
  }
}
