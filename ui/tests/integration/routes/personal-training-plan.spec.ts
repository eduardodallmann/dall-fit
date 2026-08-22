import { expect, test } from '@playwright/test';

const ownedCatalogEntryId = '74b000000000000000000001';
const referenceCatalogEntryId = '74b000000000000000000002';
const workoutId = '64b000000000000000000101';

test.describe('Rotas pessoais de planos de treino', () => {
  test('mostra Meus planos para pessoa comum e administradora', async ({
    page,
  }) => {
    await page.goto('/training-plan?mockAuth=person&mockTrainingPlans=empty');
    await expect(
      page.getByRole('heading', { name: 'Meus planos' }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Navegação principal' })
        .getByRole('link', { name: 'Meus planos' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('link', { name: 'Planos globais' }),
    ).toHaveCount(0);

    await page.goto('/training-plan?mockAuth=admin&mockTrainingPlans=empty');
    await expect(page.getByRole('link', { name: 'Meus planos' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Planos globais' }),
    ).toBeVisible();
  });

  test('lista próprios e referências juntos e mantém exatamente um radio ativo', async ({
    page,
  }) => {
    await page.goto(
      '/training-plan?mockAuth=person&mockTrainingPlans=personal-mixed',
    );
    await expect(
      page.getByRole('link', { name: 'Hipertrofia iniciante' }),
    ).toBeVisible();
    await expect(page.getByRole('gridcell', { name: 'Próprio' })).toBeVisible();
    await expect(
      page.getByRole('gridcell', { exact: true, name: 'Plano global' }),
    ).toBeVisible();
    const radios = page.getByRole('radio');
    await expect(radios).toHaveCount(2);
    await radios.first().click();
    await expect(radios.first()).toBeChecked();
    await radios.nth(1).click();
    await expect(radios.first()).not.toBeChecked();
    await expect(radios.nth(1)).toBeChecked();
  });

  test('abre a biblioteca pelo dropdown e inicia uma clonagem bloqueada', async ({
    page,
  }) => {
    await page.goto(
      '/training-plan?mockAuth=person&mockTrainingPlans=clone-running',
    );
    await page.getByRole('button', { name: 'Novo plano' }).click();
    await page.getByRole('menuitem', { name: 'Copiar um plano' }).click();
    const dialog = page.getByRole('dialog', { name: 'Copiar um plano global' });
    await expect(dialog.getByText('Treino A:')).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Clonar' }).first(),
    ).toBeDisabled();
    const availablePlan = dialog
      .locator('article')
      .filter({ hasText: 'Plano global 3' });
    const useButton = availablePlan.getByRole('button', {
      name: 'Usar esse plano',
    });
    await expect(useButton).toBeEnabled();
    await availablePlan.getByRole('button', { name: 'Clonar' }).click();
    await expect(useButton).toBeDisabled();
    await expect(page.getByText('Clonagem iniciada.')).toBeVisible();
    await expect(page.getByText(/Clonando imagens:/)).toBeVisible();
  });

  test('navega por referência global sem expor controles de gravação', async ({
    page,
  }) => {
    await page.goto(
      `/training-plan/${referenceCatalogEntryId}?mockAuth=person&mockTrainingPlans=personal-reference`,
    );
    await expect(
      page.getByText('Plano global em modo de leitura.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Editar plano' }),
    ).toHaveCount(0);
    await page.getByRole('link', { name: 'Treino A' }).click();
    await expect(
      page.getByText('Nenhuma informação pode ser alterada'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Adicionar exercício' }),
    ).toHaveCount(0);
  });

  test('mantém o editor completo para um plano próprio', async ({ page }) => {
    await page.goto(
      `/training-plan/${ownedCatalogEntryId}/workout/${workoutId}?mockAuth=person&mockTrainingPlans=personal-mixed`,
    );
    await expect(page.getByRole('heading', { name: 'Treino A' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Adicionar exercício' }),
    ).toBeVisible();
    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        request.url().includes('/training-plans/74b000000000000000000001/'),
    );
    const first = page
      .getByRole('list', { name: 'Exercícios em ordem' })
      .getByRole('listitem')
      .first();
    await first.getByLabel('Nome').fill('Exercício pessoal');
    await requestPromise;
    await expect(first.getByLabel('Nome')).toHaveValue('Exercício pessoal');
  });
});
