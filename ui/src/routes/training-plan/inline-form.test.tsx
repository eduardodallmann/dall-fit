import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TrainingPlanInlineForm } from '~/routes/training-plan/inline-form';

describe('TrainingPlanInlineForm', () => {
  it('confirma a edição do plano com Ctrl+Enter', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <TrainingPlanInlineForm
        defaultValues={{ description: 'Descrição válida', name: 'Plano A' }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const name = screen.getByRole('textbox', { name: 'Nome' });
    await user.clear(name);
    await user.type(name, 'Plano pelo teclado');
    await user.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        description: 'Descrição válida',
        name: 'Plano pelo teclado',
      }),
    );
  });
});
