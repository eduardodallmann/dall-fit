import { expect, test } from '@playwright/test';

const workout = '64b000000000000000000101';
const personal = `/training-plan/74b000000000000000000001/workout/${workout}`;
const reference = `/training-plan/74b000000000000000000002/workout/${workout}`;
const global = `/global/training-plan/64b000000000000000000001/workout/${workout}`;
const image = 'public/pwa-64x64.png';

test.describe('FIT-110 — mídia opcional de duração', () => {
  for (const width of [390, 1440]) {
    test(`draft cancelável e troca atômica em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      const writes: string[] = [];
      page.on('request', (request) => {
        if (request.method() !== 'GET' && request.url().includes('/exercises/'))
          writes.push(request.method());
      });
      await page.goto(
        `${personal}?mockAuth=person&mockTrainingPlans=duration-video`,
      );
      const selector = page.getByRole('button', {
        name: /Mídia demonstrativa/u,
      });
      await expect(
        page.getByRole('textbox', { name: 'Vídeo do YouTube (opcional)' }),
      ).toHaveValue('ir-XXTWVm7g');
      await expect(
        page.getByRole('textbox', { name: 'Instruções (opcional)' }),
      ).toHaveValue('Mantenha a posição com conforto.');
      await selector.click();
      await page.getByRole('option', { name: 'Imagem', exact: true }).click();
      await page
        .getByRole('button', { name: 'Cancelar troca de mídia' })
        .click();
      await expect(
        page.getByRole('textbox', { name: 'Vídeo do YouTube (opcional)' }),
      ).toHaveValue('ir-XXTWVm7g');
      expect(writes).toEqual([]);
      await selector.click();
      await page.getByRole('option', { name: 'Imagem', exact: true }).click();
      await page.locator('input[type=file]').setInputFiles(image);
      await expect(
        page.getByRole('button', { name: 'Remover imagem', exact: true }),
      ).toBeVisible();
      expect(writes).toEqual(['PUT']);
      await selector.click();
      await page.getByRole('option', { name: 'Vídeo', exact: true }).click();
      const videoSaved = page.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes('/exercises/'),
      );
      await page
        .getByRole('textbox', { name: 'Vídeo do YouTube (opcional)' })
        .fill('ZA8gs8XP2bs');
      const videoResponse = await videoSaved;
      expect(videoResponse.status()).toBe(200);
      expect(await videoResponse.json()).toMatchObject({
        data: { youtubeId: 'ZA8gs8XP2bs', image: null },
      });
      await expect(
        page.getByRole('button', { name: 'Cancelar troca de mídia' }),
      ).toHaveCount(0);
      await expect.poll(() => writes).toEqual(['PUT', 'PATCH']);
      await expect(selector).toBeEnabled();
      await selector.click();
      await page
        .getByRole('option', { name: 'Sem mídia', exact: true })
        .click();
      await expect.poll(() => writes).toEqual(['PUT', 'PATCH', 'PATCH']);
      await expect(selector).toBeEnabled();
      await expect(
        page.getByRole('textbox', { name: 'Vídeo do YouTube (opcional)' }),
      ).toHaveCount(0);
      expect(writes).toEqual(['PUT', 'PATCH', 'PATCH']);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
  }

  test('falha conserva o arquivo e permite retry explícito', async ({
    page,
  }) => {
    await page.goto(
      `${personal}?mockAuth=person&mockTrainingPlans=duration-media-error`,
    );
    await page.getByRole('button', { name: /Mídia demonstrativa/u }).click();
    await page.getByRole('option', { name: 'Imagem', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles(image);
    await expect(
      page.getByText('Não foi possível salvar a mídia.', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Tentar novamente', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Remover imagem', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Não foi possível salvar a mídia.', { exact: true }),
    ).toHaveCount(0);
  });

  test('referência mostra imagem, vídeo e instruções sem escrita', async ({
    page,
  }) => {
    await page.goto(
      `${reference}?mockAuth=person&mockTrainingPlans=duration-reference`,
    );
    await expect(
      page.getByRole('heading', { name: 'Duração com imagem' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Duração com vídeo' }),
    ).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Mídia demonstrativa/u }),
    ).toHaveCount(0);
  });

  test('editor global oferece as mesmas opções e salva instruções', async ({
    page,
  }) => {
    await page.goto(
      `${global}?mockAuth=admin&mockTrainingPlans=duration-no-media`,
    );
    const instructions = page.getByRole('textbox', {
      name: 'Instruções (opcional)',
    });
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().includes('/exercises/'),
    );
    await instructions.fill('Respire com calma.');
    expect((await saved).status()).toBe(200);
    await expect(instructions).toHaveValue('Respire com calma.');
    await expect(
      page.getByRole('button', { name: /Mídia demonstrativa/u }),
    ).toBeVisible();
  });
});
