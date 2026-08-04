import { expect, test } from '@playwright/test';

test.describe('Rota /dash', () => {
  test('Cenário 1 — Menu persistente em tablet e desktop', async ({ page }) => {
    await page.setViewportSize({ height: 1024, width: 768 });
    await page.goto('/dash');

    const applicationMenu = page.getByRole('complementary', {
      name: 'Menu da aplicação',
    });
    await expect(applicationMenu).toBeVisible();
    await expect(page.getByRole('img', { name: 'Alex Runner' })).toBeVisible();
    await expect(page.getByText('alex.runner@example.test')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeHidden();

    await page.setViewportSize({ height: 900, width: 1440 });
    await expect(applicationMenu).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeHidden();
  });

  test('Cenário 2 — Abrir e fechar o menu móvel pelo backdrop', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto('/dash');

    const openMenuButton = page.getByRole('button', { name: 'Abrir menu' });
    await expect(openMenuButton).toBeVisible();
    await expect(
      page.getByRole('complementary', { name: 'Menu da aplicação' }),
    ).toBeHidden();

    await openMenuButton.click();
    await expect(
      page.getByRole('dialog', { name: 'Menu da aplicação' }),
    ).toBeVisible();

    await page
      .locator('[data-slot="drawer-backdrop"]')
      .click({ position: { x: 385, y: 420 } });

    await expect(
      page.getByRole('dialog', { name: 'Menu da aplicação' }),
    ).toBeHidden();
    await expect(openMenuButton).toBeFocused();
  });

  test('Cenário 3 — Operar e fechar o menu móvel pelo teclado', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto('/dash');

    const openMenuButton = page.getByRole('button', { name: 'Abrir menu' });
    await openMenuButton.focus();
    await openMenuButton.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Menu da aplicação' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Tab');
    await expect
      .poll(() =>
        dialog.evaluate((element) => element.contains(document.activeElement)),
      )
      .toBe(true);

    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(openMenuButton).toBeFocused();
  });

  test('Cenário 4 — Identidade com foto e pessoa administradora', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 1024, width: 768 });
    await page.goto('/dash?mockAuth=admin');

    await expect(page.getByRole('img', { name: 'Alex Runner' })).toBeVisible();
    await expect(page.getByText('Alex Runner')).toBeVisible();
    await expect(page.getByText('alex.runner@example.test')).toBeVisible();
    await expect(page.getByText('Admin')).toBeVisible();
  });

  test('Cenário 5 — Orientação manual de instalação no menu', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 1024, width: 768 });
    await page.goto('/dash');

    const applicationMenu = page.getByRole('complementary', {
      name: 'Menu da aplicação',
    });
    await applicationMenu
      .getByRole('button', { name: 'Como instalar' })
      .click();

    await expect(
      applicationMenu.getByText('Abra o menu do navegador.'),
    ).toBeVisible();
    await expect(
      applicationMenu.getByText(/pode não oferecer essa forma/),
    ).toBeVisible();
  });

  test('Cenário 9 — Rota privada sem sessão', async ({ page }) => {
    await page.goto('/dash?mockAuth=unauthenticated');

    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('heading', { name: 'Entre para continuar' }),
    ).toBeVisible();
    await expect(page.getByText('alex.runner@example.test')).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Abrir menu' }),
    ).not.toBeVisible();
  });

  test('Cenário 10 — Falha técnica ao proteger o dashboard', async ({
    page,
  }) => {
    await page.goto('/dash?mockAuth=error');

    await expect(
      page.getByRole('heading', {
        name: 'Não foi possível carregar sua conta',
      }),
    ).toBeVisible();
    await expect(page.getByText('alex.runner@example.test')).not.toBeVisible();
  });

  test('fecha o Drawer ao entrar no breakpoint desktop', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto('/dash');
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Menu da aplicação' }),
    ).toBeVisible();

    await page.setViewportSize({ height: 1024, width: 768 });
    await expect(
      page.getByRole('dialog', { name: 'Menu da aplicação' }),
    ).toBeHidden();

    await page.setViewportSize({ height: 844, width: 390 });
    await expect(
      page.getByRole('button', { name: 'Abrir menu' }),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'Menu da aplicação' }),
    ).toBeHidden();
  });
});
