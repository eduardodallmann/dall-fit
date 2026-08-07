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

  test('restaura página e cache quando a criação falha', async ({ page }) => {
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
    ).not.toBeVisible();
    await expect(page).toHaveURL(/page=2/);
    await expect(
      page.getByRole('link', { name: 'Plano global 21' }),
    ).toBeVisible();
    await expect(
      page.getByText('Não foi possível criar o plano.'),
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

  test('fecha o modal de edição e restaura o cache quando a atualização falha', async ({
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
    ).not.toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Nome otimista temporário' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Hipertrofia iniciante' }),
    ).toBeVisible();
    await expect(
      page.getByText('Não foi possível salvar o plano.'),
    ).toBeVisible();
  });

  test('fecha a confirmação e restaura o plano quando a exclusão falha', async ({
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
    ).not.toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Hipertrofia iniciante' }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Hipertrofia iniciante' }),
    ).toBeVisible();
    await expect(
      page.getByText('Não foi possível excluir o plano.'),
    ).toBeVisible();
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
