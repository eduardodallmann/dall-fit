import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

const uiDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const workspaceDirectory = path.dirname(uiDirectory);
const eslint = new ESLint({ cwd: workspaceDirectory });
const source =
  "import { Capacitor } from '@capacitor/core';\nvoid Capacitor;\n";

const [outsideBoundary] = await eslint.lintText(source, {
  filePath: path.join(uiDirectory, 'src/app.tsx'),
});
assert.ok(
  outsideBoundary.messages.some(
    ({ ruleId }) => ruleId === 'no-restricted-imports',
  ),
);

const [insideBoundary] = await eslint.lintText(source, {
  filePath: path.join(
    uiDirectory,
    'src/core/platform/native/capacitor-platform-adapter.ts',
  ),
});
assert.equal(
  insideBoundary.messages.filter(
    ({ ruleId }) => ruleId === 'no-restricted-imports',
  ).length,
  0,
);
