import { Alert, Button } from '@heroui/react';

import { pwaUpdateNoticeStyles } from '~/core/components/pwa-update-notice/styles';
import { usePwa } from '~/core/pwa/pwa-context';

const styles = pwaUpdateNoticeStyles();

export function PwaUpdateNotice() {
  const { dismissUpdate, isUpdating, needRefresh, update, updateFailed } =
    usePwa();

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
          <Alert.Title>
            {updateFailed
              ? 'Não foi possível atualizar'
              : 'Nova versão disponível'}
          </Alert.Title>
          <Alert.Description>
            {updateFailed
              ? 'Continue usando esta versão e tente novamente.'
              : 'Atualize para usar a versão mais recente.'}
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
            {updateFailed ? 'Tentar atualizar' : 'Atualizar agora'}
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
