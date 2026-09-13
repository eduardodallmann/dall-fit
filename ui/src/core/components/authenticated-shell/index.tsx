import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button, Drawer, toast, useOverlayState } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';
import { Menu } from 'lucide-react';

import type { Person } from '@dall-fit/types';

import {
  logout as logoutSession,
  type MockAuthScenario,
} from '~/auth/auth-service';
import { useNativeSession } from '~/auth/native-session-context';
import { endSession } from '~/auth/session-lifecycle';
import { trackUiEvent } from '~/core/analytics';
import { ApplicationMenu } from '~/core/components/application-menu';
import { authenticatedShellStyles } from '~/core/components/authenticated-shell/styles';
import { NativeLogoutDialog } from '~/core/components/native-logout-dialog';
import { usePlatform } from '~/core/platform/platform';

const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';
const styles = authenticatedShellStyles();

export interface AuthenticatedShellProps {
  children: ReactNode;
  mockAuth?: MockAuthScenario;
  person: Person;
}

export function AuthenticatedShell({
  children,
  mockAuth = 'authenticated',
  person,
}: Readonly<AuthenticatedShellProps>) {
  const drawerOpenRef = useRef(false);
  const nativeSession = useNativeSession();
  const platform = usePlatform();
  const [isCheckingPending, setIsCheckingPending] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const isNative = platform.platform === 'android';
  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (isNative) {
        if (nativeSession === null)
          throw new Error('Native session is unavailable.');
        await nativeSession.logout();
        return;
      }
      await logoutSession(mockAuth);
    },
    onMutate: () => {
      trackUiEvent({
        channel: isNative ? 'native' : 'web',
        control: 'logout',
        eventName: 'ui_operation_started',
        operation: 'logout',
        surface: 'application_menu',
      });
    },
    onSuccess: async () => {
      setIsLogoutDialogOpen(false);
      trackUiEvent({
        channel: isNative ? 'native' : 'web',
        control: 'logout',
        eventName: 'ui_operation_completed',
        operation: 'logout',
        outcome: 'success',
        surface: 'application_menu',
      });
      if (!isNative) await endSession('logout');
    },
    onError: async () => {
      trackUiEvent({
        channel: isNative ? 'native' : 'web',
        control: 'logout',
        eventName: 'ui_operation_completed',
        operation: 'logout',
        outcome: 'error',
        surface: 'application_menu',
      });
      toast.danger('Não foi possível sair. Tente novamente.');
      if (!isNative) await endSession('logout');
    },
  });
  const requestLogout = useCallback(async () => {
    if (!isNative || nativeSession === null) {
      logoutMutation.mutate();
      return;
    }
    if (isCheckingPending || logoutMutation.isPending) return;
    setIsCheckingPending(true);
    try {
      if (await nativeSession.hasPendingChanges()) {
        setIsLogoutDialogOpen(true);
      } else {
        logoutMutation.mutate();
      }
    } catch {
      toast.danger(
        'Não foi possível verificar os dados locais. Tente novamente.',
      );
    } finally {
      setIsCheckingPending(false);
    }
  }, [isCheckingPending, isNative, logoutMutation, nativeSession]);
  const closeReasonRef = useRef<
    'backdrop' | 'breakpoint' | 'close_trigger' | 'escape' | 'navigation'
  >('backdrop');
  const handleDrawerOpenChange = useCallback((isOpen: boolean) => {
    if (isOpen) {
      if (!drawerOpenRef.current) {
        trackUiEvent({
          control: 'mobile_menu',
          eventName: 'ui_menu_opened',
          menu: 'application',
          surface: 'authenticated_shell',
        });
      }
      drawerOpenRef.current = true;

      return;
    }

    if (!drawerOpenRef.current) {
      return;
    }

    trackUiEvent({
      control: 'mobile_menu',
      eventName: 'ui_overlay_closed',
      overlay: 'application_menu',
      reason: closeReasonRef.current,
      surface: 'authenticated_shell',
    });
    drawerOpenRef.current = false;
    closeReasonRef.current = 'backdrop';
  }, []);
  const drawerState = useOverlayState({
    onOpenChange: handleDrawerOpenChange,
  });
  const closeDrawer = useCallback(
    (reason: typeof closeReasonRef.current) => {
      closeReasonRef.current = reason;
      drawerState.close();
    },
    [drawerState],
  );

  useEffect(() => {
    if (!drawerState.isOpen) {
      return;
    }

    const markEscapeClose = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeReasonRef.current = 'escape';
      }
    };

    document.addEventListener('keydown', markEscapeClose, true);

    return () => {
      document.removeEventListener('keydown', markEscapeClose, true);
    };
  }, [drawerState.isOpen]);

  useEffect(() => {
    const desktopMediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const closeDrawerOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) {
        closeDrawer('breakpoint');
      }
    };

    desktopMediaQuery.addEventListener('change', closeDrawerOnDesktop);

    return () => {
      desktopMediaQuery.removeEventListener('change', closeDrawerOnDesktop);
    };
  }, [closeDrawer]);

  return (
    <div className={styles.shell()}>
      <aside aria-label="Menu da aplicação" className={styles.desktopMenu()}>
        <ApplicationMenu
          isLogoutPending={isCheckingPending || logoutMutation.isPending}
          onLogout={() => void requestLogout()}
          person={person}
          showPwaInstall={!isNative}
        />
      </aside>
      <div className={styles.mobileTrigger()}>
        <Drawer state={drawerState}>
          <Button aria-label="Abrir menu" isIconOnly variant="secondary">
            <Menu
              aria-hidden="true"
              className={styles.menuIcon()}
              focusable="false"
            />
          </Button>
          <Drawer.Backdrop
            isDismissable
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeReasonRef.current = 'backdrop';
              }
            }}
          >
            <Drawer.Content placement="left">
              <Drawer.Dialog
                aria-label="Menu da aplicação"
                className={styles.drawerDialog()}
              >
                <Drawer.CloseTrigger
                  aria-label="Fechar menu"
                  className={styles.drawerCloseTrigger()}
                  onPressStart={() => {
                    closeReasonRef.current = 'close_trigger';
                  }}
                />
                <Drawer.Body className={styles.drawerBody()}>
                  <ApplicationMenu
                    isLogoutPending={
                      isCheckingPending || logoutMutation.isPending
                    }
                    onNavigate={() => closeDrawer('navigation')}
                    onLogout={() => void requestLogout()}
                    person={person}
                    showPwaInstall={!isNative}
                  />
                </Drawer.Body>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>
      </div>
      <main className={styles.content()}>{children}</main>
      <NativeLogoutDialog
        isOpen={isLogoutDialogOpen}
        isPending={logoutMutation.isPending}
        onCancel={() => setIsLogoutDialogOpen(false)}
        onConfirm={() => {
          logoutMutation.mutate();
        }}
      />
    </div>
  );
}
