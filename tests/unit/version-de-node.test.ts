/**
 * La versión mínima de Node es una sola, y se dice en cuatro sitios.
 *
 * `package.json` la promete, el CI la prueba y los dos README la anuncian. Si
 * divergen, alguno miente: o se promete soporte a una versión que nadie ejecuta,
 * o se prueba una que la librería ya no admite.
 *
 * No es hipotético. La suite llegó a probarse en Node 18 mientras vitest 4
 * exigía `^20 || ^22 || >=24`; lo cazó el CI, no un test. Esto lo convierte en
 * algo que se comprueba antes de llegar allí.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const leer = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

const pkg = JSON.parse(leer('package.json')) as {
  engines: { node: string };
  devDependencies: Record<string, string>;
};
const ci = leer('.github/workflows/ci.yml');
const READMES = [
  ['README.md', leer('README.md')],
  ['README.en.md', leer('README.en.md')],
] as const;

/** Mínimo que declara `engines`, p. ej. `>=20.0.0` → 20. */
const MINIMO = Number(/(\d+)/.exec(pkg.engines.node)?.[1]);

describe('El mínimo declarado', () => {
  it('está en engines y es un número', () => {
    expect(Number.isInteger(MINIMO)).toBe(true);
    expect(MINIMO).toBeGreaterThanOrEqual(20);
  });

  it('no promete una versión que la herramienta de tests ya no admite', () => {
    // vitest 4 declara `^20.0.0 || ^22.0.0 || >=24.0.0`. Prometer `>=18`
    // significaría que Node 18 no se prueba nunca.
    const vitest = pkg.devDependencies['vitest'] ?? '';
    const mayor = Number(/(\d+)/.exec(vitest)?.[1]);
    if (mayor >= 4) expect(MINIMO).toBeGreaterThanOrEqual(20);
  });
});

describe('La matriz del CI', () => {
  const matriz = (/node-version: \[([^\]]+)\]/.exec(ci)?.[1] ?? '')
    .split(',')
    .map((v) => Number(v.replace(/['"\s]/g, '')))
    .filter((v) => Number.isInteger(v));

  it('prueba varias versiones', () => {
    expect(matriz.length).toBeGreaterThanOrEqual(2);
  });

  it('empieza justo en el mínimo prometido', () => {
    // Si empezara por encima, el mínimo sería una promesa sin verificar.
    expect(Math.min(...matriz)).toBe(MINIMO);
  });

  it('no prueba ninguna versión por debajo del mínimo', () => {
    expect(matriz.every((v) => v >= MINIMO)).toBe(true);
  });
});

describe('Los README', () => {
  it.each(READMES)('%s anuncia el mismo mínimo en su texto', (_f, readme) => {
    expect(readme).toMatch(new RegExp(`Node\\.js ≥ ${MINIMO}`));
  });

  it.each(READMES)('%s lleva el mismo mínimo en su distintivo', (_f, readme) => {
    expect(readme).toContain(`Node.js-%3E%3D${MINIMO}-green`);
  });
});
