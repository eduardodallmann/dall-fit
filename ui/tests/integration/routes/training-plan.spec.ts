import { expect, test } from '@playwright/test';

const planId = '64b000000000000000000001';

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

  test('mantém o plano e omite somente o workout ausente do breadcrumb', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}/workout/workout-ausente?mockAuth=admin`,
    );

    const breadcrumbs = page.getByRole('list', {
      name: 'Navegação estrutural',
    });
    await expect(breadcrumbs.getByText('Hipertrofia iniciante')).toBeVisible();
    await expect(breadcrumbs).not.toContainText('workout-ausente');
    await expect(page.getByText('Treino não encontrado.')).toBeVisible();
  });
});
