import { Avatar, Card } from '@heroui/react';

import type { Person } from '@dall-fit/types';

import { meStyles } from '~/routes/me/styles';

const styles = meStyles();

export interface MePageProps {
  person: Person;
}

export function MePage({ person }: Readonly<MePageProps>) {
  const initials = getInitials(person.name);

  return (
    <main className={styles.page()}>
      <div className={styles.pageContent()}>
        <Card>
          <Card.Header>
            <Avatar size="lg">
              {person.photoUrl === null ? null : (
                <Avatar.Image alt={person.name} src={person.photoUrl} />
              )}
              <Avatar.Fallback>{initials}</Avatar.Fallback>
            </Avatar>
            <p className={styles.eyebrow()}>Dall Fit</p>
            <h1 className={styles.title()}>Sua conta</h1>
          </Card.Header>
          <Card.Content>
            <dl className={styles.detailList()}>
              <div>
                <dt className={styles.detailLabel()}>Nome</dt>
                <dd className={styles.detailValue()}>{person.name}</dd>
              </div>
              <div>
                <dt className={styles.detailLabel()}>E-mail</dt>
                <dd className={styles.detailValue()}>{person.email}</dd>
              </div>
            </dl>
          </Card.Content>
        </Card>
      </div>
    </main>
  );
}

function getInitials(name: string): string {
  const result = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return result;
}
