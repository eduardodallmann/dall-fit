import { Avatar, Card } from '@heroui/react';

import type { Person } from '@dall-fit/types';

import {
  DetailLabel,
  DetailList,
  DetailValue,
  Eyebrow,
  Page,
  PageContent,
  Title,
} from '~/routes/me/styles';

export interface MePageProps {
  person: Person;
}

export function MePage({ person }: Readonly<MePageProps>) {
  const initials = getInitials(person.name);

  return (
    <Page>
      <PageContent>
        <Card>
          <Card.Header>
            <Avatar size="lg">
              {person.photoUrl === null ? null : (
                <Avatar.Image alt={person.name} src={person.photoUrl} />
              )}
              <Avatar.Fallback>{initials}</Avatar.Fallback>
            </Avatar>
            <Eyebrow>Dall Fit</Eyebrow>
            <Title>Sua conta</Title>
          </Card.Header>
          <Card.Content>
            <DetailList>
              <div>
                <DetailLabel>Nome</DetailLabel>
                <DetailValue>{person.name}</DetailValue>
              </div>
              <div>
                <DetailLabel>E-mail</DetailLabel>
                <DetailValue>{person.email}</DetailValue>
              </div>
            </DetailList>
          </Card.Content>
        </Card>
      </PageContent>
    </Page>
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
