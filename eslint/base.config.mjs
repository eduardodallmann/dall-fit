import js from '@eslint/js';
import prettierPlugin from 'eslint-plugin-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export function baseConfig(rootDirectory) {
  return tseslint.config(
    {
      ignores: [
        '**/coverage/**',
        '**/dist/**',
        '**/node_modules/**',
        '**/.nitro/**',
        '**/.vercel/**',
        '**/.workflow-data/**',
        '**/.workflow-vitest/**',
        '.kilo/worktrees/**',
        '.kilocode/worktrees/**',
        'workflow/workflow/**',
        'ui/public/**',
        'ui/android/app/src/main/assets/**',
        'ui/android/**/build/**',
        'ui/android/capacitor-cordova-android-plugins/**',
      ],
    },
    {
      files: ['**/*.{js,mjs,cjs,ts,tsx}'],
      ...js.configs.recommended,
    },
    {
      files: ['**/*.{ts,tsx}'],
      extends: tseslint.configs.recommendedTypeChecked,
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: rootDirectory,
        },
      },
      plugins: {
        prettier: prettierPlugin,
        sonarjs,
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
          },
        ],
        curly: ['error', 'all'],
        'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
        'no-debugger': 'error',
        'no-nested-ternary': 'error',
        'object-shorthand': 'error',
        'prefer-const': 'error',
        'prettier/prettier': 'error',
        'sonarjs/cognitive-complexity': ['error', 15],
        'sonarjs/no-identical-functions': 'error',
      },
    },
    {
      files: ['*.{js,mjs,cjs}', '**/*.config.{js,mjs,cjs}', 'eslint/**/*.mjs'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: {
        globals: globals.node,
      },
    },
  );
}
