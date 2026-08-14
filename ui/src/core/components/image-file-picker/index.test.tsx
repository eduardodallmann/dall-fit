import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ImageFilePicker } from '~/core/components/image-file-picker';

describe('ImageFilePicker', () => {
  it('shows an accessible retry after failure and recovers for a new URL', async () => {
    const user = userEvent.setup();
    const onImageLoadError = vi.fn();
    const onRetry = vi.fn();
    const props = {
      imageUrl: 'https://private.blob.test/old?signed=fake',
      isPending: false,
      label: 'Imagem de Supino',
      onError: vi.fn(),
      onImageLoadError,
      onRemove: vi.fn(),
      onRetry,
      onSelect: vi.fn(),
    };
    const view = render(<ImageFilePicker {...props} />);

    fireEvent.error(screen.getByRole('img', { name: props.label }));

    expect(onImageLoadError).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Imagem indisponível.',
    );
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledOnce();

    const refreshedUrl = 'https://private.blob.test/new?signed=fake-new';
    view.rerender(<ImageFilePicker {...props} imageUrl={refreshedUrl} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: props.label })).toHaveAttribute(
      'src',
      refreshedUrl,
    );
  });
});
