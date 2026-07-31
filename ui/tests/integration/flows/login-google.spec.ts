import { expect, test } from '@playwright/test';

test.describe('Fluxo Login com Google', () => {
  test('Cenário 2 — Jornada integrada fictícia', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Entrar com Google' }).click();

    await expect(page).toHaveURL('/dash');
    await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('alex.runner@example.test')).toBeVisible();
  });

  test('Cenário 3 — Acesso privado sem sessão', async ({ page }) => {
    await page.goto('/dash?mockAuth=unauthenticated');

    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('heading', { name: 'Entre para continuar' }),
    ).toBeVisible();
  });
});
