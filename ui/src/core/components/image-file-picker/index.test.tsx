import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ImageFilePicker } from '~/core/components/image-file-picker';

describe('ImageFilePicker', () => {
  it('shows an accessible retry after failure and recovers for a new URL', async () => {
    const user = userEvent.setup();
    const onImageLoadError = vi.fn();
    const onRetry = vi.fn();
    const props = {
      displayImageUrl: 'https://private.blob.test/display?signed=fake',
      imageUrl: 'https://private.blob.test/old?signed=fake',
      isDisabled: false,
      isPending: false,
      label: 'Imagem de Supino',
      onError: vi.fn(),
      onImageLoadError,
      onPreviewClose: vi.fn(),
      onPreviewOpen: vi.fn(),
      onRemove: vi.fn(),
      onRetry,
      onSelect: vi.fn(),
      previewTitle: 'Supino',
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

  it('opens the display image preview and restores focus on close', async () => {
    const user = userEvent.setup();
    const onPreviewClose = vi.fn();
    const onPreviewOpen = vi.fn();
    render(
      <ImageFilePicker
        displayImageUrl="https://private.blob.test/display.webp"
        imageUrl="https://private.blob.test/thumbnail.webp"
        isDisabled={false}
        isPending={false}
        label="Imagem de Supino"
        onError={vi.fn()}
        onImageLoadError={vi.fn()}
        onPreviewClose={onPreviewClose}
        onPreviewOpen={onPreviewOpen}
        onRemove={vi.fn()}
        onRetry={vi.fn()}
        onSelect={vi.fn()}
        previewTitle="Supino"
      />,
    );

    const trigger = screen.getByRole('button', {
      name: 'Visualizar imagem de supino',
    });
    await user.click(trigger);
    expect(onPreviewOpen).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole('dialog', { name: 'Imagem de Supino' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Supino' })).toBeVisible();
    expect(
      screen.getByRole('img', { name: 'Imagem de Supino' }),
    ).toHaveAttribute('src', 'https://private.blob.test/display.webp');

    await user.click(screen.getByRole('button', { name: 'Fechar imagem' }));
    expect(onPreviewClose).toHaveBeenCalledWith('close_trigger');
    expect(
      screen.queryByRole('dialog', { name: 'Imagem de Supino' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('accepts one valid dropped file and rejects multiple files', () => {
    const onError = vi.fn();
    const onSelect = vi.fn();
    render(
      <ImageFilePicker
        isDisabled={false}
        isPending={false}
        label="Imagem de Supino"
        onError={onError}
        onImageLoadError={vi.fn()}
        onPreviewClose={vi.fn()}
        onPreviewOpen={vi.fn()}
        onRetry={vi.fn()}
        onSelect={onSelect}
        previewTitle="Supino"
      />,
    );
    const dropZone = screen.getByRole('button', {
      name: 'Enviar imagem de supino',
    });
    const validFile = new File(['image'], 'supino.webp', {
      type: 'image/webp',
    });

    fireEvent.drop(dropZone, { dataTransfer: { files: [validFile] } });
    expect(onSelect).toHaveBeenCalledWith(validFile);

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [validFile, validFile] },
    });
    expect(onError).toHaveBeenCalledWith('Envie apenas uma imagem por vez.');
  });

  it('keeps pending feedback only in the accessible live region', () => {
    render(
      <ImageFilePicker
        isDisabled={false}
        isPending
        label="Imagem de Supino"
        onError={vi.fn()}
        onImageLoadError={vi.fn()}
        onPreviewClose={vi.fn()}
        onPreviewOpen={vi.fn()}
        onRetry={vi.fn()}
        onSelect={vi.fn()}
        previewTitle="Supino"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Enviar imagem de supino' }),
    ).toBeDisabled();
    expect(screen.getByText('Processando imagem')).toHaveClass('sr-only');
  });
});
