import { Card, Skeleton } from '@heroui/react';

import { routeStatusStyles } from '~/core/components/route-status/styles';

const styles = routeStatusStyles();

export function ProtectedRoutePending() {
  return (
    <main className={styles.page()}>
      <div
        aria-label="Carregando sua conta"
        className={styles.pageContent()}
        role="status"
      >
        <span className={styles.srOnly()}>Carregando sua conta</span>
        <div className={styles.skeletonIdentity()}>
          <Skeleton className={styles.skeletonAvatar()} />
          <div className={styles.skeletonText()}>
            <Skeleton className={styles.skeletonName()} />
            <Skeleton className={styles.skeletonEmail()} />
          </div>
        </div>
        <Skeleton className={styles.skeletonNavigation()} />
        <Skeleton className={styles.skeletonNavigation()} />
        <Skeleton className={styles.skeletonContent()} />
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
