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
        // Ajustados a la cobertura real (93,5 / 89,6 / 96,8) menos un margen de
        // 2 puntos. Los anteriores —70/80/80/70— estaban veinticuatro puntos por
        // debajo del estado del repositorio, así que se podía borrar un módulo
        // entero de tests sin que la puerta se enterara.
        //
        // Ojo con lo que significan: la cobertura mide EJECUCIÓN, no
        // conformidad. El 94 % convivía con siete defectos bloqueantes porque
        // el oráculo de cada test era la propia implementación. Quien de verdad
        // vigila la conformidad es `tests/conformance/`, no este número.
        lines: 91,
        functions: 94,
        branches: 87,
        statements: 91,
      },
    },
  },
});
