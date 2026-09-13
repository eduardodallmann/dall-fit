import { useState } from 'react';

import { Alert, Button, Card } from '@heroui/react';

import { getGoogleLoginUrl } from '~/auth/auth-service';
import { useNativeSession } from '~/auth/native-session-context';
import { trackUiEvent } from '~/core/analytics';
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
