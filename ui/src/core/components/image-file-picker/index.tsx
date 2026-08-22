import { useId, useRef, useState, type DragEvent } from 'react';

import { Button, Spinner } from '@heroui/react';
import { Plus, Trash2, Upload } from 'lucide-react';

import {
  ImagePreview,
  type ImagePreviewCloseReason,
} from '~/core/components/image-preview';

import { imageFilePickerStyles } from './styles';

const styles = imageFilePickerStyles();
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maximumImageSize = 10 * 1024 * 1024;

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

function getValidationError(file: File): string | undefined {
  if (!allowedTypes.has(file.type)) return 'Use uma imagem JPEG, PNG ou WebP.';
  if (file.size > maximumImageSize)
    return 'A imagem deve ter no máximo 10 MiB.';
  return undefined;
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
          className={styles.dropZone({
            isDragging: isDragging && !disabled,
          })}
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
        <ImagePreview
          displayImageUrl={displayImageUrl}
          imageUrl={imageUrl}
          isDisabled={disabled}
          isPending={isPending}
          label={label}
          onImageLoadError={onImageLoadError}
          onPreviewClose={onPreviewClose}
          onPreviewOpen={onPreviewOpen}
          onRetry={onRetry}
          previewTitle={previewTitle}
          size="editor"
        />
      )}
      {imageUrl === undefined ? null : (
        <div className={styles.actions()}>
          <Button
            aria-label="Substituir imagem"
            className={styles.actionButton()}
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
              className={styles.actionButton()}
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
