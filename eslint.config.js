import js from '@eslint/js'
import ts from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import svelteConfig from './svelte.config.js'

export default ts.config(
  { ignores: ['out/**', 'release/**', 'node_modules/**', '*.min.js'] },

  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  ...svelte.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte']
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/consistent-type-imports': 'error',

      // The whole point of the v2 content-script contract. `setInterval` on the
      // SoundCloud origin is what four of v0.7.x's worst behaviours had in common.
      'no-restricted-globals': [
        'error',
        {
          name: 'setInterval',
          message:
            'No polling in preload/content code. Use MutationObserver or addEventListener — ' +
            'see the plugin contract in the vault note, §4 rule 3.'
        }
      ]
    }
  },

  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    languageOptions: { globals: { ...globals.node } }
  },

  {
    files: ['src/renderer/**/*.{ts,svelte}'],
    languageOptions: { globals: { ...globals.browser } }
  },

  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: ts.parser, svelteConfig }
    }
  },

  {
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' }
  },

  // Plain .js config and build scripts are not part of any tsconfig project, so the
  // type-aware parser must be turned off for them rather than asked to find a project.
  {
    files: ['**/*.js'],
    ...ts.configs.disableTypeChecked,
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: false, project: false }
    }
  }
)
