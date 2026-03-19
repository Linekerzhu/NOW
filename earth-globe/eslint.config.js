import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        cancelAnimationFrame: 'readonly',
        requestAnimationFrame: 'readonly',
        devicePixelRatio: 'readonly',
        innerWidth: 'readonly',
        innerHeight: 'readonly',
        performance: 'readonly',
        fetch: 'readonly',
        Image: 'readonly',
        createImageBitmap: 'readonly',
        HTMLCanvasElement: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
];
