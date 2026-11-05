import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TrainingTimer } from '@dall-fit/types';

import { TrainingTimerOverlay } from '~/routes/training/timer-overlay';

const serverNow = '2030-01-01T00:00:00.000Z';
const timer: TrainingTimer = {
  endsAt: '2030-01-01T00:00:01.000Z',
  exerciseId: 'exercise-timer',
  kind: 'pause',
  startedAt: serverNow,
};

describe('training timer overlay', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each(['pause', 'series-rest'] as const)(
    'automatically resolves an expired %s, retaining the overlay during pending',
    async (kind) => {
      vi.useFakeTimers({
        toFake: ['setInterval', 'clearInterval', 'performance'],
      });
      const onResolve = vi.fn();
      const props = {
        error: false,
        isPending: false,
        onResolve,
        serverNow,
        timer: { ...timer, kind },
      };
      const view = render(<TrainingTimerOverlay {...props} />);
      expect(onResolve).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(onResolve).toHaveBeenCalledExactlyOnceWith('finish', true);
      view.rerender(<TrainingTimerOverlay {...props} isPending />);
      expect(
        screen.getByRole('dialog', { name: 'Descanso' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Pular descanso' }),
      ).toBeDisabled();
    },
  );

  it('detects an already expired rest at mount', () => {
    const onResolve = vi.fn();
    render(
      <TrainingTimerOverlay
        error={false}
        isPending={false}
        onResolve={onResolve}
        serverNow={timer.endsAt}
        timer={timer}
      />,
    );
    expect(onResolve).toHaveBeenCalledExactlyOnceWith('finish', true);
  });

  it.each(['Cancelar', 'Finalizar'] as const)(
    'keeps duration manual at zero and supports %s',
    async (action) => {
      vi.useFakeTimers({
        toFake: ['setInterval', 'clearInterval', 'performance'],
      });
      const onResolve = vi.fn();
      render(
        <TrainingTimerOverlay
          error={false}
          isPending={false}
          onResolve={onResolve}
          serverNow={serverNow}
          timer={{ ...timer, kind: 'duration' }}
        />,
      );
      await act(() => vi.advanceTimersByTimeAsync(2_000));
      expect(screen.getByText('00:00')).toBeInTheDocument();
      expect(onResolve).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: action }));
      expect(onResolve).toHaveBeenCalledWith(
        action === 'Cancelar' ? 'cancel' : 'finish',
      );
    },
  );

  it('shows a persistent failure and permits a manual skip', () => {
    const onResolve = vi.fn();
    render(
      <TrainingTimerOverlay
        error
        isPending={false}
        onResolve={onResolve}
        serverNow={serverNow}
        timer={timer}
      />,
    );
    expect(
      screen.getByText('Não foi possível encerrar o descanso.'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Pular descanso' }));
    expect(onResolve).toHaveBeenCalledWith('skip');
  });
});
