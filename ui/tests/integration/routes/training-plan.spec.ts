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

  test('distingue campos de modais e cards no tema escuro', async ({
    page,
  }) => {
    await page.goto('/global/training-plan?mockAuth=admin');
    await page.getByRole('button', { name: 'Ativar tema escuro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Novo plano' }).click();
    const modalName = page.getByRole('textbox', { name: 'Nome' });
    const modalColors = await modalName.evaluate((element) => ({
      field: getComputedStyle(element).backgroundColor,
      surface: getComputedStyle(element.closest('[role="dialog"]') as Element)
        .backgroundColor,
    }));
    expect(modalColors.field).not.toBe(modalColors.surface);
    await page.keyboard.press('Escape');

    await page.goto(
      `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin`,
    );
    await page.getByRole('button', { name: 'Ativar tema escuro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const exerciseName = page
      .getByRole('list', { name: 'Exercícios em ordem' })
      .getByRole('listitem')
      .first()
      .getByLabel('Nome');
    const editorColors = await exerciseName.evaluate((element) => ({
      field: getComputedStyle(element).backgroundColor,
      surface: getComputedStyle(element.closest('li') as Element)
        .backgroundColor,
    }));
    expect(editorColors.field).not.toBe(editorColors.surface);
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
    const workoutLink = page.getByRole('link', { name: 'Treino A' });
    await expect(workoutLink).toHaveCSS('text-decoration-line', 'underline');
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
    await expect(
      page.getByText('Alterações sendo salvas em ordem…'),
    ).toBeHidden();
    await expect(
      firstExercise.getByText('Alterações aguardando autosave.'),
    ).toHaveCount(0);
    await page
      .getByRole('list', { name: 'Navegação estrutural' })
      .getByRole('link', { name: 'Hipertrofia iniciante' })
      .click();
    await page.getByRole('link', { name: 'Treino A' }).click();
    await expect(
      page
        .getByRole('list', { name: 'Exercícios em ordem' })
        .getByRole('listitem')
        .first()
        .getByLabel('Nome'),
    ).toHaveValue('Agachamento atualizado');
  });

  test('exibe empty state, descreve os tipos e mantém a adição ao voltar para o treino', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin&mockTrainingPlans=empty-workout`,
    );
    const emptyState = page.getByText('Nenhum exercício');
    const addButton = page.getByRole('button', {
      name: 'Adicionar exercício',
    });
    await expect(emptyState).toBeVisible();
    const emptyBox = await emptyState.boundingBox();
    const addBox = await addButton.boundingBox();
    expect(emptyBox).not.toBeNull();
    expect(addBox).not.toBeNull();
    expect(emptyBox?.y).toBeLessThan(addBox?.y ?? 0);

    await addButton.click();
    await expect(
      page.getByText('Vídeo curto com descanso, séries e repetições.'),
    ).toBeVisible();
    await expect(
      page.getByText('Intervalo de descanso entre exercícios.'),
    ).toBeVisible();
    await page.getByRole('menuitem', { name: /YouTube Short/ }).click();

    const list = page.getByRole('list', { name: 'Exercícios em ordem' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(emptyState).toHaveCount(0);
    await page
      .getByRole('list', { name: 'Navegação estrutural' })
      .getByRole('link', { name: 'Hipertrofia iniciante' })
      .click();
    const workoutRow = page
      .getByRole('row')
      .filter({ has: page.getByRole('link', { name: 'Treino A' }) });
    await expect(workoutRow).toContainText('1');
    await workoutRow.getByRole('link', { name: 'Treino A' }).click();
    await expect(
      page
        .getByRole('list', { name: 'Exercícios em ordem' })
        .getByRole('listitem'),
    ).toHaveCount(1);
  });

  test('mantém hierarquia, layout responsivo e popover alinhado', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin`,
    );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Treino A' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Exercícios' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Editar nome do treino' }).click();
    await expect(
      page.getByRole('textbox', { name: 'Nome do treino' }),
    ).toBeVisible();
    await expect(
      page.locator('label').filter({ hasText: /^Nome do treino$/ }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancelar edição do nome' }).click();
    const firstExercise = page
      .getByRole('list', { name: 'Exercícios em ordem' })
      .getByRole('listitem')
      .first();
    const nameBox = await firstExercise.getByLabel('Nome').boundingBox();
    const restBox = await firstExercise
      .getByRole('textbox', { name: 'Descanso (s)' })
      .boundingBox();
    expect(nameBox).not.toBeNull();
    expect(restBox).not.toBeNull();
    expect(restBox?.y).toBeGreaterThan(nameBox?.y ?? Number.MAX_SAFE_INTEGER);

    const deleteButton = firstExercise.getByRole('button', {
      name: 'Excluir YouTube Short',
    });
    await deleteButton.click();
    const popover = page.getByRole('dialog', {
      name: 'Confirmar exclusão de YouTube Short',
    });
    const deleteBox = await deleteButton.boundingBox();
    const popoverBox = await popover.boundingBox();
    expect(deleteBox).not.toBeNull();
    expect(popoverBox).not.toBeNull();
    expect(popoverBox?.y).toBeGreaterThanOrEqual(
      (deleteBox?.y ?? 0) + (deleteBox?.height ?? 0) - 1,
    );
    expect(
      Math.abs(
        (popoverBox?.x ?? 0) +
          (popoverBox?.width ?? 0) -
          ((deleteBox?.x ?? 0) + (deleteBox?.width ?? 0)),
      ),
    ).toBeLessThanOrEqual(4);
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();

    await page.setViewportSize({ height: 844, width: 390 });
    const dragHandle = firstExercise.getByRole('button', {
      name: 'Mover YouTube Short',
    });
    await expect(dragHandle).toHaveCSS('touch-action', 'none');
    await expect(firstExercise).toHaveCSS('touch-action', 'auto');
    const restMobile = await firstExercise
      .getByRole('textbox', { name: 'Descanso (s)' })
      .boundingBox();
    const setsMobile = await firstExercise
      .getByRole('textbox', { name: 'Séries' })
      .boundingBox();
    const repetitionsMobile = await firstExercise
      .getByRole('textbox', { name: 'Repetições' })
      .boundingBox();
    expect(restMobile?.y).toBeLessThan(setsMobile?.y ?? 0);
    expect(setsMobile?.y).toBeLessThan(repetitionsMobile?.y ?? 0);
    const overflowingElements = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((element) => element.getBoundingClientRect().right > 390.5)
        .map((element) => ({
          className: element.className,
          right: element.getBoundingClientRect().right,
          tag: element.tagName,
          text: element.textContent?.trim().slice(0, 40),
        }))
        .slice(0, 10),
    );
    expect(overflowingElements).toEqual([]);
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
    const addButton = page.getByRole('button', {
      name: 'Adicionar exercício',
    });
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
      page.getByRole('button', { name: 'Adicionar exercício' }),
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
    await expect(
      page.getByRole('button', { name: 'Adicionar exercício' }),
    ).toBeEnabled();
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
      .getByRole('dialog', { name: 'Confirmar exclusão de YouTube Short' })
      .getByRole('button', { name: 'Confirmar exclusão' })
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
    await expect(page.locator('[data-drag-preview="true"]')).toBeVisible();
    await handle.press('ArrowUp');
    await handle.press('Space');
    expect(await page.locator('[data-drag-preview="true"]').count()).toBe(0);
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

  test('renova URL assinada expirada e baixa a imagem direto do Blob', async ({
    page,
  }) => {
    let workoutReads = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'GET' &&
        request.url().includes(`/workouts/${workoutId}`)
      )
        workoutReads += 1;
    });
    const privateImageResponse = page.waitForResponse(
      (response) =>
        response.status() === 200 &&
        response
          .url()
          .startsWith(
            'https://8u9fq5re0oenmrtc.private.blob.vercel-storage.com/',
          ),
    );

    await page.goto(
      `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin&mockTrainingPlans=image-signed-url-expired`,
    );

    await privateImageResponse;
    const image = page.getByRole('img', { name: 'Imagem de Supino' });
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', /fake-fresh/);
    await expect.poll(() => workoutReads).toBeGreaterThanOrEqual(2);
  });

  test('cancela a reordenação pelo teclado sem enviar mutação', async ({
    page,
  }) => {
    let reorderRequests = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'PUT' &&
        request.url().endsWith('/exercises/order')
      )
        reorderRequests += 1;
    });
    await page.goto(
      `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin`,
    );
    const list = page.getByRole('list', { name: 'Exercícios em ordem' });
    const handle = page.getByRole('button', { name: 'Mover Duração' });
    await handle.focus();
    await handle.press('Space');
    await expect(page.locator('[data-drag-preview="true"]')).toBeVisible();
    await handle.press('ArrowUp');
    await handle.press('Escape');

    await expect(page.locator('[data-drag-preview="true"]')).toHaveCount(0);
    await expect(page.getByText('Reordenação cancelada.')).toBeVisible();
    await expect(list.getByRole('listitem').nth(3)).toContainText('Pausa');
    await expect(list.getByRole('listitem').nth(4)).toContainText('Duração');
    expect(reorderRequests).toBe(0);
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
    await expect(page.locator('[data-drag-preview="true"]')).toBeVisible();
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
