import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { useIsMutating } from '@tanstack/react-query';

import {
  ReloadSafetyContext,
  useReloadBlocker,
  type ReloadSafetyContextValue,
} from '~/core/reload-safety/reload-safety-context';

function PendingMutationReloadBlocker() {
  const pendingMutationCount = useIsMutating();

  useReloadBlocker(pendingMutationCount > 0);

  return null;
}

export function ReloadSafetyProvider({
  children,
}: Readonly<PropsWithChildren>) {
  const [blockers, setBlockers] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const setBlocker = useCallback((owner: string, active: boolean) => {
    setBlockers((current) => {
      const alreadyActive = current.has(owner);

      if (alreadyActive === active) return current;

      const next = new Set(current);
      if (active) next.add(owner);
      else next.delete(owner);

      return next;
    });
  }, []);
  const value = useMemo<ReloadSafetyContextValue>(
    () => ({ isBlocked: blockers.size > 0, setBlocker }),
    [blockers.size, setBlocker],
  );

  useEffect(() => {
    if (!value.isBlocked) return;

    const preventUnsafeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };

    window.addEventListener('beforeunload', preventUnsafeUnload);
    return () =>
      window.removeEventListener('beforeunload', preventUnsafeUnload);
  }, [value.isBlocked]);

  return (
    <ReloadSafetyContext value={value}>
      <PendingMutationReloadBlocker />
      {children}
    </ReloadSafetyContext>
  );
}
