import { expect, test } from '@playwright/test';

test.describe('Rota /me', () => {
  test('Cenário 1 — Carregamento com sucesso', async ({ page }) => {
    await page.goto('/me');

    await expect(
      page.getByRole('heading', { name: 'Sua conta' }),
    ).toBeVisible();
    await expect(page.getByText('Alex Runner')).toBeVisible();
    await expect(page.getByText('alex.runner@example.test')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Alex Runner' })).toBeVisible();
  });

  test('Cenário 2 — Sessão ausente', async ({ page }) => {
    await page.goto('/me?mockAuth=unauthenticated');

    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('heading', { name: 'Entre para continuar' }),
    ).toBeVisible();
    await expect(page.getByText('alex.runner@example.test')).not.toBeVisible();
  });

  test('Cenário 3 — Erro de integração', async ({ page }) => {
    await page.goto('/me?mockAuth=error');

    await expect(
      page.getByRole('heading', {
        name: 'Não foi possível carregar sua conta',
      }),
    ).toBeVisible();
  });
});
