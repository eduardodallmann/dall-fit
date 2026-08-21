import path from 'node:path';
import { fileURLToPath } from 'node:url';

import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

import { apiConfig } from './eslint/api.config.mjs';
import { baseConfig } from './eslint/base.config.mjs';
import { uiConfig } from './eslint/ui.config.mjs';
import { workflowConfig } from './eslint/workflow.config.mjs';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  ...baseConfig(rootDirectory),
  ...apiConfig(),
  ...workflowConfig(),
  ...uiConfig(),
  prettier,
);
