import { useEffect, useRef, type ReactNode } from 'react';

import { Alert, Button } from '@heroui/react';

import { refreshConnectivity, useConnectivity } from '~/core/connectivity';
import { usePlatform } from '~/core/platform/platform';

import { webConnectivityGuardStyles } from './styles';

const styles = webConnectivityGuardStyles();

export function WebConnectivityGuard({
  children,
}: Readonly<{ children: ReactNode }>) {
  const platform = usePlatform();
  if (platform.platform !== 'web') return children;
  return <ActiveWebConnectivityGuard>{children}</ActiveWebConnectivityGuard>;
}

function ActiveWebConnectivityGuard({
  children,
}: Readonly<{ children: ReactNode }>) {
  const online = useConnectivity();
  if (online) return children;
  return <ConnectionRequired />;
}

function ConnectionRequired() {
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.focus();
  }, []);

  return (
    <main
      aria-labelledby="web-connection-required-title"
      className={styles.page()}
      ref={mainRef}
      tabIndex={-1}
    >
      <h1 className={styles.heading()} id="web-connection-required-title">
        Conexão necessária
      </h1>
      <Alert status="warning">
        <Alert.Description>
          Conecte-se à internet para continuar usando o Dall Fit. Treinos
          offline estão disponíveis no aplicativo Android.
        </Alert.Description>
      </Alert>
      <div className={styles.actions()}>
        <Button onPress={refreshConnectivity} variant="primary">
          Tentar novamente
        </Button>
      </div>
    </main>
  );
}
