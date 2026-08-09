import { Button, Disclosure } from '@heroui/react';
import { Download } from 'lucide-react';

import { trackUiEvent } from '~/core/analytics';
import { pwaInstallActionStyles } from '~/core/components/pwa-install-action/styles';
import { usePwa } from '~/core/pwa/pwa-context';

const styles = pwaInstallActionStyles();

function isIosDevice(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function PwaInstallAction() {
  const { install, installationMode, isInstalling } = usePwa();

  if (installationMode === 'installed') {
    return null;
  }

  return (
    <section aria-label="Instalação do aplicativo" className={styles.section()}>
      <p className={styles.title()}>Aplicativo</p>
      {installationMode === 'prompt' ? (
        <Button
          fullWidth
          isPending={isInstalling}
          onPress={() => void install()}
          variant="secondary"
        >
          <Download aria-hidden="true" size={18} />
          Instalar aplicativo
        </Button>
      ) : (
        <Disclosure
          onExpandedChange={(isExpanded) => {
            trackUiEvent({
              control: 'pwa_install_instructions',
              disclosure: 'pwa_install_instructions',
              eventName: 'ui_disclosure_toggled',
              state: isExpanded ? 'open' : 'closed',
              surface: 'pwa_install',
            });
          }}
        >
          <Disclosure.Heading>
            <Button fullWidth slot="trigger" variant="secondary">
              Como instalar
              <Disclosure.Indicator />
            </Button>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className={styles.instructions()}>
              {isIosDevice() ? (
                <ol className={styles.list()}>
                  <li>Abra o menu Compartilhar do navegador.</li>
                  <li>Selecione Adicionar à Tela de Início.</li>
                </ol>
              ) : (
                <ol className={styles.list()}>
                  <li>Abra o menu do navegador.</li>
                  <li>
                    Escolha Instalar aplicativo ou Adicionar à tela inicial.
                  </li>
                </ol>
              )}
              <p className={styles.compatibility()}>
                Se a opção não aparecer, o navegador ou o dispositivo pode não
                oferecer essa forma de instalação.
              </p>
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      )}
    </section>
  );
}
