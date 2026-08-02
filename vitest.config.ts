import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Zona horaria fija. NO es cosmético:
    //
    // Los vectores oficiales de la huella (tests/conformance/huella-vectores.test.ts)
    // llevan `FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00`. El código formatea
    // ese instante con la zona del PROCESO, así que en UTC —que es donde corre
    // `ubuntu-latest`— saldría `2024-01-01T18:20:30+00:00` y el digest no coincidiría.
    // Sin fijarla, una implementación CORRECTA de la fase 1 dejaría los vectores en
    // rojo, y el `it.fails` no distinguiría ese fallo del defecto que documenta.
    //
    // Esto hace la suite determinista, no arregla el defecto de fondo: las fechas
    // siguen dependiendo de la zona del proceso (issue #38). La corrección real es
    // que el formateador reciba una zona IANA explícita; cuando exista, esta línea
    // deja de hacer falta y los tests pasan a ser independientes del entorno.
    env: { TZ: 'Europe/Madrid' },
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
