import { useState, useSyncExternalStore } from 'react';

import { Alert, Button, Card } from '@heroui/react';

import { getGoogleLoginUrl } from '~/auth/auth-service';
import { useNativeSession } from '~/auth/native-session-context';
import { trackUiEvent } from '~/core/analytics';
import type { OfflineSyncSnapshot } from '~/core/platform/native/offline-sync';
import { useOfflineSync } from '~/core/platform/native/offline-sync-context';
import { usePlatform } from '~/core/platform/platform';
import { homeStyles } from '~/routes/home/styles';

const styles = homeStyles();

export interface HomePageProps {
  hasAuthError?: boolean;
  onNativeAuthenticated?: () => Promise<void> | void;
}

export function HomePage({
  hasAuthError = false,
  onNativeAuthenticated,
}: Readonly<HomePageProps>) {
  const nativeSession = useNativeSession();
  const platform = usePlatform();
  const offlineSync = useOfflineSync();
  const syncSnapshot = useSyncExternalStore(
    offlineSync?.subscribe ?? emptySubscribe,
    offlineSync?.getSnapshot ?? emptySnapshotReader,
  );
  const [isPending, setIsPending] = useState(false);
  const [hasNativeError, setHasNativeError] = useState(false);

  const startLogin = async () => {
    trackUiEvent({
      channel: platform.platform === 'android' ? 'native' : 'web',
      control: 'google_login',
      eventName: 'ui_operation_started',
      operation: 'google_login',
      surface: 'home',
    });
    if (platform.platform === 'web') {
      window.location.assign(getGoogleLoginUrl());
      return;
    }
    if (nativeSession === null || isPending) return;
    setIsPending(true);
    setHasNativeError(false);
    try {
      const result = await nativeSession.login();
      if (result.status === 'cancelled') return;
      trackUiEvent({
        channel: 'native',
        control: 'google_login',
        eventName: 'ui_operation_completed',
        operation: 'google_login',
        outcome: 'success',
        surface: 'home',
      });
      await onNativeAuthenticated?.();
    } catch {
      setHasNativeError(true);
      trackUiEvent({
        channel: 'native',
        control: 'google_login',
        eventName: 'ui_operation_completed',
        operation: 'google_login',
        outcome: 'error',
        surface: 'home',
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <main className={styles.page()}>
      <div className={styles.pageContent()}>
        {syncSnapshot.authenticationRequired === true ? (
          <Alert status="warning">
            <Alert.Title>Há dados aguardando envio</Alert.Title>
            <Alert.Description>
              Entre novamente com a mesma conta para continuar a sincronização.
            </Alert.Description>
          </Alert>
        ) : null}
        {hasAuthError || hasNativeError ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Não foi possível entrar.</Alert.Title>
              <Alert.Description>Tente novamente.</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        <Card>
          <Card.Header>
            <p className={styles.eyebrow()}>Dall Fit</p>
            <h1 className={styles.title()}>Entre para continuar</h1>
            <p className={styles.description()}>
              Use sua conta Google para acessar sua área.
            </p>
          </Card.Header>
          <Card.Footer>
            <Button
              isDisabled={
                platform.platform === 'android' && nativeSession === null
              }
              isPending={isPending}
              onPress={() => void startLogin()}
            >
              Entrar com Google
            </Button>
          </Card.Footer>
        </Card>
      </div>
    </main>
  );
}

const emptySubscribe = () => () => undefined;
const emptySnapshot: OfflineSyncSnapshot = {};
const emptySnapshotReader = () => emptySnapshot;
