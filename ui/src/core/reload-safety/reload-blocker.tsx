import { useReloadBlocker } from '~/core/reload-safety/reload-safety-context';

export function ReloadBlocker({ active }: Readonly<{ active: boolean }>) {
  useReloadBlocker(active);

  return null;
}
