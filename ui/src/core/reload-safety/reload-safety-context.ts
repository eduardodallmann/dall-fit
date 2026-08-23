import { createContext, useContext, useId, useLayoutEffect } from 'react';

export interface ReloadSafetyContextValue {
  isBlocked: boolean;
  setBlocker: (owner: string, active: boolean) => void;
}

export const ReloadSafetyContext = createContext<
  ReloadSafetyContextValue | undefined
>(undefined);

export function useReloadBlocker(active: boolean): void {
  const context = useContext(ReloadSafetyContext);
  const owner = useId();

  useLayoutEffect(() => {
    if (context === undefined) return;

    context.setBlocker(owner, active);

    return () => context.setBlocker(owner, false);
  }, [active, context, owner]);
}

export function useReloadSafety(): Readonly<{ isBlocked: boolean }> {
  const context = useContext(ReloadSafetyContext);

  return { isBlocked: context?.isBlocked ?? false };
}
