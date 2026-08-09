import { Alert, Button, Card } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';

import { startGoogleLogin } from '~/auth/auth-service';
import { trackUiEvent } from '~/core/analytics';
import { homeStyles } from '~/routes/home/styles';

const styles = homeStyles();

export interface HomePageProps {
  hasAuthError?: boolean;
}

export function HomePage({ hasAuthError = false }: Readonly<HomePageProps>) {
  const loginMutation = useMutation({
    mutationFn: startGoogleLogin,
    onSuccess: (authorizationUrl) => {
      trackUiEvent({
        control: 'google_login',
        eventName: 'ui_operation_completed',
        operation: 'google_login',
        outcome: 'success',
        surface: 'home',
      });
      window.location.assign(authorizationUrl);
    },
    onError: () => {
      trackUiEvent({
        control: 'google_login',
        eventName: 'ui_operation_completed',
        operation: 'google_login',
        outcome: 'error',
        surface: 'home',
      });
    },
  });
  const showAuthError = hasAuthError || loginMutation.isError;

  return (
    <main className={styles.page()}>
      <div className={styles.pageContent()}>
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
            <p className={styles.eyebrow()}>Dall Fit</p>
            <h1 className={styles.title()}>Entre para continuar</h1>
            <p className={styles.description()}>
              Use sua conta Google para acessar sua área.
            </p>
          </Card.Header>
          <Card.Footer>
            <Button
              isPending={loginMutation.isPending}
              onPress={() => {
                trackUiEvent({
                  control: 'google_login',
                  eventName: 'ui_operation_started',
                  operation: 'google_login',
                  surface: 'home',
                });
                loginMutation.mutate();
              }}
            >
              {loginMutation.isPending
                ? 'Iniciando login'
                : 'Entrar com Google'}
            </Button>
          </Card.Footer>
        </Card>
      </div>
    </main>
  );
}
