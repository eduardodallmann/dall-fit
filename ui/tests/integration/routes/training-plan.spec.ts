import { expect, test } from '@playwright/test';

const planId = '64b000000000000000000001';
const workoutId = '64b000000000000000000101';

test.describe('Rotas administrativas de planos de treino', () => {
  test('redireciona pessoa comum antes de renderizar conteúdo administrativo', async ({
    page,
  }) => {
    await page.goto('/global/training-plan');

    await expect(page).toHaveURL('/dash');
    await expect(
      page.getByRole('heading', { name: 'Planos de treino' }),
    ).not.toBeVisible();
  });

  test('lista planos para administradora e ativa o item do menu', async ({
    page,
  }) => {
    await page.goto('/global/training-plan?mockAuth=admin');

    await expect(
      page.getByRole('heading', { name: 'Planos de treino' }),
    ).toBeVisible();
    const planLink = page.getByRole('link', {
      name: 'Hipertrofia iniciante',
    });
    await expect(planLink).toBeVisible();
    await expect(planLink).toHaveCSS('text-decoration-line', 'underline');
    await expect(
      page
        .getByRole('navigation', { name: 'Navegação principal' })
        .getByRole('link', { name: 'Planos de treino', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Página 1 de 2')).toBeVisible();
  });

  test('mostra retry no EmptyState que pertence ao corpo da tabela', async ({
    page,
  }) => {
    await page.goto(
      '/global/training-plan?mockAuth=admin&mockTrainingPlans=list-error',
    );

    const table = page.getByRole('grid', {
      name: 'Planos de treino globais',
    });
    await expect(
      table.getByRole('heading', {
        name: 'Não foi possível carregar os planos',
      }),
    ).toBeVisible();
    await expect(
      table.getByRole('button', { name: 'Tentar novamente' }),
    ).toBeVisible();
  });

  test('centraliza o estado vazio da tabela e exibe um ícone decorativo', async ({
    page,
  }) => {
    await page.goto(
      '/global/training-plan?mockAuth=admin&mockTrainingPlans=empty',
    );

    const table = page.getByRole('grid', {
      name: 'Planos de treino globais',
    });
    const emptyState = table.locator('[data-slot="empty-state"]');
    await expect(
      emptyState.getByRole('heading', { name: 'Nenhum plano de treino' }),
    ).toBeVisible();
    await expect(emptyState.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    const tableBox = await table.boundingBox();
    const emptyBox = await emptyState.boundingBox();
    expect(tableBox).not.toBeNull();
    expect(emptyBox).not.toBeNull();
    if (tableBox !== null && emptyBox !== null) {
      const tableCenter = tableBox.x + tableBox.width / 2;
      const emptyCenter = emptyBox.x + emptyBox.width / 2;
      expect(Math.abs(tableCenter - emptyCenter)).toBeLessThan(4);
    }
  });

  test('usa skeletons no loading da tabela e das telas de detalhe', async ({
    page,
  }) => {
    await page.goto(
      '/global/training-plan?mockAuth=admin&mockTrainingPlans=loading',
    );
    await expect(
      page.getByRole('status', { name: 'Carregando planos' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Hipertrofia iniciante' }),
    ).toBeVisible();

    await page.goto(
      `/global/training-plan/${planId}?mockAuth=admin&mockTrainingPlans=loading`,
    );
    await expect(
      page.getByRole('status', { name: 'Carregando plano' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Hipertrofia iniciante' }),
    ).toBeVisible();

    await page.goto(
      `/global/training-plan/${planId}/workout/64b000000000000000000101?mockAuth=admin&mockTrainingPlans=loading`,
    );
    await expect(
      page.getByRole('status', { name: 'Carregando treino' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Treino A' })).toBeVisible();
  });

  test('navega pelo breadcrumb sem recarregar o documento', async ({
    page,
  }) => {
    await page.goto(`/global/training-plan/${planId}?mockAuth=admin`);
    await expect(
      page.getByRole('heading', { name: 'Hipertrofia iniciante' }),
    ).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.dataset.breadcrumbMarker = 'preserved';
    });

    await page
      .getByRole('list', { name: 'Navegação estrutural' })
      .getByRole('link', { name: 'Planos de treino' })
      .click();

    await expect(page).toHaveURL(/\/global\/training-plan\?/);
    await expect(
      page.getByRole('heading', { name: 'Planos de treino' }),
    ).toBeVisible();
    const marker = await page.evaluate(
      () => document.documentElement.dataset.breadcrumbMarker,
    );
    expect(marker).toBe('preserved');
  });

  test('omite o segmento dinâmico do breadcrumb quando o detalhe falha', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}?mockAuth=admin&mockTrainingPlans=detail-error`,
    );

    const breadcrumbs = page.getByRole('list', {
      name: 'Navegação estrutural',
    });
    await expect(breadcrumbs.getByText('Home')).toBeVisible();
    await expect(breadcrumbs.getByText('Planos de treino')).toBeVisible();
    await expect(breadcrumbs).not.toContainText(planId);
    await expect(breadcrumbs).not.toContainText('Hipertrofia iniciante');
  });

  test('omite identificadores dinâmicos quando o workout está ausente', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}/workout/workout-ausente?mockAuth=admin`,
    );

    const breadcrumbs = page.getByRole('list', {
      name: 'Navegação estrutural',
    });
    await expect(breadcrumbs).not.toContainText(planId);
    await expect(breadcrumbs).not.toContainText('workout-ausente');
    await expect(
      page.getByText('Não foi possível carregar o treino.'),
    ).toBeVisible();
  });

  test('carrega o editor tipado e salva linhas por autosave', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin`,
    );

    await expect(page.getByRole('heading', { name: 'Treino A' })).toBeVisible();
    const list = page.getByRole('list', { name: 'Exercícios em ordem' });
    await expect(list.getByRole('listitem')).toHaveCount(5);
    await expect(list.getByText('YouTube Short')).toBeVisible();
    await expect(list.getByText('Imagem', { exact: true })).toBeVisible();
    await expect(list.getByText('YouTube Longo')).toBeVisible();
    await expect(list.getByText('Pausa')).toBeVisible();
    await expect(list.getByText('Duração', { exact: true })).toBeVisible();

    const firstExercise = list.getByRole('listitem').first();
    const autosaveRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        request.url().includes('/exercises/64b000000000000000000201'),
    );
    await firstExercise.getByLabel('Nome').fill('Agachamento atualizado');
    const request = await autosaveRequest;
    expect(request.headers()['if-match']).toBe(
      '"training-plan:64b000000000000000000001:0"',
    );
    expect(request.postDataJSON()).toEqual({ name: 'Agachamento atualizado' });
    await expect(firstExercise.getByLabel('Nome')).toHaveValue(
      'Agachamento atualizado',
    );
  });

  test('preserva o rascunho e pausa a fila quando há conflito', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin&mockTrainingPlans=version-conflict`,
    );
    const name = page
      .getByRole('list', { name: 'Exercícios em ordem' })
      .getByRole('listitem')
      .first()
      .getByLabel('Nome');
    await name.fill('Rascunho concorrente');
    await expect(
      page.getByText('Este plano foi alterado em outro lugar.'),
    ).toBeVisible({ timeout: 5_000 });
    await expect(name).toHaveValue('Rascunho concorrente');
    await expect(
      page.getByRole('button', { name: 'Adicionar' }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Recarregar dados' }),
    ).toBeVisible();
  });

  test('confirma navegação quando há autosave ainda não enviado', async ({
    page,
  }) => {
    const editorUrl = `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin`;
    await page.goto(editorUrl);
    await page
      .getByRole('list', { name: 'Exercícios em ordem' })
      .getByRole('listitem')
      .first()
      .getByLabel('Nome')
      .fill('Rascunho aguardando envio');
    const plansLink = page
      .getByRole('list', { name: 'Navegação estrutural' })
      .getByRole('link', { name: 'Planos de treino' });

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('alterações ainda não enviadas');
      await dialog.dismiss();
    });
    await plansLink.click();
    await expect(page).toHaveURL(new RegExp(`/workout/${workoutId}`));

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await plansLink.click();
    await expect(page).toHaveURL(/\/global\/training-plan\?/);
  });

  test('reordena exercícios pelo teclado e envia a ordem completa', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin`,
    );
    const reorderRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PUT' &&
        request.url().endsWith('/exercises/order'),
    );
    const handle = page.getByRole('button', { name: 'Mover Duração' });
    await handle.focus();
    await handle.press('Space');
    await handle.press('ArrowUp');
    await handle.press('Space');
    const request = await reorderRequest;

    expect(request.postDataJSON()).toEqual({
      exerciseIds: [
        '64b000000000000000000201',
        '64b000000000000000000202',
        '64b000000000000000000203',
        '64b000000000000000000205',
        '64b000000000000000000204',
      ],
    });
    await expect(handle).toBeFocused();
  });
});
