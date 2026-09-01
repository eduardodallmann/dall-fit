import { expect, test } from '@playwright/test';

const ownedCatalogEntryId = '74b000000000000000000001';
const referenceCatalogEntryId = '74b000000000000000000002';
const workoutId = '64b000000000000000000101';

test.describe('Rotas pessoais de planos de treino', () => {
  test('Cenário 1 — inicia, responde e retoma a conversa do assistente', async ({
    page,
  }) => {
    await page.goto(
      '/training-plan?mockAuth=person&mockTrainingPlans=assistant-collecting',
    );
    await page.getByRole('button', { name: 'Novo plano' }).click();
    const items = page.getByRole('menuitem');
    await expect(items).toHaveText([
      'Criar novo plano',
      'Copiar um plano',
      'Me ajude a criar',
    ]);
    await page.getByRole('menuitem', { name: 'Me ajude a criar' }).click();
    let dialog = page.getByRole('dialog', {
      name: 'Me ajude a criar um plano',
    });
    await expect(
      dialog.getByRole('region', { name: 'Histórico da conversa' }),
    ).toContainText('Qual é o principal objetivo');
    await dialog.getByRole('button', { name: 'Saúde geral' }).click();
    await expect(
      dialog.getByRole('region', { name: 'Histórico da conversa' }),
    ).toContainText('Saúde geral');
    await dialog.getByRole('button', { name: 'Fechar' }).click();

    await page.goto(
      '/training-plan?mockAuth=person&mockTrainingPlans=assistant-resumed',
    );
    await page.getByRole('button', { name: 'Novo plano' }).click();
    await page.getByRole('menuitem', { name: 'Me ajude a criar' }).click();
    dialog = page.getByRole('dialog', { name: 'Me ajude a criar um plano' });
    await expect(
      dialog.getByRole('region', { name: 'Histórico da conversa' }),
    ).toContainText('Saúde geral');
  });

  test('Cenário 6 — bloqueio e emergência não oferecem geração', async ({
    page,
  }) => {
    for (const scenario of ['assistant-blocked', 'assistant-emergency']) {
      await page.goto(
        `/training-plan?mockAuth=person&mockTrainingPlans=${scenario}`,
      );
      await page.getByRole('button', { name: 'Novo plano' }).click();
      await page.getByRole('menuitem', { name: 'Me ajude a criar' }).click();
      const dialog = page.getByRole('dialog', {
        name: 'Me ajude a criar um plano',
      });
      await expect(
        dialog.getByText('Geração indisponível nesta sessão'),
      ).toBeVisible();
      await expect(
        dialog.getByRole('button', { name: 'Gerar prévia' }),
      ).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Fechar' }).click();
      await expect(dialog).toHaveCount(0);
      await page.getByRole('button', { name: 'Novo plano' }).click();
      await page.getByRole('menuitem', { name: 'Me ajude a criar' }).click();
      const restartedDialog = page.getByRole('dialog', {
        name: 'Me ajude a criar um plano',
      });
      await expect(
        restartedDialog.getByText(
          /Suas respostas podem incluir dados de saúde/,
        ),
      ).toBeVisible();
      await restartedDialog.getByRole('button', { name: 'Agora não' }).click();
    }
  });

  test('Cenário 8 — confirma a prévia e navega para o plano criado', async ({
    page,
  }) => {
    await page.goto(
      '/training-plan?mockAuth=person&mockTrainingPlans=assistant-preview',
    );
    await page.getByRole('button', { name: 'Novo plano' }).click();
    await page.getByRole('menuitem', { name: 'Me ajude a criar' }).click();
    const dialog = page.getByRole('dialog', {
      name: 'Me ajude a criar um plano',
    });
    await expect(
      dialog.getByRole('region', { name: 'Prévia do plano' }),
    ).toContainText('Leg press sentado');
    await dialog.getByRole('button', { name: 'Criar plano' }).click();
    await expect(page).toHaveURL(/\/training-plan\/74b000000000000000000099/);
  });

  test('Cenário 14 — falha do provedor preserva sessão e oferece retry', async ({
    page,
  }) => {
    await page.goto(
      '/training-plan?mockAuth=person&mockTrainingPlans=assistant-provider-error',
    );
    await page.getByRole('button', { name: 'Novo plano' }).click();
    await page.getByRole('menuitem', { name: 'Me ajude a criar' }).click();
    const dialog = page.getByRole('dialog', {
      name: 'Me ajude a criar um plano',
    });
    await dialog.getByRole('button', { name: 'Gerar prévia' }).click();
    await expect(
      dialog.getByText(/Seu texto e sua sessão foram preservados/),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Tentar novamente' }),
    ).toBeVisible();
  });

  test('mostra Meus planos para pessoa comum e administradora', async ({
    page,
  }) => {
    await page.goto('/training-plan?mockAuth=person&mockTrainingPlans=empty');
    await expect(
      page.getByRole('heading', { name: 'Meus planos' }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Navegação principal' })
        .getByRole('link', { name: 'Meus planos' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('link', { name: 'Planos globais' }),
    ).toHaveCount(0);

    await page.goto('/training-plan?mockAuth=admin&mockTrainingPlans=empty');
    await expect(page.getByRole('link', { name: 'Meus planos' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Planos globais' }),
    ).toBeVisible();
  });

  test('lista próprios e referências juntos e mantém exatamente um radio ativo', async ({
    page,
  }) => {
    await page.goto(
      '/training-plan?mockAuth=person&mockTrainingPlans=personal-mixed',
    );
    await expect(
      page.getByRole('link', { name: 'Hipertrofia iniciante' }),
    ).toBeVisible();
    await expect(page.getByRole('gridcell', { name: 'Próprio' })).toBeVisible();
    await expect(
      page.getByRole('gridcell', { exact: true, name: 'Plano global' }),
    ).toBeVisible();
    const radios = page.getByRole('radio');
    await expect(radios).toHaveCount(2);
    const firstRow = page.getByRole('row', {
      name: /Hipertrofia iniciante/,
    });
    const secondRow = page.getByRole('row', { name: /Plano global/ });
    const firstCell = firstRow.getByRole('gridcell').first();
    const secondCell = secondRow.getByRole('gridcell').first();
    const idleBackground = await firstCell.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await radios.first().click();
    await page.mouse.move(0, 0);
    await expect(radios.first()).toBeChecked();
    await expect
      .poll(() =>
        firstCell.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      )
      .not.toBe(idleBackground);
    await expect(radios.nth(1)).toBeEnabled();
    await radios.nth(1).click();
    await page.mouse.move(0, 0);
    await expect(radios.first()).not.toBeChecked();
    await expect(radios.nth(1)).toBeChecked();
    await expect
      .poll(() =>
        firstCell.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      )
      .toBe(idleBackground);
    await expect
      .poll(() =>
        secondCell.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      )
      .not.toBe(idleBackground);
  });

  test('abre a biblioteca pelo dropdown e inicia uma clonagem bloqueada', async ({
    page,
  }) => {
    await page.goto(
      '/training-plan?mockAuth=person&mockTrainingPlans=clone-running',
    );
    await page.getByRole('button', { name: 'Novo plano' }).click();
    await page.getByRole('menuitem', { name: 'Copiar um plano' }).click();
    const dialog = page.getByRole('dialog', { name: 'Copiar um plano global' });
    await expect(dialog.getByText('Treino A:')).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Clonar' }).first(),
    ).toBeDisabled();
    const availablePlan = dialog
      .locator('article')
      .filter({ hasText: 'Plano global 3' });
    const useButton = availablePlan.getByRole('button', {
      name: 'Usar esse plano',
    });
    await expect(useButton).toBeEnabled();
    await availablePlan.getByRole('button', { name: 'Clonar' }).click();
    await expect(useButton).toBeDisabled();
    await expect(page.getByText('Clonagem iniciada.')).toBeVisible();
    await expect(page.getByText(/Clonando imagens:/)).toBeVisible();
  });

  test('navega por referência global sem expor controles de gravação', async ({
    page,
  }) => {
    await page.goto(
      `/training-plan/${referenceCatalogEntryId}?mockAuth=person&mockTrainingPlans=personal-reference`,
    );
    await expect(
      page.getByText('Plano global em modo de leitura.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Editar plano' }),
    ).toHaveCount(0);
    await page.getByRole('link', { name: 'Treino A' }).click();
    await expect(
      page.getByText('Nenhuma informação pode ser alterada'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Adicionar exercício' }),
    ).toHaveCount(0);
    const exerciseList = page.getByRole('list', {
      name: 'Exercícios em ordem',
    });
    await expect(exerciseList.getByRole('listitem')).toHaveCount(5);
    await expect(
      exerciseList.getByText('YouTube Short', { exact: true }),
    ).toBeVisible();
    await expect(
      exerciseList.getByText('Quadríceps', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('ZA8gs8XP2bs', { exact: true })).toHaveCount(0);

    const videoCard = exerciseList
      .getByRole('listitem')
      .filter({ hasText: 'Agachamento' });
    const videoPreview = videoCard.getByRole('button', {
      name: 'Reproduzir vídeo de Agachamento',
    });
    const videoCardBox = await videoCard.boundingBox();
    const videoPreviewBox = await videoPreview.boundingBox();
    expect(videoCardBox).not.toBeNull();
    expect(videoPreviewBox).not.toBeNull();
    if (videoCardBox !== null && videoPreviewBox !== null)
      expect(videoPreviewBox.x).toBeGreaterThan(
        videoCardBox.x + videoCardBox.width / 2,
      );
    await videoPreview.click();
    await expect(
      page.getByRole('dialog', { name: 'Vídeo de Agachamento' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Fechar vídeo' }).click();

    const imageCard = exerciseList
      .getByRole('listitem')
      .filter({ hasText: 'Supino' });
    const imagePreview = imageCard.getByRole('button', {
      name: 'Visualizar imagem de supino',
    });
    await expect(imagePreview).toBeVisible();
    await imagePreview.click();
    const imageDialog = page.getByRole('dialog', {
      name: 'Imagem de Supino',
    });
    await expect(imageDialog).toBeVisible();
    await expect(
      imageDialog.getByRole('img', { name: 'Imagem de Supino' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Fechar imagem' }).click();
  });

  test('mantém o editor completo para um plano próprio', async ({ page }) => {
    await page.goto(
      `/training-plan/${ownedCatalogEntryId}/workout/${workoutId}?mockAuth=person&mockTrainingPlans=personal-mixed`,
    );
    await expect(page.getByRole('heading', { name: 'Treino A' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Adicionar exercício' }),
    ).toBeVisible();
    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        request.url().includes('/training-plans/74b000000000000000000001/'),
    );
    const first = page
      .getByRole('list', { name: 'Exercícios em ordem' })
      .getByRole('listitem')
      .first();
    await first.getByLabel('Nome').fill('Exercício pessoal');
    await requestPromise;
    await expect(first.getByLabel('Nome')).toHaveValue('Exercício pessoal');
  });
});
