module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    // tsconfig.test.json cubre src y tests; el principal excluye los tests
    project: ['./tsconfig.json', './tsconfig.test.json'],
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  rules: {
    '@typescript-eslint/explicit-function-return-type': ['error', {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
      allowHigherOrderFunctions: true,
    }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/strict-boolean-expressions': 'off',
    '@typescript-eslint/no-redundant-type-constituents': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    'no-useless-escape': 'off',
    'no-console': 'warn',
  },
  overrides: [
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
    },
  ],
  ignorePatterns: ['dist', 'node_modules', '*.config.ts', '*.config.js', '.eslintrc.cjs'],
};
