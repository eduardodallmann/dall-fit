import globals from 'globals';

export function apiConfig() {
  return [
    {
      files: ['api/**/*.ts'],
      languageOptions: {
        globals: globals.node,
        sourceType: 'commonjs',
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-unsafe-argument': 'error',
      },
    },
  ];
}
