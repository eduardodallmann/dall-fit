import { expect, test, type Page } from '@playwright/test';

interface SddScreenshotCapture {
  fileName: string;
  name: string;
  path: string;
  prepare?: (page: Page) => Promise<void>;
  ready:
    | { kind: 'button'; name: string }
    | { kind: 'heading'; name: string }
    | { kind: 'text'; name: string };
  routeSlug: string;
  viewport: { height: number; width: number };
}

const desktop = { height: 900, width: 1440 } as const;
const mobile = { height: 844, width: 390 } as const;
const planId = '64b000000000000000000001';
const workoutId = '64b000000000000000000101';
const referenceCatalogEntryId = '74b000000000000000000002';
const candidateDirectory = 'test-results/sdd-screenshots';

const captures: readonly SddScreenshotCapture[] = [
  {
    fileName: 'desktop-1440-login.png',
    name: 'login desktop',
    path: '/?mockAuth=unauthenticated',
    ready: { kind: 'heading', name: 'Entre para continuar' },
    routeSlug: 'root',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-login.png',
    name: 'login mobile',
    path: '/?mockAuth=unauthenticated',
    ready: { kind: 'heading', name: 'Entre para continuar' },
    routeSlug: 'root',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-menu.png',
    name: 'menu persistente desktop',
    path: '/dash?mockAuth=admin',
    ready: { kind: 'text', name: 'alex.runner@example.test' },
    routeSlug: 'dash',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-menu-open.png',
    name: 'menu aberto mobile',
    path: '/dash?mockAuth=admin',
    prepare: openApplicationMenu,
    ready: { kind: 'button', name: 'Abrir menu' },
    routeSlug: 'dash',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-success.png',
    name: 'listagem global desktop',
    path: '/global/training-plan?mockAuth=admin',
    ready: { kind: 'heading', name: 'Planos de treino' },
    routeSlug: 'global-training-plan',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-success.png',
    name: 'listagem global mobile',
    path: '/global/training-plan?mockAuth=admin',
    ready: { kind: 'heading', name: 'Planos de treino' },
    routeSlug: 'global-training-plan',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-success.png',
    name: 'detalhe global desktop',
    path: `/global/training-plan/${planId}?mockAuth=admin`,
    ready: { kind: 'heading', name: 'Hipertrofia iniciante' },
    routeSlug: 'global-training-plan-detail',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-success.png',
    name: 'detalhe global mobile',
    path: `/global/training-plan/${planId}?mockAuth=admin`,
    ready: { kind: 'heading', name: 'Hipertrofia iniciante' },
    routeSlug: 'global-training-plan-detail',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-success.png',
    name: 'workout global desktop',
    path: `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin`,
    ready: { kind: 'heading', name: 'Treino A' },
    routeSlug: 'global-training-plan-workout',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-success.png',
    name: 'workout global mobile',
    path: `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin`,
    ready: { kind: 'heading', name: 'Treino A' },
    routeSlug: 'global-training-plan-workout',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-mixed.png',
    name: 'catálogo pessoal desktop',
    path: '/training-plan?mockAuth=theme-light&mockTrainingPlans=personal-mixed',
    ready: { kind: 'heading', name: 'Meus planos' },
    routeSlug: 'training-plan',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-mixed.png',
    name: 'catálogo pessoal mobile',
    path: '/training-plan?mockAuth=theme-light&mockTrainingPlans=personal-mixed',
    ready: { kind: 'heading', name: 'Meus planos' },
    routeSlug: 'training-plan',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-read-only.png',
    name: 'detalhe pessoal somente leitura desktop',
    path: `/training-plan/${referenceCatalogEntryId}?mockAuth=theme-light&mockTrainingPlans=personal-reference`,
    ready: { kind: 'heading', name: 'Hipertrofia iniciante' },
    routeSlug: 'training-plan-detail',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-read-only.png',
    name: 'detalhe pessoal somente leitura mobile',
    path: `/training-plan/${referenceCatalogEntryId}?mockAuth=theme-light&mockTrainingPlans=personal-reference`,
    ready: { kind: 'heading', name: 'Hipertrofia iniciante' },
    routeSlug: 'training-plan-detail',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-read-only.png',
    name: 'workout pessoal somente leitura desktop',
    path: `/training-plan/${referenceCatalogEntryId}/workout/${workoutId}?mockAuth=theme-light&mockTrainingPlans=personal-reference`,
    ready: { kind: 'heading', name: 'Treino A' },
    routeSlug: 'training-plan-workout',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-read-only.png',
    name: 'workout pessoal somente leitura mobile',
    path: `/training-plan/${referenceCatalogEntryId}/workout/${workoutId}?mockAuth=theme-light&mockTrainingPlans=personal-reference`,
    ready: { kind: 'heading', name: 'Treino A' },
    routeSlug: 'training-plan-workout',
    viewport: mobile,
  },
];

test.describe('Candidatas a referências visuais do SDD', () => {
  for (const capture of captures) {
    test(`${capture.routeSlug} — ${capture.name}`, async ({ page }) => {
      await page.setViewportSize(capture.viewport);
      await page.emulateMedia({
        colorScheme: 'light',
        reducedMotion: 'reduce',
      });
      await page.goto(capture.path);
      await waitForCaptureReady(page, capture);
      await capture.prepare?.(page);
      await waitForStableAssets(page);

      await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        fullPage: true,
        path: `${candidateDirectory}/${capture.routeSlug}/${capture.fileName}`,
        scale: 'css',
        style:
          "img[src^='https://img.youtube.com/'] { visibility: hidden !important; }",
      });
    });
  }
});

async function openApplicationMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Menu da aplicação' }),
  ).toBeVisible();
}

async function waitForCaptureReady(
  page: Page,
  capture: SddScreenshotCapture,
): Promise<void> {
  const readyLocator =
    capture.ready.kind === 'text'
      ? page.getByText(capture.ready.name, { exact: true })
      : page.getByRole(capture.ready.kind, { name: capture.ready.name });

  await expect(readyLocator.first()).toBeVisible();
}

async function waitForStableAssets(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.images)
          .filter(
            (image) =>
              !image.src.startsWith('https://img.youtube.com/') &&
              image.offsetParent !== null,
          )
          .every((image) => image.complete),
      ),
    )
    .toBe(true);
}
