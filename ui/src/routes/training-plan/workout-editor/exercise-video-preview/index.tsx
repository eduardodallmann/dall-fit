import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';

import { Button, Modal, Spinner, useOverlayState } from '@heroui/react';
import { Play } from 'lucide-react';

import { trackUiEvent } from '~/core/analytics';

import { exerciseVideoPreviewStyles } from './styles';

const ReactPlayer = lazy(() => import('react-player'));

type CloseReason = 'backdrop' | 'close_trigger' | 'escape';
type VideoOrientation = 'horizontal' | 'vertical';

interface ExerciseVideoPreviewProps {
  exerciseName: string;
  isDisabled: boolean;
  orientation: VideoOrientation;
  youtubeId: string;
}

export function ExerciseVideoPreview({
  exerciseName,
  isDisabled,
  orientation,
  youtubeId,
}: Readonly<ExerciseVideoPreviewProps>) {
  const styles = exerciseVideoPreviewStyles({ orientation });
  const closeReasonRef = useRef<CloseReason>('backdrop');
  const isOpenRef = useRef(false);
  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (isOpen) {
      isOpenRef.current = true;
      trackUiEvent({
        control: 'video_preview',
        eventName: 'ui_overlay_opened',
        overlay: 'exercise_video_preview',
        surface: 'workout',
      });
      return;
    }

    if (!isOpenRef.current) return;
    trackUiEvent({
      control: 'video_preview',
      eventName: 'ui_overlay_closed',
      overlay: 'exercise_video_preview',
      reason: closeReasonRef.current,
      surface: 'workout',
    });
    isOpenRef.current = false;
    closeReasonRef.current = 'backdrop';
  }, []);
  const modalState = useOverlayState({ onOpenChange: handleOpenChange });

  useEffect(() => {
    if (!modalState.isOpen) return;
    const markEscapeClose = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeReasonRef.current = 'escape';
    };
    document.addEventListener('keydown', markEscapeClose, true);
    return () => document.removeEventListener('keydown', markEscapeClose, true);
  }, [modalState.isOpen]);

  return (
    <Modal state={modalState}>
      <Button
        aria-label={`Reproduzir vídeo de ${exerciseName}`}
        className={styles.trigger()}
        isDisabled={isDisabled}
        variant="ghost"
      >
        <img
          alt={`Miniatura de ${exerciseName}`}
          className={styles.thumbnail()}
          referrerPolicy="no-referrer"
          src={`https://img.youtube.com/vi/${youtubeId}/default.jpg`}
        />
        <span aria-hidden="true" className={styles.overlay()}>
          <Play className={styles.playIcon()} />
        </span>
      </Button>
      <Modal.Backdrop
        className={styles.modalBackdrop()}
        isDismissable
        onClick={(event) => {
          if (event.target === event.currentTarget)
            closeReasonRef.current = 'backdrop';
        }}
      >
        <Modal.Container className={styles.modalContainer()} size="lg">
          <Modal.Dialog
            aria-label={`Vídeo de ${exerciseName}`}
            className={styles.modalDialog()}
          >
            <Modal.CloseTrigger
              aria-label="Fechar vídeo"
              onPressStart={() => {
                closeReasonRef.current = 'close_trigger';
              }}
            />
            <Modal.Header className={styles.modalHeader()}>
              <Modal.Heading>{exerciseName}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className={styles.modalBody()}>
              <div className={styles.playerFrame()}>
                {modalState.isOpen ? (
                  <Suspense
                    fallback={
                      <div className={styles.playerFallback()}>
                        <Spinner aria-label="Carregando vídeo" />
                      </div>
                    }
                  >
                    <ReactPlayer
                      className={styles.player()}
                      config={{ youtube: { cc_load_policy: 0 } }}
                      height="100%"
                      muted
                      playing
                      playsInline
                      src={`https://www.youtube.com/watch?v=${youtubeId}`}
                      width="100%"
                    />
                  </Suspense>
                ) : null}
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
