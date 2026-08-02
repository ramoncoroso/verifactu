/**
 * Las URI de espacio de nombres se contrastan contra el `targetNamespace` de los
 * XSD vendorizados.
 *
 * Existe porque `Namespaces.SUM` contenía `SusministroLR.xsd` —con una `s` de
 * más— y el test que lo cubría comprobaba `toContain('agenciatributaria.gob.es')`,
 * que la dejaba pasar. Una URI de namespace es una cadena opaca: o coincide
 * exactamente con el `targetNamespace` del esquema o el documento no valida, así
 * que la única comprobación válida es la igualdad.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { Namespaces, NsPrefix } from '../../src/xml/namespaces.js';

const SCHEMAS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas');

function targetNamespace(file: string): string {
  const xsd = readFileSync(join(SCHEMAS, file), 'utf8');
  const m = /targetNamespace="([^"]+)"/.exec(xsd);
  if (!m?.[1]) throw new Error(`Sin targetNamespace en ${file}`);
  return m[1];
}

describe('Namespaces contra el targetNamespace de los XSD', () => {
  it('SUM coincide con SuministroLR.xsd', () => {
    expect(Namespaces.SUM).toBe(targetNamespace('SuministroLR.xsd'));
  });

  it('SUM_INFO coincide con SuministroInformacion.xsd', () => {
    expect(Namespaces.SUM_INFO).toBe(targetNamespace('SuministroInformacion.xsd'));
  });

  it('DS coincide con el de la firma XML', () => {
    expect(Namespaces.DS).toBe(targetNamespace('xmldsig-core-schema.xsd'));
  });

  // La ruta de descarga es `tikeV1.0` y la del namespace es `tike`. No coinciden,
  // y es lo esperado: nadie debe "corregirlo".
  it('la URI usa la ruta `tike`, no `tikeV1.0`', () => {
    expect(Namespaces.SUM).toContain('/aeat/tike/cont/ws/');
    expect(Namespaces.SUM).not.toContain('tikeV1.0');
  });

  it('SUM y SUM_INFO son distintos', () => {
    // Unirlos en uno solo es exactamente el defecto de VF-006(g).
    expect(Namespaces.SUM).not.toBe(Namespaces.SUM_INFO);
  });

  it('los prefijos son los que usan los ejemplos de la AEAT', () => {
    expect(NsPrefix.SUM).toBe('sfLR');
    expect(NsPrefix.SUM_INFO).toBe('sf');
  });
});
