import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ActionsMenu,
  DeleteConfirmationDialog,
  TrainingPlanConflictAlert,
  TrainingPlanForm,
  TrainingPlanFormModal,
} from '~/routes/training-plan/components';

const { trackUiEventMock } = vi.hoisted(() => ({
  trackUiEventMock:
    vi.fn<(event: { eventName: string; [key: string]: unknown }) => void>(),
}));

vi.mock('~/core/analytics', () => ({
  trackUiEvent: trackUiEventMock,
}));

describe('training plan analytics', () => {
  beforeEach(() => {
    trackUiEventMock.mockClear();
  });

  it('tracks field intent and completion without forwarding field content', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <TrainingPlanForm
        legend="Identificação do plano"
        mode="create"
        onSubmit={onSubmit}
        submitLabel="Criar plano"
      />,
    );
    const name = screen.getByRole('textbox', { name: 'Nome' });
    const description = screen.getByRole('textbox', { name: 'Descrição' });

    await user.type(name, 'Conteúdo privado do nome');
    await user.tab();
    await user.type(description, 'Conteúdo privado da descrição');
    await user.tab();
    await user.click(name);
    await user.click(description);
    await user.click(screen.getByRole('button', { name: 'Criar plano' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(
      trackUiEventMock.mock.calls.filter(
        ([event]) => event.eventName === 'ui_field_focused',
      ),
    ).toHaveLength(2);
    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_field_completed',
        field: 'name',
        state: 'valid',
      }),
    );
    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_form_submitted',
        mode: 'create',
      }),
    );
    expect(JSON.stringify(trackUiEventMock.mock.calls)).not.toContain(
      'Conteúdo privado',
    );
  });

  it('tracks modal and confirmation closure reasons', async () => {
    const user = userEvent.setup();
    const closeForm = vi.fn();
    const closeDelete = vi.fn();
    const { rerender } = render(
      <TrainingPlanFormModal
        onOpenChange={closeForm}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        open
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_overlay_closed',
        overlay: 'plan_form',
        reason: 'cancel',
      }),
    );
    expect(closeForm).toHaveBeenCalledWith(false);

    rerender(
      <DeleteConfirmationDialog
        description="Exclusão fictícia"
        onConfirm={vi.fn().mockResolvedValue(undefined)}
        onOpenChange={closeDelete}
        open
        surface="training_plan_list"
        title="Excluir?"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_overlay_closed',
        overlay: 'delete_confirmation',
        reason: 'cancel',
      }),
    );
    expect(closeDelete).toHaveBeenCalledWith(false);
  });

  it('tracks a row menu opening and its selected action once', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <ActionsMenu
        ariaLabel="Ações do plano"
        onDelete={vi.fn()}
        onEdit={onEdit}
        surface="training_plan_list"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ações do plano' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));

    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'ui_menu_opened',
        menu: 'row_actions',
      }),
    );
    expect(trackUiEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'edit',
        eventName: 'ui_menu_action_selected',
      }),
    );
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('reloads a workout conflict directly from the alert', async () => {
    const user = userEvent.setup();
    const onReload = vi.fn().mockResolvedValue(undefined);
    render(<TrainingPlanConflictAlert directReload onReload={onReload} />);

    await user.click(
      screen.getByRole('button', { name: 'Descartar e recarregar' }),
    );

    await waitFor(() => expect(onReload).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
