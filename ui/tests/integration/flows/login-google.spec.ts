import { expect, test } from '@playwright/test';

test.describe('Fluxo Login com Google', () => {
  test('Cenário 2 — Jornada integrada fictícia', async ({ page }) => {
    await page.goto('/?mockAuth=unauthenticated');
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

  test('Cenário 4 — Logout revoga a sessão simulada e volta à raiz', async ({
    page,
  }) => {
    await page.goto('/dash');

    await page.getByRole('button', { name: 'Sair' }).click();

    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('heading', { name: 'Entre para continuar' }),
    ).toBeVisible();
  });

  test('Cenário 5 — Falha remota de logout ainda encerra o estado local', async ({
    page,
  }) => {
    await page.goto('/dash?mockAuth=logout-error');

    await page.getByRole('button', { name: 'Sair' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByText('alex.runner@example.test')).not.toBeVisible();
    await expect(
      page.getByText('Não foi possível sair. Tente novamente.'),
    ).toBeVisible();
  });
});

test.describe('Fluxo Login com Google — retomada da rota', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
      {
        name: 'dall-fit-mock-session',
        value: 'unauthenticated',
        url: baseURL!,
      },
    ]);
  });

  test('Cenário 6 — Link privado seguido de login', async ({ page }) => {
    await page.goto('/training-plan');
    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('link', { name: 'Meus planos', exact: true }),
    ).not.toBeVisible();
    let personRequests = 0;
    let csrfRequests = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/auth/me')) personRequests += 1;
      if (request.url().endsWith('/auth/csrf')) csrfRequests += 1;
    });
    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    await expect(page).toHaveURL('/training-plan');
    await expect(
      page.getByRole('link', { name: 'Meus planos', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    expect(personRequests).toBe(1);
    expect(csrfRequests).toBe(1);
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL('/dash');
    await page.reload();
    await expect(page).toHaveURL('/dash');
  });

  test('Cenário 7 — Query e fragmento após login administrativo', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: 'dall-fit-mock-login', value: 'admin', url: baseURL! },
    ]);
    await page.goto(
      '/global/training-plan?mockTrainingPlans=two-pages&page=2#planos',
    );
    await expect(page).toHaveURL('/');
    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    await expect(page).toHaveURL(
      '/global/training-plan?mockTrainingPlans=two-pages&page=2#planos',
    );
    await expect(
      page.getByRole('link', { name: 'Planos globais', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('Cenário 8 — Workout com os mesmos parâmetros de path', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: 'dall-fit-mock-login', value: 'admin', url: baseURL! },
    ]);
    const destination =
      '/global/training-plan/64b000000000000000000001/workout/64b000000000000000000101';
    await page.goto(destination);
    await expect(page).toHaveURL('/');
    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    await expect(page).toHaveURL(destination);
    await expect(
      page.getByRole('button', { name: 'Adicionar exercício' }),
    ).toBeVisible();
  });

  test('Cenário 9 — Recarga, erro OAuth e nova tentativa', async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto('/training');
    await expect(page).toHaveURL('/');
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Entrar com Google' }),
    ).toBeVisible();
    await context.addCookies([
      { name: 'dall-fit-mock-login', value: 'oauth-failed', url: baseURL! },
    ]);
    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    await expect(page).toHaveURL('/?authError=oauth_failed');
    await expect(page.getByText('Não foi possível entrar.')).toBeVisible();
    await context.clearCookies({ name: 'dall-fit-mock-login' });
    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    await expect(page).toHaveURL('/training');
    await expect(
      page.getByRole('link', { name: 'Treinar', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('Cenário 10 — Pessoa comum não retoma a branch administrativa', async ({
    page,
  }) => {
    await page.goto('/global/training-plan');
    await expect(page).toHaveURL('/');
    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    await expect(page).toHaveURL('/dash');
    await expect(
      page.getByRole('link', { name: 'Planos globais', exact: true }),
    ).not.toBeVisible();
    await page.reload();
    await expect(page).toHaveURL('/dash');
  });

  test('Cenário 11 — Logout e novo login não reaplicam destino consumido', async ({
    page,
  }) => {
    await page.goto('/training-plan');
    await expect(page).toHaveURL('/');
    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    await expect(page).toHaveURL('/training-plan');
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL('/');
    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    await expect(page).toHaveURL('/dash');
  });

  test('Cenário 12 — Última tentativa efetiva prevalece na mesma aba', async ({
    page,
  }) => {
    await page.goto('/training-plan');
    await expect(page).toHaveURL('/');
    await page.goto('/training');
    await expect(page).toHaveURL('/');
    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    await expect(page).toHaveURL('/training');
  });

  test('Cenário 13 — Abas independentes retomam seus próprios destinos', async ({
    page,
    context,
  }) => {
    const otherPage = await context.newPage();
    await page.goto('/training-plan');
    await otherPage.goto('/training');
    await expect(page).toHaveURL('/');
    await expect(otherPage).toHaveURL('/');
    await page.getByRole('button', { name: 'Entrar com Google' }).click();
    await expect(page).toHaveURL('/training-plan');
    // A sessão é compartilhada pelo cookie; a intenção da segunda aba continua local.
    await otherPage.reload();
    await expect(otherPage).toHaveURL('/training');
    await otherPage.close();
  });
});

test('Cenário 14 — Navegação bloqueada durante sessão ativa preserva a nova intenção', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('/dash');
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  await context.addCookies([
    { name: 'dall-fit-mock-session', value: 'unauthenticated', url: baseURL! },
  ]);
  await page.clock.setFixedTime(new Date(Date.now() + 31_000));
  await page.getByRole('link', { name: 'Treinar', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem('dall-fit:auth-return-to')),
    )
    .not.toBeNull();
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await expect(page).toHaveURL('/training');
});
