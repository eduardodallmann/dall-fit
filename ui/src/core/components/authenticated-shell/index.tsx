import { useCallback, useEffect, useRef, type ReactNode } from 'react';

import { Button, Drawer, toast, useOverlayState } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { Menu } from 'lucide-react';

import type { Person } from '@dall-fit/types';

import {
  logout as logoutSession,
  type MockAuthScenario,
} from '~/auth/auth-service';
import { clearCsrfToken } from '~/auth/csrf-token';
import { trackUiEvent } from '~/core/analytics';
import { ApplicationMenu } from '~/core/components/application-menu';
import { authenticatedShellStyles } from '~/core/components/authenticated-shell/styles';

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
  const queryClient = useQueryClient();
  const router = useRouter();
  const logoutMutation = useMutation({
    mutationFn: () => logoutSession(mockAuth),
    onMutate: () => {
      trackUiEvent({
        control: 'logout',
        eventName: 'ui_operation_started',
        operation: 'logout',
        surface: 'application_menu',
      });
    },
    onSuccess: () => {
      trackUiEvent({
        control: 'logout',
        eventName: 'ui_operation_completed',
        operation: 'logout',
        outcome: 'success',
        surface: 'application_menu',
      });
      clearCsrfToken();
      queryClient.clear();
      void router.navigate({ replace: true, to: '/' });
    },
    onError: () => {
      trackUiEvent({
        control: 'logout',
        eventName: 'ui_operation_completed',
        operation: 'logout',
        outcome: 'error',
        surface: 'application_menu',
      });
      toast.danger('Não foi possível sair. Tente novamente.');
    },
  });
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
          isLogoutPending={logoutMutation.isPending}
          onLogout={() => logoutMutation.mutate()}
          person={person}
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
                  onPressStart={() => {
                    closeReasonRef.current = 'close_trigger';
                  }}
                />
                <Drawer.Body className={styles.drawerBody()}>
                  <ApplicationMenu
                    isLogoutPending={logoutMutation.isPending}
                    onNavigate={() => closeDrawer('navigation')}
                    onLogout={() => logoutMutation.mutate()}
                    person={person}
                  />
                </Drawer.Body>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>
      </div>
      <main className={styles.content()}>{children}</main>
    </div>
  );
}
