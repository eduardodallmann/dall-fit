import { useState, useSyncExternalStore } from 'react';

import { Alert, Button, Checkbox, Label, Skeleton } from '@heroui/react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';

import type { TermsPublication } from '@dall-fit/types';

import {
  getActiveSessionGeneration,
  isSessionGenerationActive,
} from '~/auth/session-lifecycle';
import { getApiErrorCode } from '~/core/http/http-error';
import {
  applyTermsAccess,
  getTermsPolicy,
  subscribeTermsPolicy,
} from '~/core/terms/policy';
import { termsAccessQueryOptions, termsKeys } from '~/core/terms/queries';
import { runTermsOperation, trackTerms } from '~/routes/terms/analytics';
import { TermsDocumentContent } from '~/routes/terms/document';
import { TermsHistory } from '~/routes/terms/history';
import {
  acceptTerms,
  readCurrentTerms,
  readTermsVersion,
} from '~/routes/terms/service';
import { termsStyles } from '~/routes/terms/styles';

const styles = termsStyles();
export function TermsPage({
  isAdmin = false,
}: Readonly<{ isAdmin?: boolean }>) {
  const policy = useSyncExternalStore(subscribeTermsPolicy, getTermsPolicy);
  const queryClient = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historicalId, setHistoricalId] = useState<string>();
  const current = useQuery({
    queryKey: [...termsKeys.all, 'current', policy.access?.current?.id],
    queryFn: ({ signal }) => readCurrentTerms(signal),
    enabled: policy.access?.current != null,
  });
  const historical = useQuery({
    queryKey: [...termsKeys.all, 'version', historicalId],
    queryFn: ({ signal }) => readTermsVersion(historicalId ?? '', signal),
    enabled: historicalId !== undefined,
  });
  const publication =
    historicalId === undefined ? current.data?.publication : historical.data;
  const retry = () =>
    runTermsOperation('terms_retry', async () => {
      await queryClient.fetchQuery({
        ...termsAccessQueryOptions(),
        staleTime: 0,
      });
      await queryClient.invalidateQueries({ queryKey: termsKeys.all });
    }).catch(() => undefined);

  return (
    <section className={styles.page()} aria-labelledby="terms-title">
      <h1 id="terms-title" className={styles.title()}>
        Termos de uso
      </h1>
      {policy.blocked ? (
        <Alert status="warning">
          <Alert.Title>Seu aceite é necessário</Alert.Title>
          <Alert.Description>
            Para usar o Dall Fit, leia e aceite a versão atual dos termos. Seu
            cadastro já foi realizado. O aceite é uma etapa separada. Interrompa
            a atividade em segurança antes de ler.
          </Alert.Description>
        </Alert>
      ) : null}
      {policy.access?.state === 'not-configured' ? (
        <Alert status="warning">
          <Alert.Title>Termos ainda não disponíveis</Alert.Title>
          <Alert.Description>
            Tente novamente mais tarde. Você também pode sair pelo menu.
          </Alert.Description>
        </Alert>
      ) : null}
      {policy.unavailable || current.isError ? (
        <Alert status="danger">
          <Alert.Title>Não foi possível carregar os termos</Alert.Title>
          <Alert.Description>
            Conecte-se e tente novamente. Você pode sair pelo menu.
          </Alert.Description>
        </Alert>
      ) : null}
      {isAdmin && policy.access?.state === 'not-configured' ? (
        <Link to="/admin/terms" onClick={() => trackTerms('create')}>
          Configurar primeiro termo
        </Link>
      ) : null}
      {publication === undefined && current.isFetching ? (
        <div role="status" aria-label="Carregando termos">
          <Skeleton />
        </div>
      ) : null}
      {publication === undefined ? null : (
        <TermsDocumentContent key={publication.id} document={publication} />
      )}
      {publication !== undefined &&
      historicalId === undefined &&
      policy.blocked ? (
        <TermsAcceptanceForm
          key={`${publication.id}:${publication.contentHash}`}
          publication={publication}
        />
      ) : null}
      {policy.access?.state === 'accepted' ? (
        <p className={styles.text()}>
          Aceite confirmado em{' '}
          {new Date(policy.access.acceptance.acceptedAt).toLocaleString(
            'pt-BR',
          )}
          .
        </p>
      ) : null}
      <div className={styles.actions()}>
        <Button variant="secondary" onPress={() => void retry()}>
          Tentar novamente
        </Button>
        <Button
          variant="secondary"
          onPress={() => {
            trackTerms('read');
            setHistoryOpen(!historyOpen);
          }}
        >
          Meus aceites anteriores
        </Button>
        {historicalId === undefined ? null : (
          <Button
            onPress={() => {
              trackTerms('read');
              setHistoricalId(undefined);
            }}
          >
            Voltar ao termo atual
          </Button>
        )}
      </div>
      {historyOpen ? <TermsHistory onSelect={setHistoricalId} /> : null}
      {historical.isError ? (
        <p role="alert">Não foi possível carregar esta versão.</p>
      ) : null}
    </section>
  );
}

function TermsAcceptanceForm({
  publication,
}: Readonly<{ publication: TermsPublication }>) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: async () => {
      const generation = getActiveSessionGeneration();
      const result = await runTermsOperation('terms_accept', () =>
        acceptTerms({
          termsVersionId: publication.id,
          contentHash: publication.contentHash,
          accepted: true,
          isAdult: true,
        }),
      );
      if (isSessionGenerationActive(generation)) {
        const access = await applyTermsAccess(result.access, generation);
        if (!isSessionGenerationActive(generation)) return result;
        queryClient.setQueryData(termsKeys.access, access);
        await router.invalidate();
      }
      return result;
    },
    onError: (error) => {
      if (getApiErrorCode(error) === 'TERMS_VERSION_CHANGED') {
        form.reset();
        void queryClient.invalidateQueries({ queryKey: termsKeys.all });
      }
    },
  });
  const form = useForm({
    defaultValues: { adult: false, accepted: false },
    onSubmit: async ({ value }) => {
      if (value.adult && value.accepted)
        await mutation.mutateAsync().catch(() => undefined);
    },
  });
  return (
    <form
      className={styles.form()}
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit().catch(() => undefined);
      }}
    >
      <form.Field name="adult">
        {(field) => (
          <Checkbox
            aria-label="Declaro que tenho 18 anos completos ou mais."
            isSelected={field.state.value}
            isDisabled={mutation.isPending}
            onChange={(value) => {
              trackTerms('declare');
              field.handleChange(value);
            }}
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Label>Declaro que tenho 18 anos completos ou mais.</Label>
            </Checkbox.Content>
          </Checkbox>
        )}
      </form.Field>
      <form.Field name="accepted">
        {(field) => (
          <Checkbox
            aria-label="Li e aceito os Termos de Uso desta versão e estou ciente dos riscos e dos cuidados descritos para a prática de exercícios."
            isSelected={field.state.value}
            isDisabled={mutation.isPending}
            onChange={(value) => {
              trackTerms('declare');
              field.handleChange(value);
            }}
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Label>
                Li e aceito os Termos de Uso desta versão e estou ciente dos
                riscos e dos cuidados descritos para a prática de exercícios.
              </Label>
            </Checkbox.Content>
          </Checkbox>
        )}
      </form.Field>
      {mutation.isError ? (
        <Alert status="danger">
          <Alert.Title>
            {getApiErrorCode(mutation.error) === 'TERMS_VERSION_CHANGED'
              ? 'Uma nova versão está disponível. Leia o novo texto e confirme novamente.'
              : 'Não foi possível confirmar seu aceite. Tente novamente.'}
          </Alert.Title>
        </Alert>
      ) : null}
      {mutation.data?.access.state === 'required' ? (
        <Alert status="warning">
          <Alert.Title>Uma nova versão precisa do seu aceite.</Alert.Title>
        </Alert>
      ) : null}
      <form.Subscribe selector={(state) => state.values}>
        {(values) => (
          <Button
            type="submit"
            isDisabled={!values.adult || !values.accepted}
            isPending={mutation.isPending}
          >
            Aceitar e continuar
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
