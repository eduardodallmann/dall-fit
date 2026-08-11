import { useId, useRef } from 'react';

import { Button } from '@heroui/react';

import { imageFilePickerStyles } from './styles';

const styles = imageFilePickerStyles();
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface ImageFilePickerProps {
  imageUrl?: string;
  isPending: boolean;
  label: string;
  onError: (message: string) => void;
  onRemove?: () => void;
  onSelect: (file: File) => void;
}

export function ImageFilePicker({
  imageUrl,
  isPending,
  label,
  onError,
  onRemove,
  onSelect,
}: Readonly<ImageFilePickerProps>) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.root()}>
      {imageUrl === undefined ? null : (
        <img alt={label} className={styles.image()} src={imageUrl} />
      )}
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
