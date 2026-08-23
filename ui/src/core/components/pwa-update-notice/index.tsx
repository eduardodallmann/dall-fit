import { Alert, Button } from '@heroui/react';

import { pwaUpdateNoticeStyles } from '~/core/components/pwa-update-notice/styles';
import { usePwa } from '~/core/pwa/pwa-context';

const styles = pwaUpdateNoticeStyles();

export function PwaUpdateNotice() {
  const { dismissUpdate, isUpdating, update, updateFailed } = usePwa();

  if (!updateFailed) return null;

  return (
    <Alert
      aria-live="polite"
      className={styles.notice()}
      role="status"
      status="accent"
    >
      <Alert.Indicator />
      <Alert.Content className={styles.content()}>
        <div className={styles.message()}>
          <Alert.Title>Não foi possível atualizar</Alert.Title>
          <Alert.Description>
            Você pode continuar usando esta versão e tentar novamente.
          </Alert.Description>
        </div>
        <div className={styles.actions()}>
          <Button
            isPending={isUpdating}
            onPress={() => {
              update().catch(() => undefined);
            }}
            variant="primary"
          >
            Tentar novamente
          </Button>
          <Button
            isDisabled={isUpdating}
            onPress={dismissUpdate}
            variant="tertiary"
          >
            Continuar
          </Button>
        </div>
      </Alert.Content>
    </Alert>
  );
}
