import { expect, test } from '@playwright/test';

const workoutId = '64b000000000000000000101';

test.describe('FIT-108 — fechamento automático de descanso', () => {
  for (const width of [390, 1440]) {
    test(`Cenário ${width === 390 ? 7 : 8} — descanso entre séries fecha em ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: width === 390 ? 844 : 900, width });
      await page.clock.install();
      const outcomes: string[] = [];
      page.on('request', (request) => {
        if (request.url().endsWith('/training/session/timer/resolve'))
          outcomes.push(request.postData() ?? '');
      });
      await page.goto(
        `/training/workout/${workoutId}?mockAuth=person&mockTraining=session-running`,
      );
      await page
        .getByRole('button', { name: 'Finalizar série 1', exact: true })
        .click();
      const overlay = page.getByRole('dialog', {
        name: 'Descanso',
        exact: true,
      });
      await expect(overlay).toBeVisible();
      await page.clock.fastForward(61_000);
      await expect(overlay).toHaveCount(0);
      await expect(
        page.getByRole('textbox', { name: 'Carga da série 1', exact: true }),
      ).toHaveValue('15');
      await expect(
        page.getByRole('textbox', { name: 'Carga da série 1', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Finalizar série 2', exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByRole('button', { name: /1 Supino reto/ }),
      ).toBeFocused();
      expect(outcomes).toEqual(['{"outcome":"finish"}']);

      await page
        .getByRole('button', { name: 'Finalizar série 2', exact: true })
        .click();
      await expect(overlay).toBeVisible();
      await page.clock.fastForward(61_000);
      await expect(overlay).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Finalizar série 3', exact: true }),
      ).toBeEnabled();
      expect(outcomes).toEqual([
        '{"outcome":"finish"}',
        '{"outcome":"finish"}',
      ]);
    });

    test(`Cenário 9 — pausa conclui ao zerar em ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: width === 390 ? 844 : 900, width });
      await page.clock.install();
      await page.goto(
        `/training/workout/${workoutId}?mockAuth=person&mockTraining=pause-running`,
      );
      const overlay = page.getByRole('dialog', {
        name: 'Descanso',
        exact: true,
      });
      await expect(overlay).toBeVisible();
      await page.clock.fastForward(31_000);
      await expect(overlay).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /1 Supino reto/ }),
      ).toBeFocused();
      await page.getByRole('button', { name: /Pausa 30 s/ }).click();
      await expect(
        page.getByRole('button', { name: 'Reiniciar exercício' }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Iniciar descanso' }),
      ).toHaveCount(0);
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
    });
  }

  test('Cenário 10 — latência, falha e recuperação explícita do descanso', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.clock.install();
    const outcomes: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/training/session/timer/resolve'))
        outcomes.push(request.postData() ?? '');
    });
    await page.goto(
      `/training/workout/${workoutId}?mockAuth=person&mockTraining=timer-resolve-error`,
    );
    const overlay = page.getByRole('dialog', { name: 'Descanso', exact: true });
    const skip = overlay.getByRole('button', { name: 'Pular descanso' });
    await expect(overlay).toBeVisible();
    await page.clock.fastForward(31_000);
    await expect(skip).toBeDisabled();
    await expect(
      overlay.getByText('Não foi possível encerrar o descanso.'),
    ).toBeVisible();
    await expect(skip).toBeEnabled();
    await page.clock.fastForward(10_000);
    expect(outcomes).toEqual(['{"outcome":"finish"}']);
    await skip.click();
    await expect(overlay).toHaveCount(0);
    expect(outcomes).toEqual(['{"outcome":"finish"}', '{"outcome":"skip"}']);
  });
});

test.describe('Fluxo Treinar', () => {
  test('mostra o plano ativo, o treino atual e o estado sem plano', async ({
    page,
  }) => {
    await page.goto('/training?mockAuth=person&mockTraining=active-plan');

    await expect(
      page.getByRole('heading', { name: 'Plano ABC 1' }),
    ).toBeVisible();
    const currentWorkout = page.getByRole('link', { name: /Treino A/ });
    await expect(currentWorkout).toContainText('Atual');
    await expect(page.getByRole('link', { name: /Treino B/ })).toBeVisible();

    await page.goto('/training?mockAuth=person&mockTraining=no-active-plan');
    await expect(
      page.getByRole('heading', { name: 'Nenhum plano em uso' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ir para Meus planos' }),
    ).toBeVisible();
  });

  test('FIT-106 — escolhe temporariamente entre vários planos ativos', async ({
    page,
  }) => {
    await page.goto('/training?mockAuth=person&mockTraining=multiple-active');

    await expect(
      page.getByRole('heading', { name: 'Escolha um plano' }),
    ).toBeVisible();
    const selectedPlan = page.getByRole('link', { name: /Plano ABC 1/ });
    await selectedPlan.click();
    await expect(page).toHaveURL(/catalogEntryId=64b000000000000000000011/);
    await expect(
      page.getByRole('heading', { name: 'Plano ABC 1' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Escolher outro plano' }).click();
    await expect(page).not.toHaveURL(/catalogEntryId=/);
  });

  test('inicia, conclui série sem carga e finaliza treino incompleto', async ({
    page,
  }) => {
    await page.goto(
      `/training/workout/${workoutId}?mockAuth=person&mockTraining=workout-preview`,
    );

    await expect(page.getByText('Confira os exercícios')).toBeVisible();
    await page.getByRole('button', { name: 'Iniciar treino' }).click();
    const firstLoad = page.getByRole('textbox', {
      name: 'Carga da série 1',
    });
    await expect(firstLoad).toBeVisible();
    await firstLoad.fill('');
    await page
      .getByRole('button', { name: 'Finalizar séries restantes' })
      .click();
    await expect(
      page.getByRole('button', { name: /2 Elevação lateral/ }),
    ).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: /Supino reto/ }).click();
    await expect(
      page.getByRole('button', { name: 'Reiniciar exercício' }),
    ).toBeVisible();
    await expect(firstLoad).toHaveValue('');

    await page.getByRole('button', { name: 'Finalizar treino' }).click();
    const confirmation = page.getByRole('alertdialog', {
      name: 'Finalizar treino incompleto?',
    });
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole('button', { name: 'Finalizar mesmo assim' })
      .click();

    await expect(page).toHaveURL(/\/training\/completion\//);
    await expect(
      page.getByRole('heading', { name: 'Treino A finalizado' }),
    ).toBeVisible();
    await expect(page.getByText('Treino finalizado com')).toBeVisible();
  });

  test('mantém o treino atual até confirmar o descarte', async ({ page }) => {
    const otherWorkoutId = '64b000000000000000000102';
    await page.goto(
      `/training/workout/${otherWorkoutId}?mockAuth=person&mockTraining=session-running`,
    );

    await expect(
      page.getByText('Treino A já está em andamento.'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Descartar e iniciar este' })
      .click();
    const confirmation = page.getByRole('alertdialog', {
      name: 'Descartar treino em andamento?',
    });
    await confirmation.getByRole('button', { name: 'Manter treino' }).click();
    await expect(
      page.getByText('Treino A já está em andamento.'),
    ).toBeVisible();
  });

  test('informa expiração e retorna para a seleção', async ({ page }) => {
    await page.goto(
      `/training/workout/${workoutId}?mockAuth=person&mockTraining=session-expired`,
    );

    await expect(page).toHaveURL(/\/training\?/);
    await expect(
      page.getByText('Seu treino em andamento expirou'),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Plano ABC 1' }),
    ).toBeVisible();
  });

  test('FIT-75 — mantém uma coluna em 390 e 900 px e no máximo duas em 1440 px', async ({
    page,
  }) => {
    for (const width of [390, 900, 1440]) {
      await page.setViewportSize({ height: 900, width });
      await page.goto('/training?mockAuth=person&mockTraining=active-plan');
      const cards = page
        .getByRole('list', { name: 'Treinos do plano' })
        .getByRole('listitem');
      const first = await cards.nth(0).boundingBox();
      const second = await cards.nth(1).boundingBox();
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      if (first === null || second === null) continue;
      if (width < 1024) expect(second.x).toBe(first.x);
      else expect(second.x).toBeGreaterThan(first.x);
      const distinctColumns = await cards.evaluateAll(
        (items) =>
          new Set(
            items.map((item) => Math.round(item.getBoundingClientRect().x)),
          ).size,
      );
      expect(distinctColumns).toBeLessThanOrEqual(2);
    }
  });

  test('FIT-75 — centraliza o play sobre a miniatura do treino', async ({
    page,
  }) => {
    await page.goto('/training?mockAuth=person&mockTraining=active-plan');
    const card = page.getByRole('link', { name: /Treino A/ });
    const image = card.locator('img');
    const play = card.locator('svg.lucide-play');
    const imageBox = await image.boundingBox();
    const playBox = await play.boundingBox();
    expect(imageBox).not.toBeNull();
    expect(playBox).not.toBeNull();
    if (imageBox !== null && playBox !== null) {
      expect(playBox.x + playBox.width / 2).toBeCloseTo(
        imageBox.x + imageBox.width / 2,
        0,
      );
      expect(playBox.y + playBox.height / 2).toBeCloseTo(
        imageBox.y + imageBox.height / 2,
        0,
      );
    }
  });

  test('FIT-76 — mantém todo o cabeçalho dentro da área de expansão', async ({
    page,
  }) => {
    await page.goto(
      `/training/workout/${workoutId}?mockAuth=person&mockTraining=workout-preview`,
    );
    await expect(
      page.getByRole('link', { name: 'Voltar para treinos' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Iniciar treino' }).click();
    await expect(
      page.getByRole('link', { name: 'Voltar para treinos' }),
    ).toHaveCount(0);
    const header = page.getByRole('button', { name: /1 Supino reto/ });
    const card = header.locator('xpath=ancestor::*[@data-slot="card"]');
    const heading = header.getByRole('heading', { name: 'Supino reto' });
    const headerBox = await header.boundingBox();
    const cardBox = await card.boundingBox();
    const headingBox = await heading.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    if (headerBox !== null && cardBox !== null && headingBox !== null) {
      expect(headerBox.width).toBeGreaterThanOrEqual(cardBox.width - 2);
      expect(headerBox.height).toBeGreaterThan(40);
      expect(headingBox.y).toBeGreaterThanOrEqual(headerBox.y);
      expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(
        headerBox.y + headerBox.height,
      );
      await page.mouse.click(
        cardBox.x + cardBox.width - 8,
        headerBox.y + headerBox.height / 2,
      );
      await expect(header).toHaveAttribute('aria-expanded', 'false');
    }
    await header.focus();
    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    const pressedBox = await header.boundingBox();
    expect(pressedBox).not.toBeNull();
    if (pressedBox !== null) {
      await page.mouse.move(
        pressedBox.x + pressedBox.width / 2,
        pressedBox.y + pressedBox.height / 2,
      );
      await page.mouse.down();
      await expect(header).toHaveAttribute('data-pressed', 'true');
      await expect(header).toHaveCSS('transform', 'none');
      await page.mouse.up();
      await expect(header).toHaveAttribute('aria-expanded', 'true');
    }
  });

  test('FIT-76 — centraliza a carga e aceita conclusão durante o salvamento', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 390 });
    await page.goto(
      `/training/workout/${workoutId}?mockAuth=person&mockTraining=load-pending`,
    );
    const input = page.getByRole('textbox', { name: 'Carga da série 1' });
    const fieldGroup = input.locator('..');
    const inputBox = await input.boundingBox();
    const groupBox = await fieldGroup.boundingBox();
    expect(inputBox).not.toBeNull();
    expect(groupBox).not.toBeNull();
    if (inputBox !== null && groupBox !== null) {
      expect(inputBox.width).toBeGreaterThanOrEqual(groupBox.width - 2);
      expect(inputBox.height).toBeCloseTo(groupBox.height, 0);
      await expect(input).toHaveCSS('padding-top', '0px');
      await expect(input).toHaveCSS('padding-bottom', '0px');
      for (const horizontalPosition of [0.1, 0.5, 0.9]) {
        await page.mouse.click(
          groupBox.x + groupBox.width * horizontalPosition,
          groupBox.y + groupBox.height / 2,
        );
        await expect(input).toBeFocused();
      }
    }
    const firstSave = page.waitForRequest(
      (request) =>
        request.method() === 'PUT' && request.url().endsWith('/series/1/load'),
    );
    await input.fill('42');
    await input.blur();
    await firstSave;
    await expect(input).toBeEnabled();
    const complete = page.getByRole('button', { name: 'Finalizar série 1' });
    await expect(complete).toBeEnabled();
    await input.fill('43');
    await complete.click();
    await expect(input).toHaveValue('43');
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  });

  test('Cenário 4 — autosave sem blur nem conclusão', async ({ page }) => {
    await page.goto(
      `/training/workout/${workoutId}?mockAuth=person&mockTraining=load-pending`,
    );
    const input = page.getByRole('textbox', { name: 'Carga da série 2' });
    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().endsWith('/series/2/load') &&
        response.status() === 200,
    );
    await input.fill('50');
    await saveResponse;
    await expect(input).toHaveValue('50');
  });

  test('FIT-76 — posiciona o handle sem deslocar o título do drawer', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 390 });
    await page.goto(
      `/training/workout/${workoutId}?mockAuth=person&mockTraining=session-running`,
    );
    await page
      .getByRole('button', { name: 'Abrir mídia de Supino reto' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Supino reto' });
    await expect
      .poll(async () => {
        const dialogBox = await dialog.boundingBox();
        return dialogBox === null
          ? null
          : Math.round(dialogBox.y + dialogBox.height);
      })
      .toBe(900);
    const mobileDialogBox = await dialog.boundingBox();
    const mobileHeadingBox = await dialog
      .getByRole('heading', { name: 'Supino reto' })
      .boundingBox();
    const drawerHandle = dialog.locator('[data-slot="drawer-handle"]');
    const drawerHandleBar = drawerHandle.locator(
      '[data-slot="drawer-handle-bar"]',
    );
    const drawerHandleBarBox = await drawerHandleBar.boundingBox();
    expect(mobileDialogBox).not.toBeNull();
    expect(mobileHeadingBox).not.toBeNull();
    expect(drawerHandleBarBox).not.toBeNull();
    await expect(drawerHandle).toHaveCSS('position', 'absolute');
    if (
      mobileDialogBox !== null &&
      mobileHeadingBox !== null &&
      drawerHandleBarBox !== null
    ) {
      expect(mobileHeadingBox.x).toBeGreaterThanOrEqual(mobileDialogBox.x + 16);
      expect(mobileHeadingBox.y).toBeGreaterThanOrEqual(mobileDialogBox.y + 16);
      expect(mobileHeadingBox.x + mobileHeadingBox.width).toBeLessThanOrEqual(
        mobileDialogBox.x + mobileDialogBox.width - 16,
      );
      expect(drawerHandleBarBox.y).toBeGreaterThanOrEqual(
        mobileDialogBox.y + 8,
      );
      expect(drawerHandleBarBox.y + drawerHandleBarBox.height).toBeLessThan(
        mobileHeadingBox.y,
      );
    }
    const player = dialog.locator('div.aspect-\\[9\\/16\\]');
    const playerBox = await player.boundingBox();
    expect(playerBox).not.toBeNull();
    if (playerBox !== null)
      expect(playerBox.width / playerBox.height).toBeCloseTo(9 / 16, 1);

    await page.keyboard.press('Escape');
    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto(
      `/training/workout/${workoutId}?mockAuth=person&mockTraining=session-running`,
    );
    await page
      .getByRole('button', { name: 'Abrir mídia de Supino reto' })
      .click();
    const modal = page.getByRole('dialog', { name: 'Supino reto' });
    const modalBox = await modal.boundingBox();
    const modalHeadingBox = await modal
      .getByRole('heading', { name: 'Supino reto' })
      .boundingBox();
    expect(modalBox).not.toBeNull();
    expect(modalHeadingBox).not.toBeNull();
    if (modalBox !== null && modalHeadingBox !== null) {
      expect(modalHeadingBox.x).toBeGreaterThanOrEqual(modalBox.x + 16);
      expect(modalHeadingBox.y).toBeGreaterThanOrEqual(modalBox.y + 12);
      expect(modalHeadingBox.x + modalHeadingBox.width).toBeLessThanOrEqual(
        modalBox.x + modalBox.width - 48,
      );
    }
  });
});
