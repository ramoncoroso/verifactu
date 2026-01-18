/**
 * Commitlint configuration
 *
 * Enforces conventional commit format:
 * <type>(<scope>): <description>
 *
 * Types: feat, fix, docs, chore, refactor, test, style, perf, ci, build
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Type must be one of the conventional types
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature (MINOR version)
        'fix',      // Bug fix (PATCH version)
        'docs',     // Documentation only
        'chore',    // Maintenance tasks
        'refactor', // Code refactoring
        'test',     // Adding/updating tests
        'style',    // Code style changes
        'perf',     // Performance improvements
        'ci',       // CI/CD changes
        'build',    // Build system changes
      ],
    ],
    // Subject must not be empty
    'subject-empty': [2, 'never'],
    // Type must not be empty
    'type-empty': [2, 'never'],
    // Subject max length
    'subject-max-length': [2, 'always', 100],
  },
};
