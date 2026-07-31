import { Avatar, Chip, Typography } from '@heroui/react';
import { Link } from '@tanstack/react-router';
import { House } from 'lucide-react';

import type { Person } from '@dall-fit/types';

import { getPersonInitials } from '~/core/components/application-menu/get-person-initials';
import { applicationMenuStyles } from '~/core/components/application-menu/styles';

const styles = applicationMenuStyles();

export interface ApplicationMenuProps {
  onNavigate?: () => void;
  person: Person;
}

export function ApplicationMenu({
  onNavigate,
  person,
}: Readonly<ApplicationMenuProps>) {
  const initials = getPersonInitials(person.name);

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
      <nav aria-label="Navegação principal" className={styles.navigation()}>
        <Link
          activeOptions={{ exact: true }}
          className={styles.navigationLink()}
          onClick={onNavigate}
          to="/dash"
        >
          <House
            aria-hidden="true"
            className={styles.navigationIcon()}
            focusable="false"
          />
          <span>Home</span>
        </Link>
      </nav>
    </div>
  );
}
