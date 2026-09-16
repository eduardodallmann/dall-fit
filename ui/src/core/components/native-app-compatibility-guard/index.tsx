import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { Alert, AlertDialog, Button } from '@heroui/react';

import { useNativeAppCompatibility } from '~/core/platform/native/app-compatibility-context';
import { usePlatform } from '~/core/platform/platform';
import { router } from '~/routes/routes';

import { nativeAppCompatibilityGuardStyles } from './styles';

const styles = nativeAppCompatibilityGuardStyles();

export function NativeAppCompatibilityGuard({
  children,
}: Readonly<{ children: ReactNode }>) {
  const platform = usePlatform();
  const coordinator = useNativeAppCompatibility();
  if (!platform.capabilities.nativeBridge || coordinator === null)
    return children;
  return (
    <ActiveNativeAppCompatibilityGuard coordinator={coordinator}>
      {children}
    </ActiveNativeAppCompatibilityGuard>
  );
}

function ActiveNativeAppCompatibilityGuard({
  children,
  coordinator,
}: Readonly<{
  children: ReactNode;
  coordinator: NonNullable<ReturnType<typeof useNativeAppCompatibility>>;
}>) {
  const snapshot = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
  );
  const pathname = useSyncExternalStore(
    subscribeToResolvedNavigation,
    getResolvedPathname,
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [acknowledgingRecovery, setAcknowledgingRecovery] = useState(false);
  const [recoveryAcknowledgementFailed, setRecoveryAcknowledgementFailed] =
    useState(false);
  const activeWorkoutPath =
    snapshot.activeWorkoutId === undefined
      ? undefined
      : `/training/workout/${snapshot.activeWorkoutId}`;
  const mayFinishActiveWorkout =
    snapshot.updateRequired && pathname === activeWorkoutPath;

  useEffect(() => {
    if (snapshot.updateRequired && !mayFinishActiveWorkout)
      headingRef.current?.focus();
  }, [mayFinishActiveWorkout, snapshot.updateRequired]);

  if (!snapshot.updateRequired || mayFinishActiveWorkout)
    return (
      <>
        {children}
        <AlertDialog isOpen={snapshot.recoveryRequired}>
          <AlertDialog.Backdrop isDismissable={false} isKeyboardDismissDisabled>
            <AlertDialog.Container>
              <AlertDialog.Dialog>
                <AlertDialog.Header>
                  <AlertDialog.Heading>
                    Dados offline redefinidos
                  </AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  Não foi possível migrar os dados offline deste aparelho. Eles
                  foram redefinidos e treinos que ainda não tinham sido enviados
                  podem ter sido perdidos.
                  {recoveryAcknowledgementFailed ? (
                    <Alert status="danger">
                      <Alert.Title>Não foi possível continuar</Alert.Title>
                      <Alert.Description>
                        Tente reconhecer o aviso novamente.
                      </Alert.Description>
                    </Alert>
                  ) : null}
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button
                    isPending={acknowledgingRecovery}
                    onPress={() => {
                      setAcknowledgingRecovery(true);
                      setRecoveryAcknowledgementFailed(false);
                      void coordinator
                        .acknowledgeRecovery()
                        .catch(() => setRecoveryAcknowledgementFailed(true))
                        .finally(() => setAcknowledgingRecovery(false));
                    }}
                    variant="primary"
                  >
                    Entendi
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      </>
    );

  return (
    <main className={styles.page()}>
      <div>
        <h1 className={styles.title()} ref={headingRef} tabIndex={-1}>
          Atualização necessária
        </h1>
        <p className={styles.text()}>
          Atualize o Dall Fit para continuar usando o aplicativo com segurança.
        </p>
      </div>
      {snapshot.storeOpenFailed ? (
        <Alert status="danger">
          <Alert.Title>Não foi possível abrir a loja</Alert.Title>
          <Alert.Description>
            Tente novamente. Se a Play Store não estiver disponível, o link será
            aberto no navegador.
          </Alert.Description>
        </Alert>
      ) : null}
      <div className={styles.actions()}>
        <Button onPress={() => void coordinator.openStore()} variant="primary">
          Atualizar na Play Store
        </Button>
      </div>
    </main>
  );
}

function subscribeToResolvedNavigation(listener: () => void): () => void {
  return router.subscribe('onResolved', listener);
}

function getResolvedPathname(): string {
  return window.location.pathname;
}
