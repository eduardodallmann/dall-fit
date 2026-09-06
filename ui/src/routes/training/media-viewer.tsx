import { lazy, Suspense } from 'react';

import {
  Button,
  Drawer,
  Modal,
  Spinner,
  useMediaQuery,
  useOverlayState,
} from '@heroui/react';
import { ImageOff, Play } from 'lucide-react';

import type { TrainingExerciseExecution } from '@dall-fit/types';

import { trackTrainingAction } from '~/core/analytics';
import { trainingStyles } from '~/routes/training/styles';

const ReactPlayer = lazy(() => import('react-player'));
const styles = trainingStyles();

export function TrainingMediaViewer({
  exercise,
}: Readonly<{ exercise: TrainingExerciseExecution }>) {
  const isDesktop = useMediaQuery('(min-width: 768px)', {
    defaultValue: true,
  });
  const state = useOverlayState();
  const hasImage = exercise.type === 'image' && exercise.image !== null;
  const hasVideo =
    'youtubeId' in exercise &&
    exercise.youtubeId !== undefined &&
    exercise.youtubeId.length > 0;

  if (!hasImage && !hasVideo) {
    return (
      <div className={styles.exerciseMedia()}>
        <div className={styles.placeholder()}>
          <ImageOff aria-hidden="true" className={styles.icon()} />
          <span>Sem mídia</span>
        </div>
      </div>
    );
  }

  const trigger = (
    <Button
      aria-label={`Abrir mídia de ${'name' in exercise ? exercise.name : 'exercício'}`}
      className={styles.mediaButton()}
      onPress={() => {
        trackTrainingAction('training_workout', 'media_open');
        state.open();
      }}
      variant="ghost"
    >
      <MediaThumbnail exercise={exercise} />
      <span aria-hidden="true" className={styles.mediaOverlay()}>
        <Play className={styles.icon()} />
      </span>
    </Button>
  );
  const content = <MediaContent exercise={exercise} />;
  const title = 'name' in exercise ? exercise.name : 'Mídia do exercício';

  if (isDesktop) {
    return (
      <div className={styles.exerciseMedia()}>
        {trigger}
        <Modal state={state}>
          <Modal.Backdrop isDismissable>
            <Modal.Container size="lg">
              <Modal.Dialog className={styles.modalDialog()}>
                <Modal.CloseTrigger aria-label="Fechar mídia" />
                <Modal.Header className={styles.modalHeader()}>
                  <Modal.Heading>{title}</Modal.Heading>
                </Modal.Header>
                <Modal.Body className={styles.modalBody()}>
                  {content}
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      </div>
    );
  }

  return (
    <div className={styles.exerciseMedia()}>
      {trigger}
      <Drawer state={state}>
        <Drawer.Backdrop isDismissable>
          <Drawer.Content className={styles.drawerContent()} placement="bottom">
            <Drawer.Dialog className={styles.drawerDialog()}>
              <Drawer.Handle />
              <Drawer.Header className={styles.drawerHeader()}>
                <Drawer.Heading>{title}</Drawer.Heading>
              </Drawer.Header>
              <Drawer.Body className={styles.drawerBody()}>
                {content}
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </div>
  );
}

function MediaThumbnail({
  exercise,
}: Readonly<{ exercise: TrainingExerciseExecution }>) {
  if (exercise.type === 'image' && exercise.image !== null) {
    return (
      <img
        alt=""
        className={styles.mediaImage()}
        referrerPolicy="no-referrer"
        src={exercise.image.thumbnailUrl}
      />
    );
  }
  if ('youtubeId' in exercise && exercise.youtubeId !== undefined) {
    return (
      <img
        alt=""
        className={styles.mediaImage()}
        referrerPolicy="no-referrer"
        src={`https://img.youtube.com/vi/${exercise.youtubeId}/mqdefault.jpg`}
      />
    );
  }
  return null;
}

function MediaContent({
  exercise,
}: Readonly<{ exercise: TrainingExerciseExecution }>) {
  if (exercise.type === 'image' && exercise.image !== null) {
    return (
      <img
        alt={`Imagem de ${exercise.name}`}
        className={styles.overlayImage()}
        referrerPolicy="no-referrer"
        src={exercise.image.displayUrl}
      />
    );
  }
  if ('youtubeId' in exercise && exercise.youtubeId !== undefined) {
    return (
      <div
        className={styles.playerFrame({
          mediaAspect: exercise.type === 'youtube-short' ? 'short' : 'long',
        })}
      >
        <Suspense fallback={<Spinner aria-label="Carregando vídeo" />}>
          <ReactPlayer
            className={styles.player()}
            controls
            height="100%"
            muted={exercise.type !== 'youtube-long'}
            playing
            playsInline
            src={`https://www.youtube.com/watch?v=${exercise.youtubeId}`}
            width="100%"
          />
        </Suspense>
      </div>
    );
  }
  return null;
}
