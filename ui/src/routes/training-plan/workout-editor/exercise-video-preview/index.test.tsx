import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExerciseVideoPreview } from '.';

const { playerMock, trackUiEventMock } = vi.hoisted(() => ({
  playerMock: vi.fn(() => <div data-testid="react-player" />),
  trackUiEventMock: vi.fn(),
}));

vi.mock('react-player', () => ({ default: playerMock }));
vi.mock('~/core/analytics', () => ({ trackUiEvent: trackUiEventMock }));

describe('ExerciseVideoPreview', () => {
  beforeEach(() => {
    playerMock.mockClear();
    trackUiEventMock.mockClear();
  });

  it('mounts the muted inline player only while its modal is open', async () => {
    const user = userEvent.setup();
    render(
      <ExerciseVideoPreview
        exerciseName="Supino"
        isDisabled={false}
        orientation="horizontal"
        youtubeId="ZA8gs8XP2bs"
      />,
    );

    const trigger = screen.getByRole('button', {
      name: 'Reproduzir vídeo de Supino',
    });
    expect(screen.queryByTestId('react-player')).not.toBeInTheDocument();
    await user.click(trigger);

    expect(await screen.findByTestId('react-player')).toBeVisible();
    expect(playerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { youtube: { cc_load_policy: 0 } },
        muted: true,
        playing: true,
        playsInline: true,
        src: 'https://www.youtube.com/watch?v=ZA8gs8XP2bs',
        height: '100%',
        width: '100%',
      }),
      undefined,
    );
    expect(screen.getByRole('heading', { name: 'Supino' })).toBeVisible();
    expect(trackUiEventMock).toHaveBeenCalledWith({
      control: 'video_preview',
      eventName: 'ui_overlay_opened',
      overlay: 'exercise_video_preview',
      surface: 'workout',
    });

    await user.click(screen.getByRole('button', { name: 'Fechar vídeo' }));
    expect(screen.queryByTestId('react-player')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trackUiEventMock).toHaveBeenLastCalledWith({
      control: 'video_preview',
      eventName: 'ui_overlay_closed',
      overlay: 'exercise_video_preview',
      reason: 'close_trigger',
      surface: 'workout',
    });
  });
});
