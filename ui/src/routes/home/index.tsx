import { Alert, Button, Card } from '@heroui/react';

import { getGoogleLoginUrl } from '~/auth/auth-service';
import { trackUiEvent } from '~/core/analytics';
import { homeStyles } from '~/routes/home/styles';

const styles = homeStyles();

export interface HomePageProps {
  hasAuthError?: boolean;
}

export function HomePage({ hasAuthError = false }: Readonly<HomePageProps>) {
  return (
    <main className={styles.page()}>
      <div className={styles.pageContent()}>
        {hasAuthError ? (
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
              onPress={() => {
                trackUiEvent({
                  control: 'google_login',
                  eventName: 'ui_operation_started',
                  operation: 'google_login',
                  surface: 'home',
                });
                window.location.assign(getGoogleLoginUrl());
              }}
            >
              Entrar com Google
            </Button>
          </Card.Footer>
        </Card>
      </div>
    </main>
  );
}
