import { Alert, Button } from '@heroui/react';

import { pwaUpdateNoticeStyles } from '~/core/components/pwa-update-notice/styles';
import { usePwa } from '~/core/pwa/pwa-context';

const styles = pwaUpdateNoticeStyles();

export function PwaUpdateNotice() {
  const { dismissUpdate, isUpdating, needRefresh, update } = usePwa();

  if (!needRefresh) {
    return null;
  }

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
          <Alert.Title>Nova versão disponível</Alert.Title>
          <Alert.Description>
            Atualize para usar a versão mais recente.
          </Alert.Description>
        </div>
        <div className={styles.actions()}>
          <Button
            isPending={isUpdating}
            onPress={() => void update()}
            variant="primary"
          >
            Atualizar agora
          </Button>
          <Button
            isDisabled={isUpdating}
            onPress={dismissUpdate}
            variant="tertiary"
          >
            Agora não
          </Button>
        </div>
      </Alert.Content>
    </Alert>
  );
}
