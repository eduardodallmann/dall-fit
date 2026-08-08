import { expect, test } from '@playwright/test';

const planId = '64b000000000000000000001';

test.describe('FIT-0010 — Bloqueio global da seleção de textos', () => {
  test('Cenário 1 — Conteúdo público não pode ser selecionado', async ({
    page,
  }) => {
    await page.goto('/');

    const heading = page.getByRole('heading', { name: 'Entre para continuar' });
    const headingBox = await heading.boundingBox();
    expect(headingBox).not.toBeNull();

    if (headingBox !== null) {
      await page.mouse.move(
        headingBox.x + 4,
        headingBox.y + headingBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        headingBox.x + headingBox.width - 4,
        headingBox.y + headingBox.height / 2,
        { steps: 8 },
      );
      await page.mouse.up();
    }

    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      '',
    );

    await heading.click();
    await page.keyboard.press('ControlOrMeta+A');
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      '',
    );
    await expect(
      page.getByRole('button', { name: 'Entrar com Google' }),
    ).toBeEnabled();
  });

  test('Cenário 2 — Shell autenticado permanece interativo sem seleção', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 1024, width: 768 });
    await page.goto('/dash');

    const applicationMenu = page.getByRole('complementary', {
      name: 'Menu da aplicação',
    });
    const personName = applicationMenu.getByText('Alex Runner');
    const personNameBox = await personName.boundingBox();
    expect(personNameBox).not.toBeNull();

    if (personNameBox !== null) {
      await page.mouse.move(
        personNameBox.x + 4,
        personNameBox.y + personNameBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        personNameBox.x + personNameBox.width - 4,
        personNameBox.y + personNameBox.height / 2,
        { steps: 8 },
      );
      await page.mouse.up();
    }

    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      '',
    );

    const homeLink = applicationMenu.getByRole('link', { name: 'Home' });
    await expect(homeLink).toHaveAttribute('href', '/dash');

    await page.setViewportSize({ height: 844, width: 390 });
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    const dialog = page.getByRole('dialog', { name: 'Menu da aplicação' });
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: 'Fechar menu' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/dash/);
  });

  test('Cenários 3, 4 e 6 — Portal bloqueado e campos textuais selecionáveis', async ({
    page,
  }) => {
    await page.goto('/global/training-plan?mockAuth=admin');

    const descriptionHeader = page.getByRole('columnheader', {
      name: 'Descrição',
    });
    const descriptionHeaderBox = await descriptionHeader.boundingBox();
    expect(descriptionHeaderBox).not.toBeNull();

    if (descriptionHeaderBox !== null) {
      await page.mouse.move(
        descriptionHeaderBox.x + 4,
        descriptionHeaderBox.y + descriptionHeaderBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        descriptionHeaderBox.x + descriptionHeaderBox.width - 4,
        descriptionHeaderBox.y + descriptionHeaderBox.height / 2,
        { steps: 8 },
      );
      await page.mouse.up();
    }

    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      '',
    );

    await page.getByRole('button', { name: 'Novo plano' }).click();

    const dialog = page.getByRole('dialog', { name: 'Novo plano de treino' });
    const dialogHeading = dialog.getByRole('heading', {
      name: 'Novo plano de treino',
    });
    const dialogHeadingBox = await dialogHeading.boundingBox();
    expect(dialogHeadingBox).not.toBeNull();

    if (dialogHeadingBox !== null) {
      await page.mouse.move(
        dialogHeadingBox.x + 4,
        dialogHeadingBox.y + dialogHeadingBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        dialogHeadingBox.x + dialogHeadingBox.width - 4,
        dialogHeadingBox.y + dialogHeadingBox.height / 2,
        { steps: 8 },
      );
      await page.mouse.up();
    }

    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      '',
    );

    const nameInput = dialog.getByLabel('Nome');
    const name = 'Plano com texto selecionável';
    await nameInput.fill(name);
    await nameInput.press('Control+A');

    expect(
      await nameInput.evaluate((element: HTMLInputElement) => ({
        end: element.selectionEnd,
        start: element.selectionStart,
      })),
    ).toEqual({ end: name.length, start: 0 });

    const descriptionInput = dialog.getByLabel('Descrição');
    await descriptionInput.fill('Descrição com trecho selecionável.');
    const descriptionBox = await descriptionInput.boundingBox();
    expect(descriptionBox).not.toBeNull();

    if (descriptionBox !== null) {
      await page.mouse.move(descriptionBox.x + 8, descriptionBox.y + 12);
      await page.mouse.down();
      await page.mouse.move(descriptionBox.x + 140, descriptionBox.y + 12, {
        steps: 8,
      });
      await page.mouse.up();
    }

    const descriptionSelection = await descriptionInput.evaluate(
      (element: HTMLTextAreaElement) => ({
        end: element.selectionEnd,
        start: element.selectionStart,
      }),
    );
    expect(descriptionSelection.end).toBeGreaterThan(
      descriptionSelection.start,
    );

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  });

  test('Cenário 5 — Edição inline limita a seleção aos campos', async ({
    page,
  }) => {
    await page.goto(`/global/training-plan/${planId}?mockAuth=admin`);
    await page.getByRole('button', { name: 'Editar plano' }).click();

    const nameInput = page.getByLabel('Nome');
    const descriptionInput = page.getByLabel('Descrição');
    await nameInput.press('Control+A');
    await expect(nameInput).toBeFocused();

    const nameSelection = await nameInput.evaluate(
      (element: HTMLInputElement) => ({
        end: element.selectionEnd,
        start: element.selectionStart,
        valueLength: element.value.length,
      }),
    );
    expect(nameSelection.start).toBe(0);
    expect(nameSelection.end).toBe(nameSelection.valueLength);

    await descriptionInput.press('Control+A');
    const descriptionSelection = await descriptionInput.evaluate(
      (element: HTMLTextAreaElement) => ({
        end: element.selectionEnd,
        start: element.selectionStart,
        valueLength: element.value.length,
      }),
    );
    expect(descriptionSelection.start).toBe(0);
    expect(descriptionSelection.end).toBe(descriptionSelection.valueLength);

    await page.getByRole('button', { name: 'Cancelar edição' }).click();
    await expect(page.getByLabel('Nome')).toBeHidden();

    const breadcrumbs = page.getByRole('list', {
      name: 'Navegação estrutural',
    });
    await breadcrumbs.click();
    await page.keyboard.press('Control+A');

    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      '',
    );
  });
});
