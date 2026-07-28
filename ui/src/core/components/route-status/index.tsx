import { Card, Spinner } from '@heroui/react';

import { routeStatusStyles } from '~/core/components/route-status/styles';

const styles = routeStatusStyles();

export function ProtectedRoutePending() {
  return (
    <main className={styles.page()}>
      <div className={styles.pageContent()}>
        <Spinner aria-label="Carregando sua conta" size="lg" />
        <p className={styles.description()}>Carregando sua conta</p>
      </div>
    </main>
  );
}

export function ProtectedRouteError() {
  return (
    <main className={styles.page()}>
      <div className={styles.pageContent()}>
        <Card>
          <Card.Header>
            <h1 className={styles.title()}>
              Não foi possível carregar sua conta
            </h1>
            <p className={styles.description()}>
              Recarregue a página para tentar novamente.
            </p>
          </Card.Header>
        </Card>
      </div>
    </main>
  );
}
