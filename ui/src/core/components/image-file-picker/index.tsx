import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
} from 'react';

import { Button, Modal, Spinner, useOverlayState } from '@heroui/react';
import { Eye, Plus, Trash2, Upload } from 'lucide-react';

import { imageFilePickerStyles } from './styles';

const styles = imageFilePickerStyles();
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maximumImageSize = 10 * 1024 * 1024;

export type ImagePreviewCloseReason = 'backdrop' | 'close_trigger' | 'escape';

interface ImageFilePickerProps {
  displayImageUrl?: string;
  imageUrl?: string;
  isDisabled: boolean;
  isPending: boolean;
  label: string;
  onError: (message: string) => void;
  onImageLoadError: () => void;
  onPreviewClose: (reason: ImagePreviewCloseReason) => void;
  onPreviewOpen: () => void;
  onRemove?: () => void;
  onRetry: () => void;
  onSelect: (file: File) => void;
  previewTitle: string;
}

interface ExistingImageMediaProps {
  disabled: boolean;
  displayImageUrl?: string;
  imageUrl: string;
  isPending: boolean;
  label: string;
  onImageLoadError: () => void;
  onPreviewClose: (reason: ImagePreviewCloseReason) => void;
  onPreviewOpen: () => void;
  onRetry: () => void;
  previewTitle: string;
}

function getValidationError(file: File): string | undefined {
  if (!allowedTypes.has(file.type)) return 'Use uma imagem JPEG, PNG ou WebP.';
  if (file.size > maximumImageSize)
    return 'A imagem deve ter no máximo 10 MiB.';
  return undefined;
}

function ExistingImageMedia({
  disabled,
  displayImageUrl,
  imageUrl,
  isPending,
  label,
  onImageLoadError,
  onPreviewClose,
  onPreviewOpen,
  onRetry,
  previewTitle,
}: Readonly<ExistingImageMediaProps>) {
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
          isDisabled={disabled}
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
        className={styles.previewTrigger({ isPending })}
        isDisabled={disabled}
        variant="ghost"
      >
        <img
          alt={label}
          className={styles.image({ isPending })}
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

export function ImageFilePicker({
  displayImageUrl,
  imageUrl,
  isDisabled,
  isPending,
  label,
  onError,
  onImageLoadError,
  onPreviewClose,
  onPreviewOpen,
  onRemove,
  onRetry,
  onSelect,
  previewTitle,
}: Readonly<ImageFilePickerProps>) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const disabled = isDisabled || isPending;

  const selectFile = (file: File) => {
    const validationError = getValidationError(file);
    if (validationError !== undefined) {
      onError(validationError);
      return;
    }
    onSelect(file);
  };
  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length !== 1) {
      onError('Envie apenas uma imagem por vez.');
      return;
    }
    const [file] = files;
    if (file !== undefined) selectFile(file);
  };

  return (
    <div className={styles.root()}>
      {imageUrl === undefined ? (
        <button
          aria-label={`Enviar ${label.toLocaleLowerCase('pt-BR')}`}
          className={styles.dropZone({ isDragging })}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            if (disabled) return;
            dragDepthRef.current += 1;
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
            if (dragDepthRef.current === 0) setIsDragging(false);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          type="button"
        >
          {isPending ? (
            <Spinner aria-hidden="true" size="sm" />
          ) : (
            <Plus aria-hidden="true" className={styles.actionIcon()} />
          )}
        </button>
      ) : (
        <ExistingImageMedia
          disabled={disabled}
          displayImageUrl={displayImageUrl}
          imageUrl={imageUrl}
          isPending={isPending}
          label={label}
          onImageLoadError={onImageLoadError}
          onPreviewClose={onPreviewClose}
          onPreviewOpen={onPreviewOpen}
          onRetry={onRetry}
          previewTitle={previewTitle}
        />
      )}
      {imageUrl === undefined ? null : (
        <div className={styles.actions()}>
          <Button
            aria-label="Substituir imagem"
            isDisabled={disabled}
            isIconOnly
            onPress={() => inputRef.current?.click()}
            size="sm"
            variant="secondary"
          >
            <Upload aria-hidden="true" className={styles.actionIcon()} />
          </Button>
          {onRemove === undefined ? null : (
            <Button
              aria-label="Remover imagem"
              isDisabled={disabled}
              isIconOnly
              onPress={onRemove}
              size="sm"
              variant="danger"
            >
              <Trash2 aria-hidden="true" className={styles.actionIcon()} />
            </Button>
          )}
        </div>
      )}
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label={`Selecionar ${label.toLocaleLowerCase('pt-BR')}`}
        className={styles.input()}
        id={id}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) selectFile(file);
        }}
        ref={inputRef}
        type="file"
      />
      {isPending ? (
        <span aria-live="polite" className={styles.status()}>
          Processando imagem
        </span>
      ) : null}
    </div>
  );
}
