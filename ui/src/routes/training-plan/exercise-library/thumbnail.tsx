import { useState } from 'react';

import type { ExerciseLibraryItem } from '@dall-fit/types';

import { exerciseTypeIcons } from '~/routes/training-plan/exercise-presentation';

import { exerciseLibraryStyles } from './styles';

const styles = exerciseLibraryStyles();
export function LibraryThumbnail({
  item,
  onImageFailure,
}: Readonly<{
  item: ExerciseLibraryItem;
  onImageFailure: (expiration: string) => void;
}>) {
  const exercise = item.exercise;
  let source: string | undefined;
  if (exercise.type === 'image') source = exercise.image?.thumbnailUrl;
  else if ('youtubeId' in exercise && exercise.youtubeId)
    source = `https://img.youtube.com/vi/${exercise.youtubeId}/default.jpg`;
  const [failedSource, setFailedSource] = useState<string>();
  if (source === undefined || failedSource === source) {
    const Icon = exerciseTypeIcons[exercise.type];
    return (
      <span aria-label="Sem miniatura disponível" className={styles.fallback()}>
        <Icon aria-hidden="true" />
      </span>
    );
  }
  return (
    <img
      alt=""
      className={styles.thumbnail()}
      loading="lazy"
      onError={() => {
        setFailedSource(source);
        if (exercise.type === 'image' && exercise.image !== null)
          onImageFailure(exercise.image.signedUrlExpiresAt);
      }}
      referrerPolicy="no-referrer"
      src={source}
    />
  );
}
