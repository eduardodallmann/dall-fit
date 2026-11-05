import { useState } from 'react';

import { Alert, Button, Table } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getActiveSessionGeneration,
  isSessionGenerationActive,
} from '~/auth/session-lifecycle';
import { getTermsPolicy } from '~/core/terms/policy';
import { termsKeys } from '~/core/terms/queries';
import { runTermsOperation, trackTerms } from '~/routes/terms/analytics';
import { TermsEditor } from '~/routes/terms/editor';
import { createTerms, listTerms, readTermsDraft } from '~/routes/terms/service';
import { termsStyles } from '~/routes/terms/styles';

const styles = termsStyles();
export function AdminTermsPage() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string>();
  const list = useQuery({
    queryKey: [...termsKeys.all, 'admin', page],
    queryFn: ({ signal }) => listTerms(page, signal),
  });
  const detail = useQuery({
    queryKey: [...termsKeys.all, 'draft', selected],
    queryFn: ({ signal }) => readTermsDraft(selected ?? '', signal),
    enabled: selected !== undefined,
  });
  const create = useMutation({
    mutationFn: () =>
      runTermsOperation('terms_create', async () => {
        if (list.data === undefined) throw new Error('Terms are unavailable.');
        const generation = getActiveSessionGeneration();
        const current = getTermsPolicy().access?.current;
        const doc = await createTerms(
          current == null
            ? list.data.initialDraft
            : { sourceVersionId: current.id },
        );
        return { doc, generation };
      }),
    onSuccess: async ({ doc, generation }) => {
      if (!isSessionGenerationActive(generation)) return;
      client.setQueryData([...termsKeys.all, 'draft', doc.id], doc);
      setSelected(doc.id);
      await client.invalidateQueries({ queryKey: [...termsKeys.all, 'admin'] });
    },
  });

  if (selected !== undefined && detail.data !== undefined)
    return (
      <TermsEditor
        key={selected}
        document={detail.data}
        onClose={() => setSelected(undefined)}
      />
    );
  return (
    <section className={styles.page()}>
      <h1 className={styles.title()}>Gestão de termos</h1>
      <p className={styles.text()}>
        Crie um rascunho, confira a prévia e publique uma nova versão. Cada
        publicação exige novo aceite de todas as pessoas.
      </p>
      <Button
        isPending={create.isPending}
        isDisabled={list.data === undefined}
        onPress={() => create.mutate()}
      >
        Criar versão
      </Button>
      {list.isError || create.isError || detail.isError ? (
        <Alert status="danger">
          <Alert.Title>Não foi possível concluir a operação</Alert.Title>
          <Button
            variant="secondary"
            onPress={() => {
              trackTerms('retry');
              void list.refetch();
              if (selected !== undefined) void detail.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </Alert>
      ) : null}
      {list.isPending || detail.isFetching ? (
        <p role="status">Carregando termos...</p>
      ) : null}
      <Table aria-label="Versões dos termos">
        <Table.ScrollContainer>
          <Table.Content>
            <Table.Header>
              <Table.Column isRowHeader>Título</Table.Column>
              <Table.Column>Publicação</Table.Column>
              <Table.Column>Estado</Table.Column>
              <Table.Column>Ações</Table.Column>
            </Table.Header>
            <Table.Body>
              {list.data?.data.map((doc) => (
                <Table.Row key={doc.id}>
                  <Table.Cell>{doc.title}</Table.Cell>
                  <Table.Cell>{doc.publicationNumber ?? '—'}</Table.Cell>
                  <Table.Cell>
                    {doc.state === 'draft' ? 'Rascunho' : 'Publicado'}
                  </Table.Cell>
                  <Table.Cell>
                    <Button
                      variant="secondary"
                      onPress={() => {
                        trackTerms('read');
                        setSelected(doc.id);
                      }}
                    >
                      Abrir{' '}
                      {doc.publicationNumber === undefined
                        ? 'rascunho'
                        : `versão ${doc.publicationNumber}`}
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
      {list.data?.total === 0 ? <p>Nenhum termo criado.</p> : null}
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
          isDisabled={list.data === undefined || page * 20 >= list.data.total}
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
