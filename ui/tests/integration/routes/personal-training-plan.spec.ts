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

  test('FIT-76 — retoma o fim da conversa quando a pessoa interage novamente', async ({
    page,
  }) => {
    await page.goto(
      '/training-plan?mockAuth=person&mockTrainingPlans=assistant-resumed',
    );
    await page.getByRole('button', { name: 'Novo plano' }).click();
    await page.getByRole('menuitem', { name: 'Me ajude a criar' }).click();
    const dialog = page.getByRole('dialog', {
      name: 'Me ajude a criar um plano',
    });
    const conversation = dialog.getByRole('region', {
      name: 'Histórico da conversa',
    });
    await conversation.evaluate((element) => {
      element.style.height = '48px';
      element.style.flex = 'none';
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });
    await dialog.getByRole('button', { name: 'Condicionamento' }).click();
    await expect(conversation).toContainText('Condicionamento');
    await expect
      .poll(() =>
        conversation.evaluate(
          (element) =>
            element.scrollHeight - element.scrollTop - element.clientHeight,
        ),
      )
      .toBeLessThanOrEqual(1);

    await conversation.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
    });
    await dialog.getByRole('button', { name: 'Hipertrofia' }).click();
    await expect(conversation).toContainText('Hipertrofia');
    await expect
      .poll(() =>
        conversation.evaluate(
          (element) =>
            element.scrollHeight - element.scrollTop - element.clientHeight,
        ),
      )
      .toBeLessThanOrEqual(1);
  });

  test('FIT-76 — apresenta triagem neutra sem inferir sexo ou gênero pelo nome', async ({
    page,
  }) => {
    await page.goto(
      '/training-plan?mockAuth=person&mockTrainingPlans=assistant-neutral-screening',
    );
    await page.getByRole('button', { name: 'Novo plano' }).click();
    await page.getByRole('menuitem', { name: 'Me ajude a criar' }).click();
    const dialog = page.getByRole('dialog', {
      name: 'Me ajude a criar um plano',
    });
    const conversation = dialog.getByRole('region', {
      name: 'Histórico da conversa',
    });
    await expect(conversation).toContainText(
      'Existe alguma situação que exija acompanhamento profissional para você começar a se exercitar, como gestação, pós-parto ou outra condição específica?',
    );
    await expect(
      conversation.getByText('Você está em gestação ou pós-parto?'),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: 'Não', exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Sim' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Não sei' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Não sei' }).click();
    await expect(
      dialog.getByText('Geração indisponível nesta sessão'),
    ).toBeVisible();
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
      dialog.getByRole('region', { name: 'Histórico da conversa' }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole('region', { name: 'Prévia do plano' }),
    ).toContainText('Leg press sentado');
    await expect(
      dialog.getByRole('region', { name: 'Prévia do plano' }),
    ).toContainText('Bicicleta ergométrica');
    await expect(
      dialog.getByRole('region', { name: 'Prévia do plano' }),
    ).toContainText('10–20 s');
    await expect(
      dialog.getByRole('link', {
        name: 'Ver demonstração de Alongamento de quadríceps',
      }),
    ).toHaveAttribute('href', 'https://www.youtube.com/watch?v=yFvf_tdVook');
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
    await expect(
      dialog.getByRole('textbox', {
        name: 'Sua resposta à pergunta atual',
      }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: 'Enviar resposta' }),
    ).toHaveCount(0);
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
      page.getByRole('link', { name: 'Modelos de treino' }),
    ).toHaveCount(0);

    await page.goto('/training-plan?mockAuth=admin&mockTrainingPlans=empty');
    await expect(page.getByRole('link', { name: 'Meus planos' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Modelos de treino' }),
    ).toBeVisible();
  });

  test('lista próprios e referências e alterna checkboxes independentes', async ({
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
      page.getByRole('gridcell', {
        exact: true,
        name: 'Modelo disponibilizado',
      }),
    ).toBeVisible();
    const checkboxes = page.getByRole('checkbox');
    const checkboxLabels = page.locator('[data-slot="checkbox-content"]');
    await expect(checkboxes).toHaveCount(2);
    const firstRow = page.getByRole('row', {
      name: /Hipertrofia iniciante/,
    });
    const secondRow = page.getByRole('row', { name: /Modelo de treino 2/ });
    const firstCell = firstRow.getByRole('gridcell').first();
    const secondCell = secondRow.getByRole('gridcell').first();
    const idleBackground = await firstCell.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await checkboxLabels.first().click();
    await page.mouse.move(0, 0);
    await expect(checkboxes.first()).toBeChecked();
    await expect
      .poll(() =>
        firstCell.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      )
      .not.toBe(idleBackground);
    await expect(checkboxes.nth(1)).toBeEnabled();
    await checkboxLabels.nth(1).click();
    await page.mouse.move(0, 0);
    await expect(checkboxes.first()).toBeChecked();
    await expect(checkboxes.nth(1)).toBeChecked();
    await checkboxLabels.first().click();
    await page.mouse.move(0, 0);
    await expect(checkboxes.first()).not.toBeChecked();
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
    const dialog = page.getByRole('dialog', { name: 'Copiar um modelo' });
    await expect(dialog.getByText('Treino A:')).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Clonar' }).first(),
    ).toBeDisabled();
    const availablePlan = dialog
      .locator('article')
      .filter({ hasText: 'Modelo de treino 3' });
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
      page.getByText('Modelo disponibilizado em modo de leitura.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Editar plano' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Ações de Treino/ }),
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

  test('FIT-75 — criação pessoal omite legenda redundante e abre o treino criado', async ({
    page,
  }) => {
    await page.goto(
      '/training-plan?mockAuth=person&mockTrainingPlans=personal-mixed',
    );
    await page.getByRole('button', { name: 'Novo plano' }).click();
    await page.getByRole('menuitem', { name: 'Criar novo plano' }).click();
    const createDialog = page.getByRole('dialog', {
      name: 'Novo plano de treino',
    });
    await expect(createDialog.getByText('Identificação do plano')).toHaveCount(
      0,
    );
    await createDialog.getByRole('button', { name: 'Cancelar' }).click();

    await page.getByRole('link', { name: 'Hipertrofia iniciante' }).click();
    await page.getByRole('button', { name: 'Novo treino' }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/training-plan/${ownedCatalogEntryId}/workout/64b000000000000000000199`,
      ),
    );
    await expect(page.getByRole('heading', { name: 'Treino A' })).toBeVisible();
  });

  test('FIT-75 — biblioteca vazia orienta sem oferecer ações', async ({
    page,
  }) => {
    await page.goto(
      '/training-plan?mockAuth=person&mockTrainingPlans=library-empty',
    );
    await page.getByRole('button', { name: 'Novo plano' }).click();
    await page.getByRole('menuitem', { name: 'Copiar um plano' }).click();
    const dialog = page.getByRole('dialog', { name: 'Copiar um modelo' });
    await expect(
      dialog.getByRole('heading', { name: 'Nenhum modelo disponível' }),
    ).toBeVisible();
    await expect(dialog.getByText(/tente novamente mais tarde/)).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Usar esse plano' }),
    ).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Clonar' })).toHaveCount(0);
  });

  test('FIT-75 — excluir o plano ativo força nova leitura ao voltar para Treinar', async ({
    page,
  }) => {
    let trainingReads = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'GET' &&
        new URL(request.url()).pathname.endsWith('/training')
      )
        trainingReads += 1;
    });
    await page.goto('/training?mockAuth=person&mockTraining=active-plan');
    await expect(
      page.getByRole('heading', { name: 'Plano ABC 1' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Meus planos' }).click();
    const row = page.getByRole('row', { name: /Hipertrofia iniciante/ });
    await row.locator('[data-slot="checkbox-content"]').click();
    await row.getByRole('button', { name: /Ações de Hipertrofia/ }).click();
    await page.getByRole('menuitem', { name: 'Excluir' }).click();
    await page
      .getByRole('alertdialog', { name: 'Excluir plano?' })
      .getByRole('button', { name: 'Excluir' })
      .click();
    await expect(page.getByText('Plano excluído.')).toBeVisible();
    const readsBeforeReturn = trainingReads;
    await page.getByRole('link', { name: 'Treinar' }).click();
    await expect.poll(() => trainingReads).toBeGreaterThan(readsBeforeReturn);
  });

  test('FIT-76 — ativar um plano supera o estado vazio armazenado em Treinar', async ({
    page,
  }) => {
    let trainingReads = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'GET' &&
        new URL(request.url()).pathname.endsWith('/training')
      )
        trainingReads += 1;
    });

    await page.goto('/training?mockAuth=person&mockTraining=no-active-plan');
    await expect(
      page.getByRole('heading', { name: 'Nenhum plano em uso' }),
    ).toBeVisible();
    const readsAfterEmptyState = trainingReads;
    expect(readsAfterEmptyState).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Ir para Meus planos' }).click();
    const activeCheckbox = page
      .getByRole('row', { name: /Hipertrofia iniciante/ })
      .getByRole('checkbox');
    const activation = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        new URL(response.url()).pathname.endsWith('/training-plans/active'),
    );
    await activeCheckbox
      .locator('xpath=ancestor::label[@data-slot="checkbox-content"]')
      .click();
    await activation;
    await expect(activeCheckbox).toBeChecked();

    await page.goBack();
    await expect(
      page.getByRole('heading', { name: 'Plano ABC 1' }),
    ).toBeVisible();
    expect(trainingReads).toBeGreaterThan(readsAfterEmptyState);
  });

  test('Duplicar treino próprio — preserva o conteúdo, bloqueia duplicidade e usa a versão confirmada', async ({
    page,
  }) => {
    await page.goto(
      `/training-plan/${ownedCatalogEntryId}?mockAuth=person&mockTrainingPlans=personal-mixed`,
    );
    const versions: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/duplicate'))
        versions.push(request.headers()['x-resource-version']);
    });
    await page
      .getByRole('button', { name: 'Ações de Treino A', exact: true })
      .click();
    await expect(page.getByRole('menuitem')).toHaveText([
      'Duplicar',
      'Excluir',
    ]);
    await page.getByRole('menuitem', { name: 'Duplicar' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Duplicando treino' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Novo treino' }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Ações de Treino A', exact: true }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole('row', { name: /Treino A \(cópia\)/ })
        .getByRole('gridcell', { name: '5', exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/training-plan/${ownedCatalogEntryId}\\?`),
    );
    await expect(
      page.getByRole('button', { name: 'Ações de Treino A', exact: true }),
    ).toBeEnabled();
    await page
      .getByRole('button', { name: 'Ações de Treino A', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Duplicar' }).click();
    await expect(
      page.getByRole('link', { name: 'Treino A (cópia)', exact: true }),
    ).toHaveCount(2);
    expect(versions).toEqual(['0', '1']);
    await page
      .getByRole('link', { name: 'Treino A (cópia)', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Treino A (cópia)' }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'Exercícios em ordem' })
        .getByRole('listitem'),
    ).toHaveCount(5);
  });

  test('Duplicar treino próprio — falha preserva a lista e permite nova tentativa explícita', async ({
    page,
  }) => {
    await page.goto(
      `/training-plan/${ownedCatalogEntryId}?mockAuth=person&mockTrainingPlans=duplicate-workout-error`,
    );
    await page
      .getByRole('button', { name: 'Ações de Treino A', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Duplicar' }).click();
    await expect(
      page.getByText('Não foi possível duplicar o treino.'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Treino A (cópia)', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Treino B', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Ações de Treino A', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Duplicar' }).click();
    await expect(
      page.getByRole('link', { name: 'Treino A (cópia)', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Não foi possível duplicar o treino.'),
    ).toHaveCount(0);
  });

  test('Duplicar treino próprio — resultado incerto exige releitura sem repetir a operação', async ({
    page,
  }) => {
    await page.goto(
      `/training-plan/${ownedCatalogEntryId}?mockAuth=person&mockTrainingPlans=duplicate-workout-uncertain`,
    );
    let writes = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/duplicate'))
        writes += 1;
    });
    await page
      .getByRole('button', { name: 'Ações de Treino A', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Duplicar' }).click();
    await expect(
      page.getByText('Confirme o estado antes de continuar.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Novo treino' }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Verificar dados' }).click();
    await expect(
      page.getByRole('link', { name: 'Treino A (cópia)', exact: true }),
    ).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: 'Novo treino' }),
    ).toBeEnabled();
    expect(writes).toBe(1);
  });

  test('Duplicar treino próprio — conflito pausa gravações até a leitura canônica', async ({
    page,
  }) => {
    await page.goto(
      `/training-plan/${ownedCatalogEntryId}?mockAuth=person&mockTrainingPlans=version-conflict`,
    );
    await page
      .getByRole('button', { name: 'Ações de Treino A', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Duplicar' }).click();
    await expect(
      page.getByText('Este plano foi alterado em outro lugar.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Novo treino' }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Descartar e recarregar' }).click();
    await expect(
      page.getByRole('button', { name: 'Novo treino' }),
    ).toBeEnabled();
    await expect(
      page.getByRole('link', { name: 'Treino A (cópia)', exact: true }),
    ).toHaveCount(0);
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
