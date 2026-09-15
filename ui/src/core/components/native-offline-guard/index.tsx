import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { Alert, Button } from '@heroui/react';
import { useLocation, useNavigate } from '@tanstack/react-router';

import { useOfflinePreparation } from '~/core/platform/native/offline-preparation-context';
import { usePlatform } from '~/core/platform/platform';

import { nativeOfflineGuardStyles } from './styles';

const styles = nativeOfflineGuardStyles();

function subscribe(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

export function NativeOfflineGuard({
  children,
}: Readonly<{ children: ReactNode }>) {
  const platform = usePlatform();
  if (!platform.capabilities.nativeOfflineStorage) return children;
  return <ActiveNativeOfflineGuard>{children}</ActiveNativeOfflineGuard>;
}

function ActiveNativeOfflineGuard({
  children,
}: Readonly<{ children: ReactNode }>) {
  const preparation = useOfflinePreparation();
  const location = useLocation();
  const navigate = useNavigate();
  const online = useSyncExternalStore(subscribe, getOnlineSnapshot, () => true);
  const preparationSnapshot = useSyncExternalStore(
    preparation?.subscribe ?? (() => () => undefined),
    preparation?.getSnapshot ??
      (() => ({ error: false, status: 'failed' as const })),
  );
  const supported =
    location.pathname === '/training' ||
    location.pathname.startsWith('/training/workout/');
  const hasPlan =
    preparationSnapshot.status === 'ready' ||
    preparationSnapshot.status === 'ready-media-incomplete' ||
    preparationSnapshot.status === 'data-ready-media-in-progress';

  useEffect(() => {
    if (online || supported || preparation === null) return;
    void preparation.enter();
  }, [online, preparation, supported]);

  useEffect(() => {
    if (online || supported || !hasPlan) return;
    void navigate({ replace: true, to: '/training' });
  }, [hasPlan, navigate, online, supported]);

  if (online || supported) return children;
  if (hasPlan) return null;

  return (
    <main className={styles.page()}>
      <Alert status="warning">
        <Alert.Title>Conexão necessária</Alert.Title>
        <Alert.Description>
          Esta área não está disponível offline. Conecte-se para continuar ou
          tente abrir seus treinos preparados.
        </Alert.Description>
      </Alert>
      <div className={styles.actions()}>
        <Button onPress={() => void preparation?.retry()} variant="primary">
          Tentar novamente
        </Button>
      </div>
    </main>
  );
}
