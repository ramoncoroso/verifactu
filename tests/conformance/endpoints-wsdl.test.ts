/**
 * Los endpoints y la `SOAPAction` se contrastan contra el WSDL oficial.
 *
 * Este fichero existe porque la demostración central de la auditoría seguía
 * siendo cierta después de construir la red de conformidad: **apuntar los
 * endpoints a `example.com` no rompía ningún test**. `schemas/SistemaFacturacion.wsdl`
 * está vendorizado y contiene la verdad; nadie la estaba mirando.
 *
 * Es el oráculo de VF-007 (issue #17).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_ENDPOINTS,
  SANDBOX_ENDPOINTS,
  SOAP_ACTIONS,
} from '../../src/client/endpoints.js';

const WSDL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas', 'SistemaFacturacion.wsdl'),
  'utf8'
);

/** `{ nombrePuerto: urlDelServicio }` leído del WSDL. */
function portAddresses(): Record<string, string> {
  const out: Record<string, string> = {};
  const re =
    /<wsdl:port name="([^"]+)"[^>]*>\s*<soap:address location="([^"]+)"/g;
  for (const m of WSDL.matchAll(re)) out[m[1]!] = m[2]!;
  return out;
}

/** Valores literales de `soapAction` declarados en el binding. */
function soapActions(): string[] {
  return [...WSDL.matchAll(/<soap:operation soapAction="([^"]*)"/g)].map((m) => m[1]!);
}

describe('El WSDL vendorizado dice lo que creemos', () => {
  // Control positivo: si el WSDL cambiara de forma, los tests de abajo darían
  // falsos verdes por comparar contra listas vacías.
  it('declara los cuatro puertos de Veri*Factu', () => {
    const ports = portAddresses();
    expect(Object.keys(ports)).toEqual(
      expect.arrayContaining([
        'SistemaVerifactu',
        'SistemaVerifactuSello',
        'SistemaVerifactuPruebas',
        'SistemaVerifactuSelloPruebas',
      ])
    );
  });

  it('declara las dos operaciones sobre el mismo binding', () => {
    expect(WSDL).toContain('name="RegFactuSistemaFacturacion"');
    expect(WSDL).toContain('name="ConsultaFactuSistemaFacturacion"');
  });

  it('declara soapAction vacía en todas las operaciones', () => {
    const actions = soapActions();
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a === '')).toBe(true);
  });
});

describe('endpoints.ts contra el WSDL · VF-007', () => {
  // VF-007: apunta a `.../SistemaFacturacion/SuministroLR`, que es del SII.
  it.fails('la URL de producción es la del WSDL [VF-007 abierto]', () => {
    expect(PRODUCTION_ENDPOINTS.alta).toBe(portAddresses()['SistemaVerifactu']);
  });

  it.fails('la URL de pruebas es la del WSDL [VF-007 abierto]', () => {
    expect(SANDBOX_ENDPOINTS.alta).toBe(portAddresses()['SistemaVerifactuPruebas']);
  });

  // No hay endpoint separado de consulta: las dos operaciones comparten puerto.
  it.fails('la consulta usa la misma URL que el suministro [VF-007 abierto]', () => {
    expect(SANDBOX_ENDPOINTS.consulta).toBe(SANDBOX_ENDPOINTS.alta);
  });

  // Ni de anulación: viaja como RegistroAnulacion dentro del mismo mensaje.
  it('la anulación ya usa la misma URL que el alta', () => {
    expect(SANDBOX_ENDPOINTS.anulacion).toBe(SANDBOX_ENDPOINTS.alta);
  });

  // VF-007: SOAP_ACTIONS declara operaciones del SII.
  it.fails('la SOAPAction del suministro es la cadena vacía [VF-007 abierto]', () => {
    expect(SOAP_ACTIONS.ALTA).toBe('');
  });

  // Documenta el estado actual de forma afirmativa. Al corregir VF-007 hay que
  // borrar este test, no actualizarlo.
  it('hoy los endpoints son los del SII [VF-007 abierto]', () => {
    expect(SANDBOX_ENDPOINTS.alta).toContain('/SuministroLR');
    expect(SANDBOX_ENDPOINTS.alta).not.toContain('VerifactuSOAP');
    expect(SOAP_ACTIONS.ALTA).toBe('SuministroLRFacturasEmitidas');
  });

  // Los hosts de sello no están modelados en absoluto.
  it.fails('existe el host de sello para pruebas [VF-007 abierto]', () => {
    const urls = Object.values({ ...PRODUCTION_ENDPOINTS, ...SANDBOX_ENDPOINTS });
    expect(urls.some((u) => u.includes('prewww10.aeat.es'))).toBe(true);
  });
});
