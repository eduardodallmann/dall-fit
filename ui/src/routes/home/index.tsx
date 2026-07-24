import { Alert, Button, Card } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';

import { startGoogleLogin } from '~/auth/auth-service';
import {
  Description,
  Eyebrow,
  Page,
  PageContent,
  Title,
} from '~/routes/home/styles';

export interface HomePageProps {
  hasAuthError?: boolean;
}

export function HomePage({ hasAuthError = false }: Readonly<HomePageProps>) {
  const loginMutation = useMutation({
    mutationFn: startGoogleLogin,
    onSuccess: (authorizationUrl) => {
      window.location.assign(authorizationUrl);
    },
  });
  const showAuthError = hasAuthError || loginMutation.isError;

  return (
    <Page>
      <PageContent>
        {showAuthError ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Não foi possível entrar.</Alert.Title>
              <Alert.Description>Tente novamente.</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        <Card>
          <Card.Header>
            <Eyebrow>Dall Fit</Eyebrow>
            <Title>Entre para continuar</Title>
            <Description>
              Use sua conta Google para acessar sua área.
            </Description>
          </Card.Header>
          <Card.Footer>
            <Button
              isPending={loginMutation.isPending}
              onPress={() => loginMutation.mutate()}
            >
              {loginMutation.isPending
                ? 'Iniciando login'
                : 'Entrar com Google'}
            </Button>
          </Card.Footer>
        </Card>
      </PageContent>
    </Page>
  );
}
