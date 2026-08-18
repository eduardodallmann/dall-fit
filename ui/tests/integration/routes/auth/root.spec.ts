import { expect, test } from '@playwright/test';

test.describe('Rota /', () => {
  test('Cenário 3 — Tema público acompanha o sistema sem persistir', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/?mockAuth=unauthenticated');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('dall-fit:theme')))
      .toBeNull();
  });

  test('Cenário 1 — Iniciar login', async ({ page }) => {
    await page.goto('/?mockAuth=unauthenticated');

    await expect(
      page.getByRole('heading', { name: 'Entre para continuar' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Entrar com Google' }),
    ).toBeVisible();
  });

  test('Cenário 2 — Exibir erro recuperável', async ({ page }) => {
    await page.goto('/?mockAuth=unauthenticated&authError=oauth_failed');

    await expect(page.getByText('Não foi possível entrar.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Entrar com Google' }),
    ).toBeVisible();
  });

  test('Cenário 4 — Sessão ativa redireciona da raiz para /dashboard', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page).toHaveURL('/dash');
    await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('alex.runner@example.test')).toBeVisible();
  });

  test('Cenário 5 — Logout encerra a sessão e a raiz continua pública', async ({
    page,
  }) => {
    await page.goto('/dash');
    await page.getByRole('button', { name: 'Sair' }).click();

    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('heading', { name: 'Entre para continuar' }),
    ).toBeVisible();

    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Entre para continuar' }),
    ).toBeVisible();
    await expect(page.getByText('alex.runner@example.test')).not.toBeVisible();
  });
});
