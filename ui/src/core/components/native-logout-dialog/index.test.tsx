import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NativeLogoutDialog } from '~/core/components/native-logout-dialog';

describe('NativeLogoutDialog', () => {
  it('offers the exact destructive decision and starts focus on cancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <NativeLogoutDialog
        isOpen
        isPending={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    const cancel = await screen.findByRole('button', { name: 'Cancelar' });
    expect(cancel).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Sair e apagar dados' }),
    ).toBeVisible();
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
