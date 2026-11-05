import { useState } from 'react';

import { Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';

import { termsKeys } from '~/core/terms/queries';
import { trackTerms } from '~/routes/terms/analytics';
import { readTermsHistory } from '~/routes/terms/service';
import { termsStyles } from '~/routes/terms/styles';

const styles = termsStyles();
export function TermsHistory({
  onSelect,
}: Readonly<{ onSelect: (id: string) => void }>) {
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: [...termsKeys.all, 'history', page],
    queryFn: ({ signal }) => readTermsHistory(page, signal),
  });
  return (
    <section aria-label="Meus aceites anteriores">
      <h2 className={styles.heading()}>Meus aceites anteriores</h2>
      {history.isError ? (
        <p role="alert">
          Não foi possível carregar seus aceites. Tente novamente.
        </p>
      ) : null}
      {history.data?.data.map((receipt) => (
        <div className={styles.row()} key={receipt.id}>
          <span>
            Versão {receipt.publicationNumber} · Aceite:{' '}
            {new Date(receipt.acceptedAt).toLocaleString('pt-BR')}
          </span>
          <Button
            variant="secondary"
            onPress={() => {
              trackTerms('read');
              onSelect(receipt.termsVersionId);
            }}
          >
            Ler versão {receipt.publicationNumber}
          </Button>
        </div>
      ))}
      {history.data?.total === 0 ? <p>Nenhum aceite anterior.</p> : null}
      <div className={styles.actions()}>
        <Button
          isDisabled={page === 1}
          onPress={() => {
            trackTerms('page');
            setPage(page - 1);
          }}
        >
          Anterior
        </Button>
        <span>Página {page}</span>
        <Button
          isDisabled={
            history.data === undefined || page * 20 >= history.data.total
          }
          onPress={() => {
            trackTerms('page');
            setPage(page + 1);
          }}
        >
          Próxima
        </Button>
      </div>
    </section>
  );
}
