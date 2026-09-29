import { expect, test } from '@playwright/test';

test.describe('Rota /dash', () => {
  test('Cenário 8 — Perfil autenticado substitui o tema local', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('dall-fit:theme', 'dark');
    });
    await page.goto('/dash?mockAuth=theme-light');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(
      page.getByRole('button', { name: 'Ativar tema escuro' }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('dall-fit:theme')))
      .toBe('light');
  });

  test('Cenário 9 — Perfil sem tema usa o sistema e remove o valor local', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => {
      window.localStorage.setItem('dall-fit:theme', 'dark');
    });
    await page.goto('/dash?mockAuth=theme-unset');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('dall-fit:theme')))
      .toBeNull();
  });

  test('Cenário 10 — Alterna e persiste o tema com estado compartilhado', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto('/dash?mockAuth=theme-dark');
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    const themeButtons = page.locator('button[aria-label="Ativar tema claro"]');
    await expect(themeButtons).toHaveCount(2);

    await page
      .getByRole('dialog', { name: 'Menu da aplicação' })
      .getByRole('button', { name: 'Ativar tema claro' })
      .click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('dall-fit:theme')))
      .toBe('light');
    await expect(
      page
        .getByRole('dialog', { name: 'Menu da aplicação' })
        .getByRole('button', { name: 'Ativar tema escuro' }),
    ).toBeEnabled();
  });

  test('Cenário 11 — Falha de gravação restaura o tema confirmado', async ({
    page,
  }) => {
    await page.goto('/dash?mockAuth=theme-save-error');

    await page.getByRole('button', { name: 'Ativar tema claro' }).click();

    await expect(
      page.getByText('Não foi possível salvar o tema. Tente novamente.'),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('dall-fit:theme')))
      .toBe('dark');
  });

  test('Cenário 12 — Falha sem tema confirmado retorna ao sistema', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/dash?mockAuth=theme-save-error-unset');

    await page.getByRole('button', { name: 'Ativar tema escuro' }).click();

    await expect(
      page.getByText('Não foi possível salvar o tema. Tente novamente.'),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('dall-fit:theme')))
      .toBeNull();
  });

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
    const dialogBox = await page
      .getByRole('dialog', { name: 'Menu da aplicação' })
      .boundingBox();
    const closeBox = await page
      .getByRole('button', { name: 'Fechar menu' })
      .boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(closeBox).not.toBeNull();
    expect(closeBox?.x).toBeGreaterThanOrEqual(
      (dialogBox?.x ?? 0) + (dialogBox?.width ?? 0),
    );

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
    await expect(page.getByText('Admin', { exact: true })).toBeVisible();
    const avatar = page.getByRole('img', { name: 'Alex Runner' });
    const theme = page.getByRole('button', { name: 'Ativar tema escuro' });
    const logout = page.getByRole('button', { name: 'Sair' });
    const avatarBox = await avatar.boundingBox();
    const themeBox = await theme.boundingBox();
    const logoutBox = await logout.boundingBox();
    expect(avatarBox).not.toBeNull();
    expect(themeBox).not.toBeNull();
    expect(logoutBox).not.toBeNull();
    expect(themeBox?.x).toBeLessThan(logoutBox?.x ?? 0);
    expect(
      Math.abs(
        (avatarBox?.y ?? 0) +
          (avatarBox?.height ?? 0) / 2 -
          ((logoutBox?.y ?? 0) + (logoutBox?.height ?? 0) / 2),
      ),
    ).toBeLessThanOrEqual(2);
    await expect(logout).toHaveText('');
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

  test('Cenário 20 — Perda e retomada de conexão preservam a rota', async ({
    context,
    page,
  }) => {
    await page.goto('/dash');
    await expect(page.getByText('alex.runner@example.test')).toBeVisible();

    await context.setOffline(true);

    await expect(
      page.getByRole('heading', { name: 'Conexão necessária' }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Treinos offline estão disponíveis no aplicativo Android.',
      ),
    ).toBeVisible();
    await expect(page.getByText('alex.runner@example.test')).not.toBeVisible();
    await expect(page).toHaveURL('/dash');

    await context.setOffline(false);

    await expect(page.getByText('alex.runner@example.test')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Conexão necessária' }),
    ).not.toBeVisible();
    await expect(page).toHaveURL('/dash');
  });

  test('Cenário 13 — Rota privada sem sessão', async ({ page }) => {
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

  test('Cenário 14 — Falha técnica ao proteger o dashboard', async ({
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

  test('Cenário 15 — Falha recuperável no bootstrap de CSRF', async ({
    page,
  }) => {
    await page.goto('/dash?mockAuth=csrf-error');

    await expect(
      page.getByRole('heading', {
        name: 'Não foi possível carregar sua conta',
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(/mockAuth=csrf-error/);
    await expect(
      page.getByRole('button', { name: 'Tentar novamente' }),
    ).toBeVisible();
  });

  test('Sessão expirada depois do mount executa uma única saída', async ({
    page,
  }) => {
    await page.goto('/dash?mockAuth=session-expired');
    await expect(page.getByText('alex.runner@example.test')).toBeVisible();

    await page.evaluate(() =>
      window.dispatchEvent(new Event('visibilitychange')),
    );

    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('heading', { name: 'Entre para continuar' }),
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

test('Destino inválido mantém o dashboard autenticado', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'dall-fit:auth-return-to',
      JSON.stringify({ href: '//example.test', capturedAt: Date.now() }),
    );
  });
  await page.goto('/dash');
  await expect(
    page.getByRole('link', { name: 'Home', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL('/dash');
});
