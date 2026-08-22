import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Modal, Spinner, useOverlayState } from '@heroui/react';
import { Eye } from 'lucide-react';

import { imagePreviewStyles } from './styles';

export type ImagePreviewCloseReason = 'backdrop' | 'close_trigger' | 'escape';

interface ImagePreviewProps {
  displayImageUrl?: string;
  imageUrl: string;
  isDisabled?: boolean;
  isPending?: boolean;
  label: string;
  onImageLoadError: () => void;
  onPreviewClose: (reason: ImagePreviewCloseReason) => void;
  onPreviewOpen: () => void;
  onRetry: () => void;
  previewTitle: string;
  size?: 'compact' | 'editor';
}

export function ImagePreview({
  displayImageUrl,
  imageUrl,
  isDisabled = false,
  isPending = false,
  label,
  onImageLoadError,
  onPreviewClose,
  onPreviewOpen,
  onRetry,
  previewTitle,
  size = 'editor',
}: Readonly<ImagePreviewProps>) {
  const styles = imagePreviewStyles({ isPending, size });
  const closeReasonRef = useRef<ImagePreviewCloseReason>('backdrop');
  const isOpenRef = useRef(false);
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const [failedDisplayImageUrl, setFailedDisplayImageUrl] = useState<string>();
  const imageUnavailable = failedImageUrl === imageUrl;
  const displayImageUnavailable =
    displayImageUrl !== undefined && failedDisplayImageUrl === displayImageUrl;
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        isOpenRef.current = true;
        onPreviewOpen();
        return;
      }
      if (!isOpenRef.current) return;
      onPreviewClose(closeReasonRef.current);
      isOpenRef.current = false;
      closeReasonRef.current = 'backdrop';
    },
    [onPreviewClose, onPreviewOpen],
  );
  const modalState = useOverlayState({ onOpenChange: handleOpenChange });

  useEffect(() => {
    if (!modalState.isOpen) return;
    const markEscapeClose = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeReasonRef.current = 'escape';
    };
    document.addEventListener('keydown', markEscapeClose, true);
    return () => document.removeEventListener('keydown', markEscapeClose, true);
  }, [modalState.isOpen]);

  if (imageUnavailable) {
    return (
      <div className={styles.fallback()} role="status">
        <span>Imagem indisponível.</span>
        <Button
          isDisabled={isDisabled}
          onPress={onRetry}
          size="sm"
          variant="secondary"
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <Modal state={modalState}>
      <Button
        aria-label={`Visualizar ${label.toLocaleLowerCase('pt-BR')}`}
        className={styles.trigger()}
        isDisabled={isDisabled}
        variant="ghost"
      >
        <img
          alt={label}
          className={styles.image()}
          onError={() => {
            setFailedImageUrl(imageUrl);
            onImageLoadError();
          }}
          referrerPolicy="no-referrer"
          src={imageUrl}
        />
        <span aria-hidden="true" className={styles.previewOverlay()}>
          {isPending ? (
            <Spinner color="current" size="sm" />
          ) : (
            <Eye className={styles.previewIcon()} />
          )}
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
          <Modal.Dialog aria-label={label} className={styles.modalDialog()}>
            <Modal.CloseTrigger
              aria-label="Fechar imagem"
              onPressStart={() => {
                closeReasonRef.current = 'close_trigger';
              }}
            />
            <Modal.Header className={styles.modalHeader()}>
              <Modal.Heading>{previewTitle}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className={styles.modalBody()}>
              {displayImageUrl === undefined || displayImageUnavailable ? (
                <div className={styles.displayFallback()} role="status">
                  Imagem indisponível.
                </div>
              ) : (
                <img
                  alt={label}
                  className={styles.displayImage()}
                  onError={() => {
                    setFailedDisplayImageUrl(displayImageUrl);
                    onImageLoadError();
                  }}
                  referrerPolicy="no-referrer"
                  src={displayImageUrl}
                />
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
