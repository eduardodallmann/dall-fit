/* global URL, caches, document, navigator, process, setTimeout */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const uiRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'dall-fit-pwa-update-'));
const buildA = join(temporaryRoot, 'build-a');
const buildB = join(temporaryRoot, 'build-b');
let publishedBuild = buildA;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const personResponse = JSON.stringify({
  data: {
    configs: { theme: 'light' },
    createdAt: '2026-08-22T12:00:00.000Z',
    email: 'pwa-update@example.test',
    id: 'pwa-update-test-person',
    isAdmin: true,
    name: 'PWA Update Test',
    updatedAt: '2026-08-22T12:00:00.000Z',
  },
});

function runBuild(outputDirectory, build, apiUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['exec', 'vite', 'build', '--outDir', outputDirectory, '--emptyOutDir'],
      {
        cwd: uiRoot,
        env: {
          ...process.env,
          VITE_API_URL: apiUrl,
          VITE_PWA_TEST_BUILD: build,
        },
        stdio: 'inherit',
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Vite build ${build} failed with code ${code}.`));
    });
  });
}

function sendJson(response, body) {
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(body);
}

function assertGeneratedServiceWorker(serviceWorker) {
  const forbiddenFragments = [
    'workbox-background-sync',
    'workbox-google-analytics',
    'BackgroundSyncPlugin',
    'offlineGoogleAnalytics',
  ];
  for (const fragment of forbiddenFragments) {
    if (serviceWorker.includes(fragment))
      throw new Error(`The generated service worker contains ${fragment}.`);
  }
  if (!serviceWorker.includes('NavigationRoute'))
    throw new Error(
      'The generated service worker lost its app-shell fallback.',
    );
}

async function readCacheEntries(page) {
  return page.evaluate(async () => {
    const result = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) result.push(request.url);
    }
    return result.sort();
  });
}

function assertAppShellCache(entries, expectedOrigin) {
  if (entries.length === 0)
    throw new Error('The service worker did not precache the app shell.');
  const allowedExtensions = new Set([
    '.css',
    '.html',
    '.ico',
    '.js',
    '.png',
    '.svg',
    '.webmanifest',
    '.woff2',
  ]);
  for (const entry of entries) {
    const url = new URL(entry);
    if (url.origin !== expectedOrigin)
      throw new Error(`The PWA cached a remote resource: ${entry}`);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/'))
      throw new Error(`The PWA cached a private route: ${entry}`);
    const extension = extname(url.pathname);
    if (url.pathname !== '/' && !allowedExtensions.has(extension))
      throw new Error(`The PWA cached a non-shell resource: ${entry}`);
  }
}

async function serveApplication(request, response) {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (requestUrl.pathname === '/api/auth/me') {
    sendJson(response, personResponse);
    return;
  }
  if (requestUrl.pathname === '/api/auth/csrf') {
    sendJson(response, JSON.stringify({ data: { token: 'pwa-test-csrf' } }));
    return;
  }
  if (requestUrl.pathname === '/api/global/training-plans') {
    sendJson(
      response,
      JSON.stringify({ data: [], page: 1, pageSize: 20, total: 0 }),
    );
    return;
  }
  if (requestUrl.pathname === '/api/realtime/events') {
    response.writeHead(204, { 'Cache-Control': 'no-store' });
    response.end();
    return;
  }

  const decodedPath = decodeURIComponent(requestUrl.pathname);
  const requestedRelativePath =
    decodedPath === '/' ? 'index.html' : decodedPath.slice(1);
  const safeRelativePath = normalize(requestedRelativePath);
  const parentPrefix = `..${process.platform === 'win32' ? '\\' : '/'}`;
  if (
    isAbsolute(safeRelativePath) ||
    safeRelativePath === '..' ||
    safeRelativePath.startsWith(parentPrefix)
  ) {
    response.writeHead(400);
    response.end();
    return;
  }
  let filePath = join(publishedBuild, safeRelativePath);

  try {
    const fileStats = await stat(filePath);
    if (fileStats.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(publishedBuild, 'index.html');
  }

  try {
    const body = await readFile(filePath);
    const extension = extname(filePath);
    response.writeHead(200, {
      'Cache-Control':
        safeRelativePath === 'sw.js' ? 'no-cache, no-store' : 'no-cache',
      'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
      ...(safeRelativePath === 'sw.js'
        ? { 'Service-Worker-Allowed': '/' }
        : {}),
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
}

const server = createServer((request, response) => {
  void serveApplication(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (address === null || typeof address === 'string')
  throw new Error('The isolated PWA server did not expose a TCP port.');
const origin = `http://127.0.0.1:${address.port}`;
let browser;

async function waitUntilControlled(page) {
  await page.evaluate(async () => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null)))
    await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

async function expectBuild(page, build) {
  await page.waitForFunction(
    (expectedBuild) =>
      document
        .querySelector('meta[name="dall-fit-pwa-test-build"]')
        ?.getAttribute('content') === expectedBuild,
    build,
    { timeout: 30_000 },
  );
}

try {
  await runBuild(buildA, 'A', `${origin}/api`);
  await runBuild(buildB, 'B', `${origin}/api`);
  assertGeneratedServiceWorker(await readFile(join(buildA, 'sw.js'), 'utf8'));
  assertGeneratedServiceWorker(await readFile(join(buildB, 'sw.js'), 'utf8'));
  publishedBuild = buildA;

  browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const safePage = await context.newPage();
  await safePage.goto(`${origin}/dash`);
  await waitUntilControlled(safePage);
  await expectBuild(safePage, 'A');
  const initialCacheEntries = await readCacheEntries(safePage);
  assertAppShellCache(initialCacheEntries, origin);

  let offlineApiRequests = 0;
  const offlinePage = await context.newPage();
  offlinePage.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      offlineApiRequests += 1;
  });
  await context.setOffline(true);
  await offlinePage.goto(`${origin}/dash`);
  await offlinePage
    .getByRole('heading', { name: 'Conexão necessária' })
    .waitFor();
  if (
    !(await offlinePage
      .getByText('Treinos offline estão disponíveis no aplicativo Android.')
      .isVisible())
  )
    throw new Error(
      'The offline shell did not promote the Android capability.',
    );
  if (offlineApiRequests !== 0)
    throw new Error('The offline shell started a private API request.');
  if (offlinePage.url() !== `${origin}/dash`)
    throw new Error('The offline shell changed the requested URL.');
  const offlineCacheEntries = await readCacheEntries(offlinePage);
  assertAppShellCache(offlineCacheEntries, origin);
  if (
    JSON.stringify(offlineCacheEntries) !== JSON.stringify(initialCacheEntries)
  )
    throw new Error('The PWA cache grew while the application was offline.');

  await context.setOffline(false);
  await offlinePage.getByText('pwa-update@example.test').first().waitFor();
  if (offlinePage.url() !== `${origin}/dash`)
    throw new Error('The restored connection did not preserve the route.');
  await offlinePage.close();

  const blockedPage = await context.newPage();
  await blockedPage.goto(`${origin}/global/training-plan`);
  await waitUntilControlled(blockedPage);
  await expectBuild(blockedPage, 'A');
  await blockedPage.getByRole('button', { name: 'Novo plano' }).click();
  const nameField = blockedPage.getByRole('dialog').getByLabel('Nome');
  await nameField.fill('Draft preservado');
  const authenticatedCacheEntries = await readCacheEntries(blockedPage);
  assertAppShellCache(authenticatedCacheEntries, origin);
  if (
    JSON.stringify(authenticatedCacheEntries) !==
    JSON.stringify(initialCacheEntries)
  )
    throw new Error('Authenticated use added a private PWA cache entry.');

  let safeReloads = 0;
  safePage.on('framenavigated', (frame) => {
    if (frame === safePage.mainFrame()) safeReloads += 1;
  });
  publishedBuild = buildB;
  await safePage.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration === undefined)
      throw new Error('PWA registration was not found.');
    await registration.update();
  });

  await expectBuild(safePage, 'B');
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  if (safeReloads !== 1)
    throw new Error(`The safe document reloaded ${safeReloads} times.`);
  await expectBuild(blockedPage, 'A');
  if ((await nameField.inputValue()) !== 'Draft preservado')
    throw new Error('The blocked document lost its recoverable draft.');
  if (
    (await safePage
      .getByText('Nova versão disponível', { exact: true })
      .count()) !== 0
  )
    throw new Error('The legacy update prompt was rendered.');

  await blockedPage.getByRole('button', { name: 'Cancelar' }).click();
  await expectBuild(blockedPage, 'B');

  process.stdout.write(
    'PWA validation passed: the cache stayed shell-only, offline preserved the route, and build B reloaded once after the draft became safe.\n',
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(temporaryRoot, { force: true, recursive: true });
}
