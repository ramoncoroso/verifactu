// Configuración plana de ESLint.
//
// Sustituye a `.eslintrc.cjs`: ESLint 9 dejó de leer el formato antiguo por
// defecto y el 10 lo retiró del todo. La equivalencia es uno a uno, y las dos
// únicas relajaciones que había para los tests siguen ahí con su motivo escrito.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.js', '*.config.ts'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // `tsconfig.test.json` cubre `src` y `tests`; el principal excluye los tests.
        project: ['./tsconfig.json', './tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      'no-useless-escape': 'off',
      'no-console': 'warn',
    },
  },

  {
    // Dos reglas, y solo dos, se relajan en los tests. Cada una con su motivo:
    // las demás siguen en vigor, incluida `no-explicit-any`, que es la que
    // permitía que un test fijara un valor que la norma no admite.
    files: ['tests/**/*.ts'],
    rules: {
      // `expect(mock.write).toHaveBeenCalledWith(...)` referencia el método sin
      // ligarlo, que es exactamente lo que hay que hacer para inspeccionarlo.
      // La regla está pensada para código que lo invocaría después.
      '@typescript-eslint/unbound-method': 'off',
      // Los dobles de `soapClient.send` deben devolver una promesa porque eso
      // es lo que devuelve el original; que su cuerpo no tenga `await` es la
      // consecuencia de ser un doble, no un descuido.
      '@typescript-eslint/require-await': 'off',
    },
  }
);
