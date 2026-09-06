import { expect, test } from '@playwright/test';

const planId = '64b000000000000000000001';
const workoutId = '64b000000000000000000101';

test.describe('Fluxo Gestão de planos de treino globais', () => {
  test('cria plano, mantém página 1 e apresenta o resultado confirmado', async ({
    page,
  }) => {
    await page.goto(
      '/global/training-plan?mockAuth=admin&mockTrainingPlans=create-success&page=2',
    );
    await page.getByRole('button', { name: 'Novo plano' }).click();
    await page.getByLabel('Nome').fill('Plano criado no fluxo');
    await page.getByLabel('Descrição').fill('Descrição criada no fluxo.');
    await page.getByRole('button', { name: 'Criar plano' }).click();

    await expect(
      page.getByRole('dialog', { name: 'Novo plano de treino' }),
    ).not.toBeVisible();
    await expect(page).toHaveURL(/mockTrainingPlans=create-success/);
    await expect(page).not.toHaveURL(/page=2/);
    await expect(
      page.getByRole('link', { name: 'Plano criado no fluxo' }),
    ).toBeVisible();
    await expect(page.getByText('Plano criado.')).toBeVisible();
  });

  test('restaura página, cache e draft quando a criação falha', async ({
    page,
  }) => {
    await page.goto(
      '/global/training-plan?mockAuth=admin&mockTrainingPlans=create-error&page=2',
    );
    await expect(page.getByText('Página 2 de 2')).toBeVisible();
    await page.getByRole('button', { name: 'Novo plano' }).click();
    await page.getByLabel('Nome').fill('Plano que falha');
    await page.getByLabel('Descrição').fill('Descrição que falha.');
    await page.getByRole('button', { name: 'Criar plano' }).click();

    await expect(
      page.getByRole('dialog', { name: 'Novo plano de treino' }),
    ).toBeVisible();
    await expect(page.getByLabel('Nome')).toHaveValue('Plano que falha');
    await expect(page.getByLabel('Descrição')).toHaveValue(
      'Descrição que falha.',
    );
    await expect(page).toHaveURL(/page=2/);
    await expect(
      page.getByRole('link', { name: 'Modelo de treino 21' }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('dialog', { name: 'Novo plano de treino' })
        .getByText('Não foi possível criar o plano.'),
    ).toBeVisible();
  });

  test('edita um plano com atualização otimista confirmada', async ({
    page,
  }) => {
    await page.goto(
      '/global/training-plan?mockAuth=admin&mockTrainingPlans=update-success',
    );
    await page
      .getByRole('button', { name: 'Ações de Hipertrofia iniciante' })
      .click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    await page.getByLabel('Nome').fill('Hipertrofia atualizada');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(
      page.getByRole('dialog', { name: 'Editar plano de treino' }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Hipertrofia atualizada' }),
    ).toBeVisible();
    await expect(page.getByText('Plano atualizado.')).toBeVisible();
  });

  test('propaga a atualização para outro documento sem recarga manual', async ({
    context,
    page,
  }) => {
    const otherDocument = await context.newPage();
    const path =
      '/global/training-plan?mockAuth=admin&mockTrainingPlans=update-success';
    await Promise.all([page.goto(path), otherDocument.goto(path)]);
    await expect(
      otherDocument.getByRole('link', { name: 'Hipertrofia iniciante' }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: 'Ações de Hipertrofia iniciante' })
      .click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    await page.getByLabel('Nome').fill('Hipertrofia em dois dispositivos');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(
      otherDocument.getByRole('link', {
        name: 'Hipertrofia em dois dispositivos',
      }),
    ).toBeVisible();
    await otherDocument.close();
  });

  test('atualiza detalhe e editor limpos a partir da leitura canônica', async ({
    context,
    page,
  }) => {
    const otherDocument = await context.newPage();
    const detailPath = `/global/training-plan/${planId}?mockAuth=admin&mockTrainingPlans=success`;
    await Promise.all([page.goto(detailPath), otherDocument.goto(detailPath)]);

    await page.getByRole('button', { name: 'Editar plano' }).click();
    await page.getByLabel('Nome').fill('Plano externo no detalhe');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(
      otherDocument.getByRole('heading', {
        name: 'Plano externo no detalhe',
      }),
    ).toBeVisible();

    const workoutPath = `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin&mockTrainingPlans=success`;
    await Promise.all([
      page.goto(workoutPath),
      otherDocument.goto(workoutPath),
    ]);
    await page.getByRole('button', { name: 'Editar nome do treino' }).click();
    await page
      .getByRole('textbox', { name: 'Nome do treino' })
      .fill('Treino externo limpo');
    await page.getByRole('button', { name: 'Salvar nome do treino' }).click();

    await expect(
      otherDocument.getByRole('heading', { name: 'Treino externo limpo' }),
    ).toBeVisible();
    await expect(
      otherDocument.getByText('Este plano foi alterado em outro lugar.'),
    ).not.toBeVisible();
    await otherDocument.close();
  });

  test('sai do workout removido externamente para o detalhe', async ({
    context,
    page,
  }) => {
    const workoutDocument = await context.newPage();
    const detailPath = `/global/training-plan/${planId}?mockAuth=admin&mockTrainingPlans=success`;
    const workoutPath = `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin&mockTrainingPlans=success`;
    await Promise.all([
      page.goto(detailPath),
      workoutDocument.goto(workoutPath),
    ]);

    await page.getByRole('button', { name: 'Ações de Treino A' }).click();
    await page.getByRole('menuitem', { name: 'Excluir' }).click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();

    await expect(workoutDocument).toHaveURL(
      new RegExp(`/global/training-plan/${planId}(?:\\?|$)`),
    );
    await expect(
      workoutDocument.getByRole('heading', { name: 'Hipertrofia iniciante' }),
    ).toBeVisible();
    await workoutDocument.close();
  });

  test('pausa um draft externo e descarta direto pelo alerta do workout', async ({
    context,
    page,
  }) => {
    const otherDocument = await context.newPage();
    const path = `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin&mockTrainingPlans=success`;
    await Promise.all([page.goto(path), otherDocument.goto(path)]);
    const otherExerciseName = otherDocument
      .getByRole('list', { name: 'Exercícios em ordem' })
      .getByRole('listitem')
      .first()
      .getByLabel('Nome');
    await otherExerciseName.fill('Draft ainda não salvo');

    await page.getByRole('button', { name: 'Editar nome do treino' }).click();
    await page
      .getByRole('textbox', { name: 'Nome do treino' })
      .fill('Treino externo');
    await page.getByRole('button', { name: 'Salvar nome do treino' }).click();

    const discard = otherDocument.getByRole('button', {
      name: 'Descartar e recarregar',
    });
    await expect(discard).toBeVisible();
    await discard.click();
    await expect(otherExerciseName).toHaveValue('Agachamento');
    await expect(otherDocument.getByRole('alertdialog')).not.toBeVisible();
    await otherDocument.close();
  });

  test('mantém o modal de edição e restaura somente o cache quando a atualização falha', async ({
    page,
  }) => {
    await page.goto(
      '/global/training-plan?mockAuth=admin&mockTrainingPlans=update-error',
    );
    await page
      .getByRole('button', { name: 'Ações de Hipertrofia iniciante' })
      .click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    await page.getByLabel('Nome').fill('Nome otimista temporário');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(
      page.getByRole('dialog', { name: 'Editar plano de treino' }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('dialog', { name: 'Editar plano de treino' })
        .getByRole('textbox', { name: 'Nome*' }),
    ).toHaveValue('Nome otimista temporário');
    await expect(
      page.getByRole('link', { name: 'Hipertrofia iniciante' }),
    ).toBeVisible();
    await expect(
      page.getByText('Não foi possível salvar o plano.'),
    ).toBeVisible();
  });

  test('mantém a confirmação recuperável e restaura o plano quando a exclusão falha', async ({
    page,
  }) => {
    await page.goto(
      '/global/training-plan?mockAuth=admin&mockTrainingPlans=delete-error',
    );
    await page
      .getByRole('button', { name: 'Ações de Hipertrofia iniciante' })
      .click();
    await page.getByRole('menuitem', { name: 'Excluir' }).click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();

    await expect(
      page.getByRole('alertdialog', { name: 'Excluir plano de treino?' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Hipertrofia iniciante' }),
    ).toBeVisible();
    await expect(
      page.getByText('Não foi possível excluir o plano.'),
    ).toBeVisible();
    await expect(page.getByText('O item foi restaurado.')).toBeVisible();
  });

  test('limita a janela visual mesmo com mais de cem páginas', async ({
    page,
  }) => {
    await page.goto(
      '/global/training-plan?mockAuth=admin&mockTrainingPlans=large-pagination&page=50',
    );

    await expect(page.getByText('Página 50 de 100')).toBeVisible();
    const pagination = page.getByRole('navigation', {
      name: 'Paginação dos planos',
    });
    await expect(pagination.getByRole('button')).toHaveCount(7);
    await expect(pagination.getByText('49', { exact: true })).toBeVisible();
    await expect(pagination.getByText('50', { exact: true })).toBeVisible();
    await expect(pagination.getByText('51', { exact: true })).toBeVisible();
    await expect(pagination.getByText('100', { exact: true })).toBeVisible();
  });

  test('canonicaliza página inválida sem manter entrada no histórico', async ({
    page,
  }) => {
    await page.goto(
      '/global/training-plan?mockAuth=admin&mockTrainingPlans=two-pages&page=101',
    );

    await expect(page).not.toHaveURL(/page=/);
    await expect(page.getByText('Página 1 de 2')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Hipertrofia iniciante' }),
    ).toBeVisible();
  });

  test('corrige página válida acima do último resultado', async ({ page }) => {
    await page.goto(
      '/global/training-plan?mockAuth=admin&mockTrainingPlans=two-pages&page=100',
    );

    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText('Página 2 de 2')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Modelo de treino 21' }),
    ).toBeVisible();
    await expect(page.getByText('Nenhum plano de treino')).not.toBeVisible();
  });

  test('edita nome e descrição inline no detalhe com ações icon-only', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}?mockAuth=admin&mockTrainingPlans=update-success`,
    );
    await expect(
      page.getByRole('button', { name: 'Excluir plano' }),
    ).not.toBeVisible();
    await page.getByRole('button', { name: 'Editar plano' }).click();

    await expect(
      page.getByRole('heading', { name: 'Hipertrofia iniciante' }),
    ).not.toBeVisible();
    await page.getByLabel('Nome').fill('Plano inline atualizado');
    await page.getByLabel('Descrição').fill('Descrição inline atualizada.');
    await expect(
      page.getByRole('button', { name: 'Cancelar edição' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(page.getByLabel('Nome')).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Plano inline atualizado' }),
    ).toBeVisible();
    await expect(page.getByText('Descrição inline atualizada.')).toBeVisible();
    await expect(page.getByText('Plano atualizado.')).toBeVisible();
  });

  test('cria treino, espera o id real e navega ao stub do editor', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}?mockAuth=admin&mockTrainingPlans=success`,
    );
    await expect(page.getByRole('heading', { name: 'Treinos' })).toBeVisible();
    await page.getByRole('button', { name: 'Novo treino' }).click();

    await expect(page).toHaveURL(
      new RegExp(`/workout/64b000000000000000000199`),
    );
    await expect(
      page.getByRole('heading', { name: 'Novo treino' }),
    ).toBeVisible();
    await expect(page.getByText('Treino criado.')).toBeVisible();
  });

  test('exclui treino de forma otimista e confirma no detalhe', async ({
    page,
  }) => {
    await page.goto(
      `/global/training-plan/${planId}?mockAuth=admin&mockTrainingPlans=delete-workout-success`,
    );
    await page.getByRole('button', { name: 'Ações de Treino A' }).click();
    await page.getByRole('menuitem', { name: 'Excluir' }).click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();

    await expect(
      page.getByRole('alertdialog', { name: 'Excluir treino?' }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Treino A' }),
    ).not.toBeVisible();
    await expect(page.getByText('Treino excluído.')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(planId));
    await expect(page).not.toHaveURL(new RegExp(workoutId));
  });
});
