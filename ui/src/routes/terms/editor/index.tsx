import { useState } from 'react';

import {
  Alert,
  AlertDialog,
  Button,
  Input,
  Label,
  TextArea,
  TextField,
} from '@heroui/react';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';

import type {
  TermsDocument,
  TermsFields,
  TermsPublication,
} from '@dall-fit/types';

import {
  getActiveSessionGeneration,
  isSessionGenerationActive,
} from '~/auth/session-lifecycle';
import { getApiErrorCode } from '~/core/http/http-error';
import { useReloadBlocker } from '~/core/reload-safety/reload-safety-context';
import { getTermsPolicy, requireTerms } from '~/core/terms/policy';
import { termsKeys } from '~/core/terms/queries';
import {
  runTermsOperation,
  trackTerms,
  useTermsFieldAnalytics,
} from '~/routes/terms/analytics';
import { TermsDocumentContent } from '~/routes/terms/document';
import {
  deleteTerms,
  previewTerms,
  publishTerms,
  readTermsDraft,
  saveTerms,
} from '~/routes/terms/service';
import { termsStyles } from '~/routes/terms/styles';

const styles = termsStyles();
function asPublication(doc: TermsDocument): TermsPublication {
  return {
    ...doc,
    publicationNumber: doc.publicationNumber ?? 0,
    publishedAt: doc.publishedAt ?? doc.updatedAt,
  };
}
function fieldsOf(doc: TermsDocument): TermsFields {
  return {
    title: doc.title,
    bodyHtml: doc.bodyHtml,
    operatorName: doc.operatorName,
    operatorEmail: doc.operatorEmail,
    changeSummary: doc.changeSummary,
  };
}

export function TermsEditor({
  document,
  onClose,
}: Readonly<{ document: TermsDocument; onClose: () => void }>) {
  const fieldAnalytics = useTermsFieldAnalytics();
  const [saved, setSaved] = useState(document);
  const [preview, setPreview] = useState<TermsDocument>();
  const [confirmation, setConfirmation] = useState<
    'publish' | 'delete' | 'leave'
  >();
  const [error, setError] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (
      operation: 'save' | 'preview' | 'publish' | 'delete',
    ) => {
      const generation = getActiveSessionGeneration();
      setError(undefined);
      if (operation === 'save') {
        const updated = await runTermsOperation('terms_save', () =>
          saveTerms(saved, form.state.values),
        );
        if (isSessionGenerationActive(generation)) {
          setSaved(updated);
          setPreview(undefined);
          setDirty(false);
          form.reset(fieldsOf(updated));
          client.setQueryData([...termsKeys.all, 'draft', updated.id], updated);
        }
      } else if (operation === 'preview') {
        const result = await runTermsOperation('terms_preview', () =>
          previewTerms(saved),
        );
        if (isSessionGenerationActive(generation)) setPreview(result);
      } else if (operation === 'publish' && preview !== undefined) {
        const result = await runTermsOperation('terms_publish', () =>
          publishTerms(saved, {
            previewContentHash: preview.contentHash,
            expectedCurrentTermsId:
              getTermsPolicy().access?.current?.id ?? null,
          }),
        );
        if (
          isSessionGenerationActive(generation) &&
          result.publicationNumber !== undefined
        ) {
          setConfirmation(undefined);
          setSaved(result);
          setDirty(false);
          requireTerms({
            id: result.id,
            publicationNumber: result.publicationNumber,
            contentHash: result.contentHash,
          });
          await client.invalidateQueries({ queryKey: termsKeys.all });
        }
      } else if (operation === 'delete') {
        await runTermsOperation('terms_delete', () => deleteTerms(saved));
        if (isSessionGenerationActive(generation)) {
          setConfirmation(undefined);
          onClose();
        }
      }
      if (isSessionGenerationActive(generation))
        await client.invalidateQueries({
          queryKey: [...termsKeys.all, 'admin'],
        });
    },
    onError: (caught) => {
      setError(
        getApiErrorCode(caught)?.includes('CONFLICT')
          ? 'Outra pessoa alterou os termos. Recarregue para revisar a versão atual.'
          : 'Não foi possível concluir. Suas alterações foram preservadas. Tente novamente.',
      );
    },
  });
  const form = useForm({
    defaultValues: fieldsOf(document),
    onSubmit: async () => {
      await mutation.mutateAsync('save').catch(() => undefined);
    },
  });
  const pending = mutation.isPending;
  useReloadBlocker(dirty || pending);
  const blocker = useBlocker({
    shouldBlockFn: () => !getTermsPolicy().blocked && (dirty || pending),
    withResolver: true,
  });
  const readonly = saved.state === 'published';
  const limits: Record<keyof TermsFields, number> = {
    title: 160,
    operatorName: 200,
    operatorEmail: 254,
    changeSummary: 1000,
    bodyHtml: 256 * 1024,
  };
  const headings = {
    publish: 'Publicar nova versão?',
    delete: 'Excluir rascunho?',
    leave: 'Descartar alterações?',
  };
  const labels: Record<keyof TermsFields, string> = {
    title: 'Título',
    operatorName: 'Responsável',
    operatorEmail: 'E-mail de contato',
    changeSummary: 'Resumo das alterações',
    bodyHtml: 'Corpo do termo em HTML',
  };
  const close = () => {
    if (dirty) setConfirmation('leave');
    else onClose();
  };
  const dismiss = () => {
    trackTerms('cancel');
    setConfirmation(undefined);
    blocker.reset?.();
  };

  if (readonly)
    return (
      <section className={styles.page()}>
        <h1 className={styles.title()}>Versão publicada</h1>
        <TermsDocumentContent document={asPublication(saved)} />
        <Button
          onPress={() => {
            trackTerms('cancel');
            onClose();
          }}
        >
          Voltar às versões
        </Button>
      </section>
    );
  return (
    <section className={styles.page()}>
      <h1 className={styles.title()}>Editar rascunho</h1>
      <form
        className={styles.form()}
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit().catch(() => undefined);
        }}
      >
        {(Object.keys(labels) as Array<keyof TermsFields>).map((name) => (
          <form.Field name={name} key={name}>
            {(field) => (
              <TextField
                aria-label={labels[name]}
                isRequired
                isDisabled={pending}
                type={name === 'operatorEmail' ? 'email' : 'text'}
              >
                <Label>{labels[name]}</Label>
                {name === 'bodyHtml' ? (
                  <TextArea
                    className={styles.source()}
                    value={field.state.value}
                    onFocus={() => fieldAnalytics.focus(name)}
                    onBlur={(event) => {
                      field.handleBlur();
                      fieldAnalytics.complete(
                        name,
                        event.target.value,
                        event.target.validity.valid,
                      );
                    }}
                    onChange={(event) => {
                      setDirty(true);
                      setPreview(undefined);
                      field.handleChange(event.target.value);
                    }}
                  />
                ) : (
                  <Input
                    value={field.state.value}
                    onFocus={() => fieldAnalytics.focus(name)}
                    onBlur={(event) => {
                      field.handleBlur();
                      fieldAnalytics.complete(
                        name,
                        event.target.value,
                        event.target.validity.valid,
                      );
                    }}
                    maxLength={limits[name]}
                    onChange={(event) => {
                      setDirty(true);
                      setPreview(undefined);
                      field.handleChange(event.target.value);
                    }}
                  />
                )}
              </TextField>
            )}
          </form.Field>
        ))}
        <p className={styles.muted()}>
          Use títulos, parágrafos, negrito, itálico e listas. A prévia remove
          conteúdo não permitido. A identificação acima será incluída
          automaticamente no documento.
        </p>
        <div className={styles.actions()}>
          <Button type="submit" isPending={pending}>
            Salvar rascunho
          </Button>
          <Button
            isDisabled={dirty || pending}
            onPress={() => mutation.mutate('preview')}
            variant="secondary"
          >
            Visualizar prévia
          </Button>
          <Button
            isDisabled={preview === undefined || dirty || pending}
            onPress={() => {
              trackTerms('publish');
              setConfirmation('publish');
            }}
          >
            Publicar versão
          </Button>
          <Button
            isDisabled={pending}
            onPress={() => {
              trackTerms('delete');
              setConfirmation('delete');
            }}
            variant="danger"
          >
            Excluir rascunho
          </Button>
          <Button
            isDisabled={pending}
            onPress={() => {
              trackTerms('cancel');
              close();
            }}
            variant="secondary"
          >
            Voltar às versões
          </Button>
        </div>
      </form>
      {saved.wasSanitized ? (
        <Alert status="warning">
          <Alert.Title>
            Conteúdo não permitido foi removido. Confira a prévia antes de
            publicar.
          </Alert.Title>
        </Alert>
      ) : null}
      {error === undefined ? null : (
        <Alert status="danger">
          <Alert.Title>{error}</Alert.Title>
          <Button
            variant="secondary"
            isDisabled={pending}
            onPress={() => {
              trackTerms('retry');
              const generation = getActiveSessionGeneration();
              void client
                .fetchQuery({
                  queryKey: [...termsKeys.all, 'draft', saved.id],
                  queryFn: () => readTermsDraft(saved.id),
                })
                .then((doc) => {
                  if (!isSessionGenerationActive(generation)) return;
                  setSaved(doc);
                  form.reset(fieldsOf(doc));
                  setDirty(false);
                  setPreview(undefined);
                  setError(undefined);
                })
                .catch(() => undefined);
            }}
          >
            Recarregar versão atual
          </Button>
        </Alert>
      )}
      {preview === undefined ? null : (
        <section aria-label="Prévia do rascunho">
          <h2 className={styles.heading()}>Prévia — ainda não publicado</h2>
          <TermsDocumentContent document={asPublication(preview)} isPreview />
        </section>
      )}
      <AlertDialog
        isOpen={confirmation !== undefined || blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open && !pending) dismiss();
        }}
      >
        <AlertDialog.Backdrop isDismissable={!pending}>
          <AlertDialog.Container>
            <AlertDialog.Dialog
              aria-label={
                confirmation === undefined
                  ? headings.leave
                  : headings[confirmation]
              }
            >
              <AlertDialog.Header>
                <AlertDialog.Heading>
                  {confirmation === undefined
                    ? 'Descartar alterações?'
                    : headings[confirmation]}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                {confirmation === 'publish'
                  ? 'Todas as pessoas, inclusive administradores, precisarão aceitar esta versão. O texto publicado ficará imutável.'
                  : 'Esta ação descarta o rascunho ou as alterações ainda não confirmadas.'}
                {error === undefined ? null : <p role="alert">{error}</p>}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  isDisabled={pending}
                  variant="secondary"
                  onPress={dismiss}
                >
                  Cancelar
                </Button>
                <Button
                  isPending={pending}
                  onPress={() => {
                    if (confirmation === 'publish' || confirmation === 'delete')
                      mutation.mutate(confirmation);
                    else {
                      setDirty(false);
                      setConfirmation(undefined);
                      if (blocker.status === 'blocked') blocker.proceed();
                      else onClose();
                    }
                  }}
                >
                  Confirmar
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </section>
  );
}
