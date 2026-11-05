import { useEffect, useState } from 'react';

import {
  Alert,
  Button,
  Drawer,
  Modal,
  ProgressBar,
  useMediaQuery,
  useOverlayState,
} from '@heroui/react';

import type { TrainingTimer } from '@dall-fit/types';

import { trainingStyles } from '~/routes/training/styles';

const styles = trainingStyles();

interface TrainingTimerOverlayProps {
  error: boolean;
  isPending: boolean;
  onResolve: (
    outcome: 'cancel' | 'finish' | 'skip',
    automatic?: boolean,
  ) => void;
  serverNow: string;
  timer: TrainingTimer;
}

export function TrainingTimerOverlay({
  error,
  isPending,
  onResolve,
  serverNow,
  timer,
}: Readonly<TrainingTimerOverlayProps>) {
  const isDesktop = useMediaQuery('(min-width: 768px)', {
    defaultValue: true,
  });
  const state = useOverlayState({ defaultOpen: true });
  const [currentTime, setCurrentTime] = useState(new Date(serverNow).getTime());
  const start = new Date(timer.startedAt).getTime();
  const end = new Date(timer.endsAt).getTime();
  const total = Math.max(1, end - start);
  const remainingMs = Math.max(0, end - currentTime);
  const progress = Math.min(
    100,
    Math.max(0, ((total - remainingMs) / total) * 100),
  );
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    const serverStartedAt = new Date(serverNow).getTime();
    const clientStartedAt = performance.now();
    const interval = window.setInterval(() => {
      setCurrentTime(serverStartedAt + performance.now() - clientStartedAt);
    }, 250);
    return () => window.clearInterval(interval);
  }, [serverNow]);

  useEffect(() => {
    if (timer.kind !== 'duration' && remainingMs === 0 && !isPending)
      onResolve('finish', true);
  }, [isPending, onResolve, remainingMs, timer.kind]);

  const resolve = (outcome: 'cancel' | 'finish' | 'skip') => {
    if (isPending) return;
    onResolve(outcome);
  };
  const handleOpenChange = (open: boolean) => {
    if (open) return;
    if (timer.kind === 'duration') resolve('cancel');
    else resolve('skip');
  };
  const title = timer.kind === 'duration' ? 'Cronômetro' : 'Descanso';
  const content = (
    <div className={styles.overlayBody()}>
      <h2 className={styles.timerTitle()}>{title}</h2>
      <p aria-live="polite" className={styles.overlayCountdown()}>
        {formatTimer(remainingSeconds, timer.kind === 'duration')}
      </p>
      <ProgressBar
        aria-label={`Progresso de ${title.toLocaleLowerCase('pt-BR')}`}
        className={styles.progress()}
        maxValue={100}
        value={progress}
      >
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
      {error ? (
        <Alert status="danger">
          <Alert.Title>
            Não foi possível encerrar o {title.toLocaleLowerCase('pt-BR')}.
          </Alert.Title>
          <Alert.Description>
            Tente novamente pela ação abaixo.
          </Alert.Description>
        </Alert>
      ) : null}
      <div className={styles.overlayActions()}>
        {timer.kind === 'duration' ? (
          <>
            <Button
              isDisabled={isPending}
              onPress={() => resolve('cancel')}
              variant="secondary"
            >
              Cancelar
            </Button>
            <Button
              isPending={isPending}
              onPress={() => resolve('finish')}
              variant="primary"
            >
              Finalizar
            </Button>
          </>
        ) : (
          <Button
            isDisabled={isPending}
            isPending={isPending}
            onPress={() => resolve('skip')}
            variant="primary"
          >
            Pular descanso
          </Button>
        )}
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Modal state={{ ...state, setOpen: handleOpenChange }}>
        <Modal.Backdrop
          isDismissable={!isPending && timer.kind === 'series-rest'}
          isKeyboardDismissDisabled={timer.kind !== 'series-rest'}
        >
          <Modal.Container size="sm">
            <Modal.Dialog aria-label={title}>{content}</Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    );
  }

  return (
    <Drawer state={{ ...state, setOpen: handleOpenChange }}>
      <Drawer.Backdrop
        isDismissable={!isPending && timer.kind === 'series-rest'}
      >
        <Drawer.Content className={styles.drawerContent()} placement="bottom">
          <Drawer.Dialog aria-label={title} className={styles.drawerDialog()}>
            <Drawer.Handle className={styles.drawerHandle()} />
            <Drawer.Body className={styles.drawerBody()}>{content}</Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

function formatTimer(seconds: number, clock: boolean): string {
  if (!clock) return String(seconds);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}
