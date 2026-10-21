import { expect, test, type Locator, type Page } from '@playwright/test';

const route =
  '/training-plan/74b000000000000000000001/workout/74b000000000000000000101';

async function openLibrary(page: Page, scenario = 'exercise-library') {
  await page.goto(`${route}?mockAuth=person&mockTrainingPlans=${scenario}`);
  await page.getByRole('button', { name: 'Adicionar exercício' }).click();
  await page.getByRole('menuitem', { name: 'Copiar exercícios' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Copiar exercícios',
    exact: true,
  });
  await expect(
    dialog.getByRole('searchbox', { name: 'Buscar exercício' }),
  ).toBeFocused();
  return dialog;
}

async function selectExercise(dialog: Locator, name: string) {
  await dialog.getByText(name, { exact: true }).click();
  await expect(
    dialog.getByRole('checkbox', { name: `Selecionar ${name}` }),
  ).toBeChecked();
}

for (const width of [1440, 390]) {
  test(`FIT-107 — Cenários 1 e 10: seleção entre áreas, busca e cópia completa (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const dialog = await openLibrary(page, 'exercise-library-body-area');
    await selectExercise(dialog, 'Agachamento');
    await dialog.getByRole('button', { name: /Área do corpo/ }).click();
    await page.getByRole('option', { name: 'Peito', exact: true }).click();
    await selectExercise(dialog, 'Supino');
    await expect(dialog.getByText('2 selecionados')).toBeVisible();
    await dialog
      .getByRole('searchbox', { name: 'Buscar exercício' })
      .fill('Corrida');
    await expect(dialog.getByText('Nenhum exercício encontrado')).toBeVisible();
    await expect(dialog.getByText('2 selecionados')).toBeVisible();
    await dialog.getByRole('button', { name: /Área do corpo/ }).click();
    await page
      .getByRole('option', { name: 'Todas as áreas', exact: true })
      .click();
    await selectExercise(dialog, 'Corrida');
    await expect(dialog.getByText('3 selecionados')).toBeVisible();
    await dialog
      .getByRole('button', { name: 'Copiar 3 exercícios', exact: true })
      .click();
    await expect(
      dialog.getByRole('button', { name: 'Cancelar' }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeHidden();
    const exercises = page.getByRole('list', { name: 'Exercícios em ordem' });
    await expect(exercises.getByRole('listitem')).toHaveCount(3);
    for (const [index, name] of [
      'Agachamento',
      'Supino',
      'Corrida',
    ].entries()) {
      await expect(
        exercises
          .getByRole('textbox', { name: 'Nome', exact: true })
          .nth(index),
      ).toHaveValue(name);
    }
    // The next operation starts after the copy has completed and the FIFO is idle.
    await page.getByRole('button', { name: 'Adicionar exercício' }).click();
    await page.getByRole('menuitem', { name: /^Pausa/ }).click();
    await expect(exercises.getByRole('listitem')).toHaveCount(4);
  });
}

test('FIT-107 — Cenário 6: falha mantém seleção e permite retry explícito', async ({
  page,
}) => {
  const dialog = await openLibrary(page, 'exercise-library-copy-error');
  await selectExercise(dialog, 'Agachamento');
  await dialog
    .getByRole('button', { name: 'Copiar 1 exercício', exact: true })
    .click();
  await expect(
    dialog.getByText(
      'Não foi possível confirmar a cópia. A seleção foi preservada.',
    ),
  ).toBeVisible();
  await expect(dialog.getByText('1 selecionado')).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Copiar 1 exercício', exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByRole('list', { name: 'Exercícios em ordem' })
      .getByRole('listitem'),
  ).toHaveCount(1);
});

test('FIT-107 — Cenário 5: origem obsoleta exige nova seleção', async ({
  page,
}) => {
  const dialog = await openLibrary(page, 'exercise-library-stale');
  await selectExercise(dialog, 'Agachamento');
  await dialog
    .getByRole('button', { name: 'Copiar 1 exercício', exact: true })
    .click();
  await expect(
    dialog.getByText(
      'Alguns exercícios mudaram. Atualize a biblioteca e selecione-os novamente.',
    ),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Atualizar biblioteca' }).click();
  await expect(dialog.getByText('0 selecionados')).toBeVisible();
  await selectExercise(dialog, 'Agachamento');
  await dialog
    .getByRole('button', { name: 'Copiar 1 exercício', exact: true })
    .click();
  await expect(dialog).toBeHidden();
});

test('FIT-107 — Cenário 7: conflito exige leitura canônica antes de outra cópia', async ({
  page,
}) => {
  const dialog = await openLibrary(page, 'exercise-library-conflict');
  await selectExercise(dialog, 'Agachamento');
  await dialog
    .getByRole('button', { name: 'Copiar 1 exercício', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', {
      name: 'Recarregar treino e descartar rascunhos',
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Copiar 1 exercício', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Revisar treino antes de continuar' }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Revisar treino antes de continuar' })
    .click();
  await expect(dialog.getByText('0 selecionados')).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Recarregar treino e descartar rascunhos' })
    .click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Adicionar exercício' }).click();
  await page.getByRole('menuitem', { name: 'Copiar exercícios' }).click();
  await selectExercise(dialog, 'Agachamento');
  await dialog
    .getByRole('button', { name: 'Copiar 1 exercício', exact: true })
    .click();
  await expect(dialog).toBeHidden();
});

test('FIT-107 — Cenário 4: limite considera selecionados ocultos', async ({
  page,
}) => {
  const dialog = await openLibrary(page, 'exercise-library-limit');
  await selectExercise(dialog, 'Agachamento');
  await selectExercise(dialog, 'Corrida');
  await dialog
    .getByRole('searchbox', { name: 'Buscar exercício' })
    .fill('Supino');
  await expect(
    dialog.getByRole('checkbox', { name: 'Selecionar Supino' }),
  ).toBeDisabled();
  await expect(dialog.getByText('2 selecionados')).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Copiar 2 exercícios', exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Adicionar exercício' }),
  ).toBeDisabled();
});

test('FIT-107 — Cenários 1 e 9: paginação preserva seleção e estados vazios são acionáveis', async ({
  page,
}) => {
  const dialog = await openLibrary(page);
  await selectExercise(dialog, 'Agachamento');
  await dialog.getByRole('button', { name: 'Próxima', exact: true }).click();
  await selectExercise(dialog, 'Supino');
  await expect(dialog.getByText('2 selecionados')).toBeVisible();
  await dialog.getByRole('button', { name: 'Anterior', exact: true }).click();
  await expect(
    dialog.getByRole('checkbox', { name: 'Selecionar Agachamento' }),
  ).toBeChecked();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(
    page.getByRole('button', { name: 'Adicionar exercício' }),
  ).toBeFocused();
  const empty = await openLibrary(page, 'exercise-library-empty');
  await expect(empty.getByText('Nenhum exercício disponível')).toBeVisible();
  await expect(
    empty.getByRole('button', { name: 'Copiar 0 exercícios', exact: true }),
  ).toBeDisabled();
});
