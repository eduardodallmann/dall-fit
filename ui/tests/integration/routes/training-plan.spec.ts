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

  test('retira a pessoa da branch administrativa após revogação', async ({
    page,
  }) => {
    await page.goto('/global/training-plan?mockAuth=admin-revoked');
    await expect(
      page.getByRole('heading', { name: 'Planos de treino' }),
    ).toBeVisible();

    await page.evaluate(() =>
      window.dispatchEvent(new Event('visibilitychange')),
    );

    await expect(page).toHaveURL('/dash');
    await expect(page.getByText('Admin')).not.toBeVisible();
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
    expect(request.headers()['x-resource-version']).toBe('0');
    expect(request.headers()['if-match']).toBeUndefined();
    expect(request.postDataJSON()).toEqual({ name: 'Agachamento atualizado' });
    await expect(firstExercise.getByLabel('Nome')).toHaveValue(
      'Agachamento atualizado',
    );
  });

  test('renova CSRF sem repetir o autosave automaticamente', async ({
    page,
  }) => {
    let patchCount = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'PATCH' &&
        request.url().includes('/exercises/64b000000000000000000201')
      )
        patchCount += 1;
    });
    await page.goto(
      `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=csrf-refresh&mockTrainingPlans=csrf-refresh`,
    );
    const firstExercise = page
      .getByRole('list', { name: 'Exercícios em ordem' })
      .getByRole('listitem')
      .first();
    await firstExercise.getByLabel('Nome').fill('Rascunho protegido');

    await expect(
      firstExercise.getByText(
        'Não foi possível salvar. O rascunho foi preservado.',
      ),
    ).toBeVisible({ timeout: 5_000 });
    expect(patchCount).toBe(1);
    await firstExercise
      .getByRole('button', { name: 'Tentar novamente' })
      .click();

    await expect(
      firstExercise.getByText(
        'Não foi possível salvar. O rascunho foi preservado.',
      ),
    ).not.toBeVisible();
    expect(patchCount).toBe(2);
  });

  test('propaga a versão entre duas adições consecutivas após a fila ficar ociosa', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin`,
    );
    const list = page.getByRole('list', { name: 'Exercícios em ordem' });
    const addButton = page.getByRole('button', { name: 'Adicionar' });
    await expect(list.getByRole('listitem')).toHaveCount(5);

    const firstRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && request.url().endsWith('/exercises'),
    );
    await addButton.click();
    await page.getByRole('menuitem', { name: 'YouTube Short' }).click();
    const firstRequest = await firstRequestPromise;
    expect(firstRequest.headers()['x-resource-version']).toBe('0');
    await expect(list.getByRole('listitem')).toHaveCount(6);
    await expect(addButton).toBeEnabled();

    const secondRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && request.url().endsWith('/exercises'),
    );
    await addButton.click();
    await page.getByRole('menuitem', { name: 'Imagem' }).click();
    const secondRequest = await secondRequestPromise;
    expect(secondRequest.headers()['x-resource-version']).toBe('1');
    await expect(list.getByRole('listitem')).toHaveCount(7);
    await expect(
      page.getByText('Este plano foi alterado em outro lugar.'),
    ).not.toBeVisible();
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

  test('trata 412 externo como falha genérica sem pausar a fila', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin&mockTrainingPlans=update-exercise-error`,
    );
    const name = page
      .getByRole('list', { name: 'Exercícios em ordem' })
      .getByRole('listitem')
      .first()
      .getByLabel('Nome');

    await name.fill('Rascunho preservado');

    await expect(
      page.getByText(
        'Não foi possível salvar o exercício. O rascunho foi preservado.',
      ),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByText('Este plano foi alterado em outro lugar.'),
    ).not.toBeVisible();
    await expect(name).toHaveValue('Rascunho preservado');
    await expect(page.getByRole('button', { name: 'Adicionar' })).toBeEnabled();
  });

  test('restaura draft sem PATCH oculto quando excluir falha durante debounce', async ({
    page,
  }) => {
    const patchRequests: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'PATCH' &&
        request.url().includes('/exercises/64b000000000000000000201')
      )
        patchRequests.push(request.url());
    });
    await page.goto(
      `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin&mockTrainingPlans=delete-exercise-error`,
    );
    const list = page.getByRole('list', { name: 'Exercícios em ordem' });
    const youtubeShort = list.getByRole('listitem').first();

    await youtubeShort.getByLabel('Nome').fill('Draft antes da exclusão');
    await youtubeShort
      .getByRole('button', { name: 'Excluir YouTube Short' })
      .click();
    await page
      .getByRole('dialog', { name: 'Excluir exercício?' })
      .getByRole('button', { name: 'Excluir', exact: true })
      .click();

    await expect(
      list.getByRole('listitem').first().getByLabel('Nome'),
    ).toHaveValue('Draft antes da exclusão');
    await expect(
      list.getByRole('listitem').first().getByRole('button', {
        name: 'Tentar novamente',
      }),
    ).toBeVisible();
    await page.waitForTimeout(3_200);
    expect(patchRequests).toHaveLength(0);
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

    await plansLink.click();
    await expect(
      page.getByRole('alertdialog', { name: 'Descartar alterações locais?' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Permanecer' }).click();
    await expect(page).toHaveURL(new RegExp(`/workout/${workoutId}`));

    await plansLink.click();
    await page.getByRole('button', { name: 'Sair e descartar' }).click();
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

  test('rollback de ordem preserva o draft editado durante a requisição', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin&mockTrainingPlans=reorder-error`,
    );
    const list = page.getByRole('list', { name: 'Exercícios em ordem' });
    const handle = page.getByRole('button', { name: 'Mover Duração' });
    await handle.focus();
    await handle.press('Space');
    await handle.press('ArrowUp');
    await handle.press('Space');
    await list
      .getByRole('listitem')
      .first()
      .getByLabel('Nome')
      .fill('Draft durante reordenação');

    await expect(
      page.getByText('Não foi possível reordenar os exercícios.'),
    ).toBeVisible();
    await expect(list.getByRole('listitem').nth(3)).toContainText('Pausa');
    await expect(list.getByRole('listitem').nth(4)).toContainText('Duração');
    await expect(
      list.getByRole('listitem').first().getByLabel('Nome'),
    ).toHaveValue('Draft durante reordenação');
  });
});
