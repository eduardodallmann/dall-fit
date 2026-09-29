import { expect, test, type Page } from '@playwright/test';

interface SddScreenshotCapture {
  fileName: string;
  fullPage?: boolean;
  name: string;
  path: string;
  prepare?: (page: Page) => Promise<void>;
  ready:
    | { kind: 'alertdialog'; name: RegExp | string }
    | { kind: 'button'; name: RegExp | string }
    | { kind: 'dialog'; name: RegExp | string }
    | { kind: 'heading'; name: RegExp | string }
    | { kind: 'text'; name: RegExp | string };
  routeSlug: string;
  viewport: { height: number; width: number };
}

const desktop = { height: 900, width: 1440 } as const;
const mobile = { height: 844, width: 390 } as const;
const planId = '64b000000000000000000001';
const workoutId = '64b000000000000000000101';
const completionId = '64b000000000000000000301';
const ownedCatalogEntryId = '74b000000000000000000001';
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
    path: '/dash?mockAuth=admin&mockDashboard=admin',
    ready: { kind: 'heading', name: 'Visão administrativa' },
    routeSlug: 'dash',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-menu-open.png',
    fullPage: false,
    name: 'menu aberto mobile',
    path: '/dash?mockAuth=admin&mockDashboard=admin',
    prepare: openApplicationMenu,
    ready: { kind: 'heading', name: 'Visão administrativa' },
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
    fileName: 'desktop-1440-empty.png',
    name: 'listagem global vazia desktop',
    path: '/global/training-plan?mockAuth=admin&mockTrainingPlans=empty',
    ready: { kind: 'heading', name: 'Nenhum plano de treino' },
    routeSlug: 'global-training-plan',
    viewport: desktop,
  },
  {
    fileName: 'desktop-1440-create-modal.png',
    fullPage: false,
    name: 'criação global desktop',
    path: '/global/training-plan?mockAuth=admin&mockTrainingPlans=success',
    prepare: openCreatePlanModal,
    ready: { kind: 'heading', name: 'Planos de treino' },
    routeSlug: 'global-training-plan',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-create-modal.png',
    fullPage: false,
    name: 'criação global mobile',
    path: '/global/training-plan?mockAuth=admin&mockTrainingPlans=success',
    prepare: openCreatePlanModal,
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
    fileName: 'desktop-1440-delete-workout-dialog.png',
    fullPage: false,
    name: 'confirmação de exclusão de treino desktop',
    path: `/global/training-plan/${planId}?mockAuth=admin&mockTrainingPlans=success`,
    prepare: openDeleteWorkoutDialog,
    ready: { kind: 'heading', name: 'Hipertrofia iniciante' },
    routeSlug: 'global-training-plan-detail',
    viewport: desktop,
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
    fileName: 'desktop-1440-image-modal.png',
    fullPage: false,
    name: 'imagem ampliada do exercício desktop',
    path: `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin&mockTrainingPlans=image-ready`,
    prepare: openWorkoutImageModal,
    ready: { kind: 'heading', name: 'Treino A' },
    routeSlug: 'global-training-plan-workout',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-image-modal.png',
    fullPage: false,
    name: 'imagem ampliada do exercício mobile',
    path: `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin&mockTrainingPlans=image-ready`,
    prepare: openWorkoutImageModal,
    ready: { kind: 'heading', name: 'Treino A' },
    routeSlug: 'global-training-plan-workout',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-delete-popover.png',
    fullPage: false,
    name: 'popover de exclusão de exercício desktop',
    path: `/global/training-plan/${planId}/workout/${workoutId}?mockAuth=admin&mockTrainingPlans=success`,
    prepare: openDeleteExercisePopover,
    ready: { kind: 'heading', name: 'Treino A' },
    routeSlug: 'global-training-plan-workout',
    viewport: desktop,
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
    fileName: 'desktop-1440-library-modal.png',
    fullPage: false,
    name: 'biblioteca de modelos desktop',
    path: '/training-plan?mockAuth=theme-light&mockTrainingPlans=personal-mixed',
    prepare: openTrainingPlanLibrary,
    ready: { kind: 'heading', name: 'Meus planos' },
    routeSlug: 'training-plan',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-library-modal.png',
    fullPage: false,
    name: 'biblioteca de modelos mobile',
    path: '/training-plan?mockAuth=theme-light&mockTrainingPlans=personal-mixed',
    prepare: openTrainingPlanLibrary,
    ready: { kind: 'heading', name: 'Meus planos' },
    routeSlug: 'training-plan',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-assistant-collecting-modal.png',
    fullPage: false,
    name: 'assistente coletando respostas desktop',
    path: '/training-plan?mockAuth=theme-light&mockTrainingPlans=assistant-collecting',
    prepare: openTrainingPlanAssistant,
    ready: { kind: 'heading', name: 'Meus planos' },
    routeSlug: 'training-plan',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-assistant-collecting-modal.png',
    fullPage: false,
    name: 'assistente coletando respostas mobile',
    path: '/training-plan?mockAuth=theme-light&mockTrainingPlans=assistant-collecting',
    prepare: openTrainingPlanAssistant,
    ready: { kind: 'heading', name: 'Meus planos' },
    routeSlug: 'training-plan',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-assistant-preview-modal.png',
    fullPage: false,
    name: 'prévia do assistente desktop',
    path: '/training-plan?mockAuth=theme-light&mockTrainingPlans=assistant-preview',
    prepare: openTrainingPlanAssistant,
    ready: { kind: 'heading', name: 'Meus planos' },
    routeSlug: 'training-plan',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-assistant-preview-modal.png',
    fullPage: false,
    name: 'prévia do assistente mobile',
    path: '/training-plan?mockAuth=theme-light&mockTrainingPlans=assistant-preview',
    prepare: openTrainingPlanAssistant,
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
    fileName: 'desktop-1440-owned.png',
    name: 'detalhe pessoal editável desktop',
    path: `/training-plan/${ownedCatalogEntryId}?mockAuth=theme-light&mockTrainingPlans=personal-mixed`,
    ready: { kind: 'heading', name: 'Hipertrofia iniciante' },
    routeSlug: 'training-plan-detail',
    viewport: desktop,
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
  {
    fileName: 'desktop-1440-owned.png',
    name: 'workout pessoal editável desktop',
    path: `/training-plan/${ownedCatalogEntryId}/workout/${workoutId}?mockAuth=theme-light&mockTrainingPlans=personal-mixed`,
    ready: { kind: 'heading', name: 'Treino A' },
    routeSlug: 'training-plan-workout',
    viewport: desktop,
  },
  {
    fileName: 'desktop-1440-training.png',
    name: 'visão geral de treinos desktop',
    path: '/training?mockAuth=theme-light&mockTraining=active-plan',
    ready: { kind: 'heading', name: 'Plano ABC 1' },
    routeSlug: 'training',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-training.png',
    name: 'visão geral de treinos mobile',
    path: '/training?mockAuth=theme-light&mockTraining=active-plan',
    ready: { kind: 'heading', name: 'Plano ABC 1' },
    routeSlug: 'training',
    viewport: mobile,
  },
  {
    fileName: 'mobile-390-no-active-plan.png',
    name: 'estado sem plano em uso mobile',
    path: '/training?mockAuth=theme-light&mockTraining=no-active-plan',
    ready: { kind: 'heading', name: 'Nenhum plano em uso' },
    routeSlug: 'training',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-training-workout.png',
    name: 'treino em andamento desktop',
    path: `/training/workout/${workoutId}?mockAuth=theme-light&mockTraining=workout-preview`,
    ready: { kind: 'heading', name: 'Treino A' },
    routeSlug: 'training-workout',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-training-workout.png',
    name: 'treino em andamento mobile',
    path: `/training/workout/${workoutId}?mockAuth=theme-light&mockTraining=workout-preview`,
    ready: { kind: 'heading', name: 'Treino A' },
    routeSlug: 'training-workout',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-session-running.png',
    name: 'sessão em andamento desktop',
    path: `/training/workout/${workoutId}?mockAuth=theme-light&mockTraining=sdd-session-running`,
    ready: { kind: 'button', name: /1 Supino reto/ },
    routeSlug: 'training-workout',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-session-running.png',
    name: 'sessão em andamento mobile',
    path: `/training/workout/${workoutId}?mockAuth=theme-light&mockTraining=sdd-session-running`,
    ready: { kind: 'button', name: /1 Supino reto/ },
    routeSlug: 'training-workout',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-media-modal.png',
    fullPage: false,
    name: 'mídia da execução desktop',
    path: `/training/workout/${workoutId}?mockAuth=theme-light&mockTraining=sdd-session-running`,
    prepare: openTrainingMedia,
    ready: { kind: 'button', name: /1 Supino reto/ },
    routeSlug: 'training-workout',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-media-drawer.png',
    fullPage: false,
    name: 'mídia da execução mobile',
    path: `/training/workout/${workoutId}?mockAuth=theme-light&mockTraining=sdd-session-running`,
    prepare: openTrainingMedia,
    ready: { kind: 'button', name: /1 Supino reto/ },
    routeSlug: 'training-workout',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-timer-modal.png',
    fullPage: false,
    name: 'timer da execução desktop',
    path: `/training/workout/${workoutId}?mockAuth=theme-light&mockTraining=sdd-pause-running`,
    ready: { kind: 'dialog', name: 'Descanso' },
    routeSlug: 'training-workout',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-timer-drawer.png',
    fullPage: false,
    name: 'timer da execução mobile',
    path: `/training/workout/${workoutId}?mockAuth=theme-light&mockTraining=sdd-pause-running`,
    ready: { kind: 'dialog', name: 'Descanso' },
    routeSlug: 'training-workout',
    viewport: mobile,
  },
  {
    fileName: 'mobile-390-finish-incomplete-dialog.png',
    fullPage: false,
    name: 'confirmação de finalização incompleta mobile',
    path: `/training/workout/${workoutId}?mockAuth=theme-light&mockTraining=sdd-session-running`,
    prepare: openIncompleteWorkoutDialog,
    ready: { kind: 'button', name: /1 Supino reto/ },
    routeSlug: 'training-workout',
    viewport: mobile,
  },
  {
    fileName: 'desktop-1440-training-completion.png',
    name: 'conclusão de treino desktop',
    path: `/training/completion/${completionId}?mockAuth=theme-light&mockTraining=sdd-workout-complete`,
    ready: { kind: 'heading', name: 'Treino A finalizado' },
    routeSlug: 'training-completion',
    viewport: desktop,
  },
  {
    fileName: 'mobile-390-training-completion.png',
    name: 'conclusão de treino mobile',
    path: `/training/completion/${completionId}?mockAuth=theme-light&mockTraining=sdd-workout-complete`,
    ready: { kind: 'heading', name: 'Treino A finalizado' },
    routeSlug: 'training-completion',
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
        fullPage: capture.fullPage ?? true,
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

async function openCreatePlanModal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Novo plano' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Novo plano de treino' }),
  ).toBeVisible();
}

async function openDeleteWorkoutDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ações de Treino A' }).click();
  await page.getByRole('menuitem', { name: 'Excluir' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
}

async function openWorkoutImageModal(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: 'Visualizar imagem de Supino' })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Imagem de Supino' }),
  ).toBeVisible();
}

async function openDeleteExercisePopover(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Excluir YouTube Short' }).click();
  await expect(
    page.getByRole('dialog', {
      name: 'Confirmar exclusão de YouTube Short',
    }),
  ).toBeVisible();
}

async function openTrainingPlanLibrary(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Novo plano' }).click();
  await page.getByRole('menuitem', { name: 'Copiar um plano' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Copiar um modelo' }),
  ).toBeVisible();
}

async function openTrainingPlanAssistant(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Novo plano' }).click();
  await page.getByRole('menuitem', { name: 'Me ajude a criar' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Me ajude a criar um plano' }),
  ).toBeVisible();
}

async function openTrainingMedia(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: 'Abrir mídia de Supino reto' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Supino reto' })).toBeVisible();
}

async function openIncompleteWorkoutDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Finalizar treino' }).click();
  await expect(
    page.getByRole('alertdialog', { name: 'Finalizar treino incompleto?' }),
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
