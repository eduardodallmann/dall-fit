import { Card, Spinner } from '@heroui/react';

import {
  Description,
  Page,
  PageContent,
  Title,
} from '~/core/components/route-status/styles';

export function ProtectedRoutePending() {
  return (
    <Page>
      <PageContent>
        <Spinner aria-label="Carregando sua conta" size="lg" />
        <Description>Carregando sua conta</Description>
      </PageContent>
    </Page>
  );
}

export function ProtectedRouteError() {
  return (
    <Page>
      <PageContent>
        <Card>
          <Card.Header>
            <Title>Não foi possível carregar sua conta</Title>
            <Description>
              Recarregue a página para tentar novamente.
            </Description>
          </Card.Header>
        </Card>
      </PageContent>
    </Page>
  );
}
