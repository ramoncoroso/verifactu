/**
 * Superficie de dependencias del paquete publicado.
 *
 * La librería tuvo cero dependencias de runtime hasta que el código QR obligó a
 * tener una: el art. 21.1 de la OM HAC/1177/2024 exige ISO/IEC 18004:2015, y la
 * implementación propia no lo cumplía —su salida no la decodificaba ningún
 * lector—. Se eligió `qrcode-generator` por ser el único candidato con **cero
 * dependencias transitivas**.
 *
 * Este test convierte esa promesa en algo aplicado en vez de una frase del README.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = (p: string): { dependencies?: Record<string, string> } =>
  JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as { dependencies?: Record<string, string> };

describe('Dependencias de runtime', () => {
  it('son exactamente una', () => {
    expect(Object.keys(pkg('package.json').dependencies ?? {})).toEqual(['qrcode-generator']);
  });

  it('esa una no arrastra ninguna transitiva', () => {
    expect(
      Object.keys(pkg('node_modules/qrcode-generator/package.json').dependencies ?? {})
    ).toEqual([]);
  });
});
