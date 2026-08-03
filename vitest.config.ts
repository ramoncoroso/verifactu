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
        // Rebaseados al subir a `@vitest/coverage-v8` 4. **No hubo regresión**:
        // el diff de `src/` en ese cambio fueron ocho líneas, y sin embargo
        // `lines` SUBIÓ (93,49 → 94,64) mientras `branches` bajó (89,55 →
        // 84,55). Movimiento en direcciones opuestas a la vez solo lo explica
        // una medición distinta: la v4 cuenta como rama cosas que la v3 no
        // —encadenamiento opcional, `??`, parámetros por defecto—.
        //
        // Se fijan a lo medido menos ~2 puntos. Y siguen sin ser la garantía de
        // nada: la cobertura mide EJECUCIÓN, no conformidad. El 94 % convivía
        // con siete defectos bloqueantes. Quien vigila la conformidad es
        // `tests/conformance/`.
        lines: 92,
        functions: 92,
        branches: 82,
        statements: 91,
      },
    },
  },
});
