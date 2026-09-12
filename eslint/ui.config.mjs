import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export function uiConfig() {
  return [
    {
      files: ['ui/src/**/*.{ts,tsx}'],
      languageOptions: {
        globals: globals.browser,
      },
      plugins: {
        react,
        'react-hooks': reactHooks,
        'react-refresh': reactRefresh,
      },
      settings: {
        react: { version: 'detect' },
      },
      rules: {
        ...reactHooks.configs.flat.recommended.rules,
        ...reactRefresh.configs.vite.rules,
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@capacitor/*'],
                message:
                  'Import Capacitor packages only from ui/src/core/platform/native/. Consume the public platform contract elsewhere.',
              },
            ],
          },
        ],
        'react/jsx-boolean-value': 'error',
        'react/no-children-prop': 'error',
        'react/self-closing-comp': 'error',
      },
    },
    {
      files: ['ui/src/core/platform/native/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ];
}
