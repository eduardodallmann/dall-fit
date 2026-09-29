import { expect, test } from '@playwright/test';

test.describe('Dashboard', () => {
  test('pessoa sem plano vê estado vazio completo sem request administrativa', async ({
    page,
  }) => {
    let adminRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/admin/dashboard')
        adminRequests += 1;
    });

    await page.goto('/dash?mockDashboard=empty');

    await expect(
      page.getByRole('status', { name: 'Carregando sua visão geral' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Escolher um plano' }),
    ).toBeVisible();
    await expect(page.getByText('0 min')).toBeVisible();
    await expect(page.getByRole('meter')).toHaveCount(8);
    await expect(
      page.getByText(
        'Suas conclusões aparecerão aqui depois do primeiro treino.',
      ),
    ).toBeVisible();
    expect(adminRequests).toBe(0);
  });

  test('histórico pessoal navega pela ação e pela conclusão recente', async ({
    page,
  }) => {
    await page.goto('/dash?mockDashboard=personal');

    await expect(
      page.getByRole('button', { name: 'Começar treino' }),
    ).toBeVisible();
    await expect(page.getByText('6 h')).toBeVisible();
    await expect(page.getByRole('meter')).toHaveCount(8);
    await page
      .getByRole('link', { name: /Força de membros superiores/ })
      .first()
      .click();
    await expect(page).toHaveURL(
      /\/training\/completion\/64b000000000000000000301/,
    );
  });

  test('sessão em andamento prevalece como próxima ação', async ({ page }) => {
    await page.goto('/dash?mockDashboard=session-running');

    await expect(
      page.getByRole('button', { name: 'Retomar treino' }),
    ).toBeVisible();
    await expect(
      page.getByText(/Plano Equilíbrio Total · Costas e braços/),
    ).toBeVisible();
  });

  test('admin recebe conteúdo pessoal seguido dos agregados', async ({
    page,
  }) => {
    await page.goto('/dash?mockAuth=admin&mockDashboard=admin');

    const personal = page.getByRole('heading', { name: 'Visão geral' });
    const admin = page.getByRole('heading', { name: 'Visão administrativa' });
    await expect(personal).toBeVisible();
    await expect(admin).toBeVisible();
    await expect(
      page.getByRole('grid', { name: 'Modelos mais utilizados' }),
    ).toBeVisible();
    const personalBox = await personal.boundingBox();
    const adminBox = await admin.boundingBox();
    expect(adminBox?.y).toBeGreaterThan(personalBox?.y ?? 0);
    await expect(page.getByText('alex.runner@example.test')).toHaveCount(1);
  });

  test('falha pessoal preserva o shell e recupera por retry explícito', async ({
    page,
  }) => {
    await page.goto('/dash?mockDashboard=personal-error');

    await expect(page.getByText('alex.runner@example.test')).toBeVisible();
    await expect(
      page.getByText('Não foi possível carregar sua visão geral.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(
      page.getByRole('button', { name: 'Começar treino' }),
    ).toBeVisible();
  });

  test('falha administrativa preserva a dashboard pessoal', async ({
    page,
  }) => {
    await page.goto('/dash?mockAuth=admin&mockDashboard=admin-error');

    await expect(
      page.getByRole('button', { name: 'Começar treino' }),
    ).toBeVisible();
    await expect(
      page.getByText('Não foi possível carregar a visão administrativa.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(
      page.getByRole('grid', { name: 'Modelos mais utilizados' }),
    ).toBeVisible();
  });

  test('conclusão invalida o dashboard mantido na mesma navegação', async ({
    page,
  }) => {
    let dashboardRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/dashboard')
        dashboardRequests += 1;
    });
    await page.goto('/dash?mockDashboard=personal');
    await page.getByRole('button', { name: 'Começar treino' }).click();
    await page.getByRole('button', { name: 'Iniciar treino' }).click();
    await page.getByRole('button', { name: 'Finalizar treino' }).click();
    await page.getByRole('button', { name: 'Finalizar mesmo assim' }).click();
    await expect(page).toHaveURL(/\/training\/completion\//);
    await page.getByRole('link', { name: 'Home' }).click();

    await expect(page).toHaveURL('/dash');
    await expect
      .poll(() => dashboardRequests, { message: 'dashboard refetched' })
      .toBeGreaterThanOrEqual(2);
  });

  test('não cria overflow horizontal nos três viewports representativos', async ({
    page,
  }) => {
    for (const viewport of [
      { height: 844, width: 390 },
      { height: 1024, width: 768 },
      { height: 900, width: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/dash?mockAuth=admin&mockDashboard=admin');
      await expect(
        page.getByRole('heading', { name: 'Visão administrativa' }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  });
});
