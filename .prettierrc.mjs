/** @type {import('prettier').Config} */
export default {
  plugins: ['@ianvs/prettier-plugin-sort-imports'],
  singleQuote: true,
  trailingComma: 'all',
  importOrder: [
    '^react$',
    '^react-dom',
    '',
    '<THIRD_PARTY_MODULES>',
    '',
    '^@dall-fit/(.*)$',
    '',
    '^~/(.*)$',
    '',
    '^[./]',
  ],
  importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
  importOrderTypeScriptVersion: '6.0.0',
};
