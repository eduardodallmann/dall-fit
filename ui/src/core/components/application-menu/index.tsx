import { Avatar, Button, Chip, Typography } from '@heroui/react';
import { Link, useLocation } from '@tanstack/react-router';
import { Dumbbell, House, LogOut } from 'lucide-react';

import type { Person } from '@dall-fit/types';

import { trackUiEvent } from '~/core/analytics';
import { getPersonInitials } from '~/core/components/application-menu/get-person-initials';
import { applicationMenuStyles } from '~/core/components/application-menu/styles';
import { PwaInstallAction } from '~/core/components/pwa-install-action';
import { ThemeToggle } from '~/core/components/theme-toggle';

const styles = applicationMenuStyles();

export interface ApplicationMenuProps {
  isLogoutPending?: boolean;
  onLogout?: () => void;
  onNavigate?: () => void;
  person: Person;
}

export function ApplicationMenu({
  isLogoutPending = false,
  onNavigate,
  onLogout,
  person,
}: Readonly<ApplicationMenuProps>) {
  const initials = getPersonInitials(person.name);
  const location = useLocation();
  const mockAuth = new URLSearchParams(location.searchStr).get('mockAuth');
  const adminSearch =
    mockAuth === 'admin' ? { mockAuth: 'admin' as const } : {};

  return (
    <div className={styles.content()}>
      <section aria-label="Pessoa autenticada" className={styles.identity()}>
        <Avatar
          aria-label={person.name}
          className={styles.avatar()}
          role="img"
          size="lg"
        >
          {person.photoUrl === null ? null : (
            <Avatar.Image alt="" src={person.photoUrl} />
          )}
          <Avatar.Fallback>{initials}</Avatar.Fallback>
        </Avatar>
        <div className={styles.identityTextGroup()}>
          <Typography
            className={styles.identityText()}
            truncate
            type="body-sm"
            weight="semibold"
          >
            {person.name}
          </Typography>
          <Typography
            className={styles.identityText()}
            color="muted"
            truncate
            type="body-xs"
          >
            {person.email}
          </Typography>
        </div>
        {person.isAdmin === true ? (
          <Chip color="accent" variant="soft">
            <Chip.Label>Admin</Chip.Label>
          </Chip>
        ) : null}
      </section>
      <section aria-label="Aparência" className={styles.appearance()}>
        <ThemeToggle />
      </section>
      <nav aria-label="Navegação principal" className={styles.navigation()}>
        <Link
          activeOptions={{ exact: true }}
          className={styles.navigationLink()}
          onClick={() => {
            trackUiEvent({
              control: 'home_link',
              destination: 'dash',
              eventName: 'ui_navigation_selected',
              navigationKind: 'menu',
              surface: 'application_menu',
            });
            onNavigate?.();
          }}
          to="/dash"
        >
          <House
            aria-hidden="true"
            className={styles.navigationIcon()}
            focusable="false"
          />
          <span>Home</span>
        </Link>
        {person.isAdmin === true ? (
          <Link
            activeOptions={{ includeSearch: false }}
            className={styles.navigationLink()}
            onClick={() => {
              trackUiEvent({
                control: 'training_plans_link',
                destination: 'training_plan_list',
                eventName: 'ui_navigation_selected',
                navigationKind: 'menu',
                surface: 'application_menu',
              });
              onNavigate?.();
            }}
            search={adminSearch}
            to="/global/training-plan"
          >
            <Dumbbell
              aria-hidden="true"
              className={styles.navigationIcon()}
              focusable="false"
            />
            <span>Planos de treino</span>
          </Link>
        ) : null}
      </nav>
      <PwaInstallAction />
      <Button
        className={styles.logout()}
        isPending={isLogoutPending}
        onPress={onLogout}
        variant="secondary"
      >
        <LogOut aria-hidden="true" focusable="false" />
        {isLogoutPending ? 'Saindo' : 'Sair'}
      </Button>
    </div>
  );
}
