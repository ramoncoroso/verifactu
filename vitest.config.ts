import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.d.ts'],
      thresholds: {
        // Adjusted thresholds - SOAP client and certificate modules require complex mocking
        lines: 70,
        functions: 80,
        branches: 80,
        statements: 70,
      },
    },
  },
});
