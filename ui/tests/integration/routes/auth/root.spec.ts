import { expect, test } from '@playwright/test';

test.describe('Rota /', () => {
  test('Cenário 3 — Tema público acompanha o sistema sem persistir', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('dall-fit:theme')))
      .toBeNull();
  });
  test('Cenário 1 — Iniciar login', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Entre para continuar' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Entrar com Google' }),
    ).toBeVisible();
  });

  test('Cenário 2 — Exibir erro recuperável', async ({ page }) => {
    await page.goto('/?authError=oauth_failed');

    await expect(page.getByText('Não foi possível entrar.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Entrar com Google' }),
    ).toBeVisible();
  });
});
