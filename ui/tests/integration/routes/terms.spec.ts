import { expect, test, type Page } from '@playwright/test';

async function declareAndAccept(page: Page) {
  await page
    .getByText('Declaro que tenho 18 anos completos ou mais.', { exact: true })
    .click();
  await page.getByText(/^Li e aceito os Termos de Uso desta versão/).click();
  await page.getByRole('button', { name: 'Aceitar e continuar' }).click();
}

test.describe('Termos de uso', () => {
  test('Cenário 1 — Cadastro sem aceite implícito', async ({ page }) => {
    await page.goto('/?mockAuth=unauthenticated&mockTerms=required');
    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    await expect(
      page.getByRole('heading', { name: 'Termos de uso', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Home', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Aceitar e continuar' }),
    ).toBeDisabled();
    await expect(
      page.getByRole('checkbox', { name: /Declaro que tenho/ }),
    ).not.toBeChecked();
  });
  test('Cenário 2 — Aceite libera destino e vale entre sessões', async ({
    page,
  }) => {
    const business: string[] = [];
    page.on('request', (request) => {
      if (/\/api\/(dashboard|training-plans)(?:\?|$)/.test(request.url()))
        business.push(request.url());
    });
    await page.goto('/training-plan?mockTerms=required');
    await expect(
      page.getByRole('heading', { name: 'Termos de uso', exact: true }),
    ).toBeVisible();
    expect(business).toEqual([]);
    await declareAndAccept(page);
    await expect(page).toHaveURL(/\/training-plan/);
    await expect(
      page.getByRole('heading', { name: 'Meus planos' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Meus planos' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Termos de uso' }),
    ).toBeVisible();
  });
  test('Cenário 4 — Nova publicação bloqueia contas existentes e preserva o rascunho aberto', async ({
    page,
  }) => {
    await page.goto('/global/training-plan?mockAuth=admin&mockTerms=admin');
    await page.getByRole('button', { name: 'Novo plano' }).click();
    await page
      .getByRole('textbox', { name: /^Nome/ })
      .fill('Rascunho preservado');
    // Another administrative document publishes through the same mocked HTTP boundary.
    await page.evaluate(async () => {
      const headers = {
        'content-type': 'application/json',
        'x-dall-fit-mock-terms': 'admin',
      };
      const list = (await fetch('/api/admin/terms', { headers }).then(
        (response) => response.json(),
      )) as { data: { id: string }[] };
      const created = (await fetch('/api/admin/terms', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sourceVersionId: list.data[0].id }),
      }).then((response) => response.json())) as {
        data: { id: string; contentHash: string };
      };
      await fetch(`/api/admin/terms/${created.data.id}/publish`, {
        method: 'POST',
        headers: { ...headers, 'x-resource-version': '0' },
        body: JSON.stringify({
          previewContentHash: created.data.contentHash,
          expectedCurrentTermsId: list.data[0].id,
        }),
      });
    });
    await page.clock.setFixedTime(new Date(Date.now() + 31_000));
    await page.evaluate(() =>
      window.dispatchEvent(new Event('visibilitychange')),
    );
    await expect(
      page.getByRole('heading', { name: 'Termos de uso', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^Nome/ })).toBeHidden();
    await expect(page.getByText(/Versão 2 · Publicado/)).toBeVisible();
    await declareAndAccept(page);
    await expect(page.getByRole('textbox', { name: /^Nome/ })).toHaveValue(
      'Rascunho preservado',
    );
  });
  test('Cenário 10 — Falha de aceite e resultado ambíguo', async ({ page }) => {
    await page.goto('/dash?mockTerms=accept-error');
    await declareAndAccept(page);
    await expect(
      page.getByText('Não foi possível confirmar seu aceite. Tente novamente.'),
    ).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: /Declaro que tenho/ }),
    ).toBeChecked();
    await page.getByRole('button', { name: 'Aceitar e continuar' }).click();
    await expect(
      page.getByRole('heading', { name: 'Visão geral' }),
    ).toBeVisible();
  });
  test('Cenário 9 — Versão muda durante a leitura ou confirmação', async ({
    page,
  }) => {
    await page.goto('/dash?mockTerms=changed-during-acceptance');
    await declareAndAccept(page);
    await expect(page.getByText(/Versão 2 · Publicado/)).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: /Declaro que tenho/ }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('link', { name: 'Home', exact: true }),
    ).toHaveCount(0);
    await declareAndAccept(page);
    await expect(
      page.getByRole('heading', { name: 'Visão geral' }),
    ).toBeVisible();
  });
  test('Cenário 6 — Administração da primeira versão', async ({ page }) => {
    await page.goto('/admin/terms?mockAuth=admin&mockTerms=not-configured');
    await page.getByRole('button', { name: 'Criar versão' }).click();
    await page
      .getByRole('textbox', { name: /^Responsável/ })
      .fill('Responsável da nova versão');
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await page.getByRole('button', { name: 'Visualizar prévia' }).click();
    await expect(
      page.getByRole('heading', { name: 'Prévia — ainda não publicado' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Publicar versão' }).click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'O texto publicado ficará imutável',
    );
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Termos de uso', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Responsável: Responsável da nova versão/),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Home', exact: true }),
    ).toHaveCount(0);
    await declareAndAccept(page);
    await expect(
      page.getByRole('heading', { name: 'Gestão de termos' }),
    ).toBeVisible();
  });
  test('Cenário 13 — Consulta, cópia e discordância', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () => Promise.reject(new Error('Clipboard unavailable')),
        },
      });
    });
    await page.goto('/terms?mockTerms=accepted');
    await expect(
      page.getByRole('article', { name: 'Texto integral dos termos' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Copiar texto' }).click();
    await expect(
      page.getByRole('textbox', { name: 'Cópia dos termos para selecionar' }),
    ).toHaveValue(/Respeite seus limites/);
    await page.getByRole('button', { name: 'Meus aceites anteriores' }).click();
    await page.getByRole('button', { name: 'Ler versão 1' }).click();
    await expect(
      page.getByRole('button', { name: 'Aceitar e continuar' }),
    ).toHaveCount(0);
  });
  test('Cenário 16 — Acessibilidade e isolamento', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dash?mockTerms=required');
    await expect(
      page.getByRole('heading', { name: 'Termos de uso', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(
      page.getByRole('link', { name: 'Treinar', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Fechar menu' }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    const checkbox = page.getByRole('checkbox', { name: /Declaro que tenho/ });
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
  });
});
