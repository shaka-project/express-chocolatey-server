/*! @license
 * Express Chocolatey Server
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const js = require('@eslint/js');
const stylistic = require('@stylistic/eslint-plugin');
const globals = require('globals');
const {defineConfig} = require('eslint/config');

module.exports = defineConfig([
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 'latest',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      js,
      '@stylistic': stylistic,
    },
    extends: [js.configs.recommended],
    rules: {
      // Correctness and safety, beyond the recommended defaults.
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': ['error', {destructuring: 'all'}],
      'no-unused-vars': 'error',
      'curly': ['error', 'all'],

      // Strict formatting, tuned to match the existing code style.
      // The indent options preserve Google-style +4 continuation indents
      // (wrapped call arguments and member chains) rather than reformatting.
      '@stylistic/indent': ['error', 2, {
        CallExpression: {arguments: 2},
        FunctionDeclaration: {body: 1, parameters: 2},
        FunctionExpression: {body: 1, parameters: 2},
        MemberExpression: 2,
        ObjectExpression: 1,
        SwitchCase: 1,
        ignoredNodes: ['ConditionalExpression'],
      }],
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/object-curly-spacing': ['error', 'never'],
      '@stylistic/space-before-function-paren': ['error', {
        anonymous: 'never',
        named: 'never',
        asyncArrow: 'always',
      }],
      '@stylistic/space-infix-ops': 'error',
      '@stylistic/keyword-spacing': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/max-len': ['error', {code: 80, ignoreUrls: true}],
    },
  },
]);
