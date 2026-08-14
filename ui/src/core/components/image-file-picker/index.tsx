import { useId, useRef, useState } from 'react';

import { Button } from '@heroui/react';

import { imageFilePickerStyles } from './styles';

const styles = imageFilePickerStyles();
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface ImageFilePickerProps {
  imageUrl?: string;
  isPending: boolean;
  label: string;
  onError: (message: string) => void;
  onImageLoadError: () => void;
  onRemove?: () => void;
  onRetry: () => void;
  onSelect: (file: File) => void;
}

export function ImageFilePicker({
  imageUrl,
  isPending,
  label,
  onError,
  onImageLoadError,
  onRemove,
  onRetry,
  onSelect,
}: Readonly<ImageFilePickerProps>) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const imageUnavailable =
    imageUrl !== undefined && failedImageUrl === imageUrl;
  return (
    <div className={styles.root()}>
      {imageUrl === undefined || imageUnavailable ? null : (
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
      )}
      {imageUrl !== undefined && imageUnavailable ? (
        <div className={styles.fallback()} role="status">
          <span>Imagem indisponível.</span>
          <Button onPress={onRetry} size="sm" variant="secondary">
            Tentar novamente
          </Button>
        </div>
      ) : null}
      <div className={styles.actions()}>
        <Button
          isDisabled={isPending}
          onPress={() => inputRef.current?.click()}
          size="sm"
          variant="secondary"
        >
          {imageUrl === undefined ? 'Enviar imagem' : 'Substituir imagem'}
        </Button>
        {imageUrl === undefined || onRemove === undefined ? null : (
          <Button
            isDisabled={isPending}
            onPress={onRemove}
            size="sm"
            variant="danger"
          >
            Remover imagem
          </Button>
        )}
      </div>
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label={label}
        className={styles.input()}
        id={id}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file === undefined) return;
          if (!allowedTypes.has(file.type)) {
            onError('Use uma imagem JPEG, PNG ou WebP.');
            return;
          }
          if (file.size > 10 * 1024 * 1024) {
            onError('A imagem deve ter no máximo 10 MiB.');
            return;
          }
          onSelect(file);
        }}
        ref={inputRef}
        type="file"
      />
      {isPending ? (
        <span aria-live="polite" className={styles.status()}>
          Processando imagem…
        </span>
      ) : null}
    </div>
  );
}
