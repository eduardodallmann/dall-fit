import { useState } from 'react';

import { Button, Label, TextArea, TextField } from '@heroui/react';

import type { TermsPublication } from '@dall-fit/types';

import { runTermsOperation } from '~/routes/terms/analytics';
import { termsStyles } from '~/routes/terms/styles';

const styles = termsStyles();
export function TermsDocumentContent({
  document,
  isPreview = false,
}: Readonly<{ document: TermsPublication; isPreview?: boolean }>) {
  const [copyFallback, setCopyFallback] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  async function copy(): Promise<void> {
    const parsed = new DOMParser().parseFromString(
      document.contentHtml,
      'text/html',
    );
    for (const element of parsed.body.querySelectorAll(
      'h2, h3, p, li, blockquote, br',
    )) {
      element.append(parsed.createTextNode('\n'));
    }
    const content = (parsed.body.textContent ?? '').trim();
    const reference = isPreview
      ? 'Prévia — ainda não publicado'
      : `Versão ${document.publicationNumber}\nPublicação: ${document.publishedAt}`;
    const text = `${reference}\nResponsável: ${document.operatorName}\nContato: ${document.operatorEmail}\n\n${content}`;
    setCopying(true);
    try {
      await runTermsOperation('terms_copy', () =>
        navigator.clipboard.writeText(text),
      );
      setCopied(true);
    } catch {
      setCopyFallback(text);
    } finally {
      setCopying(false);
    }
  }
  return (
    <>
      <p className={styles.muted()}>
        {isPreview
          ? 'Rascunho — ainda não publicado.'
          : `Versão ${document.publicationNumber} · Publicado em ${new Date(document.publishedAt).toLocaleString('pt-BR')}`}
      </p>
      <p className={styles.text()}>
        Responsável: {document.operatorName} · Contato: {document.operatorEmail}
      </p>
      <p className={styles.text()}>{document.changeSummary}</p>
      <article
        aria-label="Texto integral dos termos"
        className={styles.html()}
        dangerouslySetInnerHTML={{ __html: document.contentHtml }}
      />
      <div className={styles.actions()}>
        <Button
          isPending={copying}
          onPress={() => void copy()}
          variant="secondary"
        >
          Copiar texto
        </Button>
        <span role="status">{copied ? 'Texto copiado.' : ''}</span>
      </div>
      {copyFallback === undefined ? null : (
        <TextField aria-label="Cópia dos termos para selecionar">
          <Label>Cópia dos termos para selecionar</Label>
          <TextArea className={styles.copy()} readOnly value={copyFallback} />
        </TextField>
      )}
    </>
  );
}
