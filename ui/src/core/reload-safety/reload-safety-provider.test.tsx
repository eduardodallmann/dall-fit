import { useState } from 'react';

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ReloadBlocker } from '~/core/reload-safety/reload-blocker';
import { useReloadSafety } from '~/core/reload-safety/reload-safety-context';
import { ReloadSafetyProvider } from '~/core/reload-safety/reload-safety-provider';
import { TrainingPlanForm } from '~/routes/training-plan/components';

function SafetyProbe() {
  const { isBlocked } = useReloadSafety();

  return <span>{isBlocked ? 'blocked' : 'safe'}</span>;
}

function Harness() {
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);

  return (
    <>
      {first ? <ReloadBlocker active /> : null}
      {second ? <ReloadBlocker active /> : null}
      <button onClick={() => setFirst((current) => !current)} type="button">
        first
      </button>
      <button onClick={() => setSecond((current) => !current)} type="button">
        second
      </button>
      <SafetyProbe />
    </>
  );
}

function MutationHarness() {
  const mutation = useMutation({
    mutationFn: () => new Promise<void>(() => undefined),
  });

  return (
    <>
      <button onClick={() => mutation.mutate()} type="button">
        mutate
      </button>
      <SafetyProbe />
    </>
  );
}

function renderSafety(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ReloadSafetyProvider>{children}</ReloadSafetyProvider>
    </QueryClientProvider>,
  );
}

describe('ReloadSafetyProvider', () => {
  it('tracks multiple stable owners and removes them on unmount', async () => {
    const user = userEvent.setup();
    renderSafety(<Harness />);

    expect(screen.getByText('safe')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'first' }));
    expect(screen.getByText('blocked')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'second' }));
    await user.click(screen.getByRole('button', { name: 'first' }));
    expect(screen.getByText('blocked')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'second' }));
    expect(screen.getByText('safe')).toBeInTheDocument();
  });

  it('prevents a manual document unload only while work is recoverable', async () => {
    const user = userEvent.setup();
    renderSafety(<Harness />);

    expect(
      window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'first' }));

    expect(
      window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
    ).toBe(false);

    await user.click(screen.getByRole('button', { name: 'first' }));

    expect(
      window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
    ).toBe(true);
  });

  it('blocks reload while any TanStack mutation is pending', async () => {
    const user = userEvent.setup();
    renderSafety(<MutationHarness />);

    expect(screen.getByText('safe')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'mutate' }));
    expect(screen.getByText('blocked')).toBeInTheDocument();
  });

  it('integrates a changed training-plan form as recoverable work', async () => {
    const user = userEvent.setup();
    renderSafety(
      <>
        <TrainingPlanForm
          legend="Criar plano"
          mode="create"
          onSubmit={() => Promise.resolve()}
          submitLabel="Criar"
        />
        <SafetyProbe />
      </>,
    );

    expect(screen.getByText('safe')).toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'Nome' });
    await user.type(name, 'Plano');
    expect(screen.getByText('blocked')).toBeInTheDocument();
    await user.clear(name);
    expect(screen.getByText('safe')).toBeInTheDocument();
  });
});
