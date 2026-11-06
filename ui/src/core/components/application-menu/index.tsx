import { Avatar, Button, Chip, Typography } from '@heroui/react';
import { Link, useLocation } from '@tanstack/react-router';
import {
  Dumbbell,
  FilePenLine,
  FileText,
  House,
  LogOut,
  Play,
} from 'lucide-react';

import type { Person } from '@dall-fit/types';

import { trackUiEvent } from '~/core/analytics';
import { getPersonInitials } from '~/core/components/application-menu/get-person-initials';
import { applicationMenuStyles } from '~/core/components/application-menu/styles';
import { PwaInstallAction } from '~/core/components/pwa-install-action';
import { ThemeToggle } from '~/core/components/theme-toggle';

const styles = applicationMenuStyles();

export interface ApplicationMenuProps {
  isLogoutPending?: boolean;
  termsRestricted?: boolean;
  onLogout: () => void;
  onNavigate?: () => void;
  person: Person;
  showPwaInstall?: boolean;
}

export function ApplicationMenu({
  isLogoutPending = false,
  termsRestricted = false,
  onNavigate,
  onLogout,
  person,
  showPwaInstall = true,
}: Readonly<ApplicationMenuProps>) {
  const initials = getPersonInitials(person.name);
  const location = useLocation();
  const mockAuth = new URLSearchParams(location.searchStr).get('mockAuth');
  const adminSearch =
    mockAuth === 'admin' ? { mockAuth: 'admin' as const } : {};

  return (
    <div className={styles.content()}>
      <section aria-label="Pessoa autenticada" className={styles.identity()}>
        <div className={styles.identityHeader()}>
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
          <div aria-label="Ações da conta" className={styles.accountActions()}>
            <ThemeToggle />
            <Button
              aria-label={isLogoutPending ? 'Saindo' : 'Sair'}
              className={styles.logout()}
              isIconOnly
              isPending={isLogoutPending}
              onPress={onLogout}
              size="sm"
              variant="secondary"
            >
              <LogOut aria-hidden="true" focusable="false" />
            </Button>
          </div>
        </div>
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
      {termsRestricted && person.isAdmin !== true ? null : (
        <nav aria-label="Navegação principal" className={styles.navigation()}>
          {termsRestricted ? null : (
            <>
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
                to="/training-plan"
              >
                <Dumbbell
                  aria-hidden="true"
                  className={styles.navigationIcon()}
                  focusable="false"
                />
                <span>Meus planos</span>
              </Link>
              <Link
                activeOptions={{ includeSearch: false }}
                className={styles.navigationLink()}
                onClick={() => {
                  trackUiEvent({
                    control: 'training_link',
                    destination: 'training',
                    eventName: 'ui_navigation_selected',
                    navigationKind: 'menu',
                    surface: 'application_menu',
                  });
                  onNavigate?.();
                }}
                search={adminSearch}
                to="/training"
              >
                <Play
                  aria-hidden="true"
                  className={styles.navigationIcon()}
                  focusable="false"
                />
                <span>Treinar</span>
              </Link>
            </>
          )}
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
              <span>Modelos de treino</span>
            </Link>
          ) : null}
          <Link
            className={styles.navigationLink()}
            to="/terms"
            search={adminSearch}
            onClick={() => {
              trackUiEvent({
                control: 'terms_action',
                surface: 'application_menu',
                eventName: 'ui_navigation_selected',
                navigationKind: 'menu',
                destination: 'terms',
              });
              onNavigate?.();
            }}
          >
            <FileText
              aria-hidden="true"
              className={styles.navigationIcon()}
              focusable="false"
            />
            <span>Termos de uso</span>
          </Link>
          {person.isAdmin === true ? (
            <Link
              className={styles.navigationLink()}
              to="/admin/terms"
              search={adminSearch}
              onClick={() => {
                trackUiEvent({
                  control: 'terms_action',
                  surface: 'application_menu',
                  eventName: 'ui_navigation_selected',
                  navigationKind: 'menu',
                  destination: 'admin_terms',
                });
                onNavigate?.();
              }}
            >
              <FilePenLine
                aria-hidden="true"
                className={styles.navigationIcon()}
                focusable="false"
              />
              <span>Gestão de termos</span>
            </Link>
          ) : null}
        </nav>
      )}
      {showPwaInstall ? <PwaInstallAction /> : null}
    </div>
  );
}
