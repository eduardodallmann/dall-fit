import { useCallback, useEffect, type ReactNode } from 'react';

import { Button, Drawer, useOverlayState } from '@heroui/react';
import { Menu } from 'lucide-react';

import type { Person } from '@dall-fit/types';

import { ApplicationMenu } from '~/core/components/application-menu';
import { authenticatedShellStyles } from '~/core/components/authenticated-shell/styles';

const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';
const styles = authenticatedShellStyles();

export interface AuthenticatedShellProps {
  children: ReactNode;
  person: Person;
}

export function AuthenticatedShell({
  children,
  person,
}: Readonly<AuthenticatedShellProps>) {
  const drawerState = useOverlayState();
  const closeDrawer = useCallback(() => {
    drawerState.close();
  }, [drawerState]);

  useEffect(() => {
    const desktopMediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const closeDrawerOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) {
        closeDrawer();
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
        <ApplicationMenu person={person} />
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
          <Drawer.Backdrop isDismissable>
            <Drawer.Content placement="left">
              <Drawer.Dialog
                aria-label="Menu da aplicação"
                className={styles.drawerDialog()}
              >
                <Drawer.CloseTrigger aria-label="Fechar menu" />
                <Drawer.Body className={styles.drawerBody()}>
                  <ApplicationMenu onNavigate={closeDrawer} person={person} />
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
