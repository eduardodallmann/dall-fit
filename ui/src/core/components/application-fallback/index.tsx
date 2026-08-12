import {
  Component,
  useEffect,
  useRef,
  type ErrorInfo,
  type ReactNode,
} from 'react';

import { Button, Card } from '@heroui/react';

import { reportSystemFailure } from '~/core/analytics';
import { applicationFallbackStyles } from '~/core/components/application-fallback/styles';

const styles = applicationFallbackStyles();

export function ApplicationFallback() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <main className={styles.page()}>
      <Card className={styles.panel()}>
        <Card.Header>
          <h1 className={styles.title()} ref={headingRef} tabIndex={-1}>
            Não foi possível iniciar o Dall Fit
          </h1>
          <p className={styles.description()}>
            Tente novamente para carregar a aplicação.
          </p>
        </Card.Header>
        <Card.Footer className={styles.actions()}>
          <Button onPress={() => window.location.reload()} variant="primary">
            Tentar novamente
          </Button>
        </Card.Footer>
      </Card>
    </main>
  );
}

interface ApplicationErrorBoundaryProps {
  children: ReactNode;
}

interface ApplicationErrorBoundaryState {
  failed: boolean;
}

export class ApplicationErrorBoundary extends Component<
  ApplicationErrorBoundaryProps,
  ApplicationErrorBoundaryState
> {
  state: ApplicationErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ApplicationErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    reportSystemFailure('render');
  }

  render(): ReactNode {
    return this.state.failed ? <ApplicationFallback /> : this.props.children;
  }
}
