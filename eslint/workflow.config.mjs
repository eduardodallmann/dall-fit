import globals from 'globals';

export function workflowConfig() {
  return [
    {
      files: ['workflow/**/*.ts'],
      languageOptions: {
        globals: globals.node,
        sourceType: 'module',
      },
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-unsafe-argument': 'error',
      },
    },
  ];
}
