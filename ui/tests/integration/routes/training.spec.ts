import { expect, test } from '@playwright/test';

const workoutId = '64b000000000000000000101';

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
});
