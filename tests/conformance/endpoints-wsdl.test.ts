/**
 * Los endpoints y la `SOAPAction` se contrastan contra el WSDL oficial.
 *
 * Este fichero existe porque la demostración central de la auditoría seguía
 * siendo cierta después de construir la red de conformidad: **apuntar los
 * endpoints a `example.com` no rompía ningún test**. `schemas/SistemaFacturacion.wsdl`
 * está vendorizado y contiene la verdad; nadie la estaba mirando.
 *
 * Es el oráculo de VF-007 (issue #17), ya cerrado: este fichero pasó de
 * documentar el defecto con `it.fails` a fijar el comportamiento correcto.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  getEndpoints,
  getServiceUrl,
  INITIAL_WAIT_SECONDS,
  MAX_RECORDS_PER_SUBMISSION,
  SOAP_ACTION_HEADER,
  SOAP_ACTIONS,
  SOAP_OPERATIONS,
  VERIFACTU_SERVICE_URLS,
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

describe('endpoints.ts contra el WSDL', () => {
  it('la URL de producción es la del WSDL', () => {
    expect(getServiceUrl('production')).toBe(portAddresses()['SistemaVerifactu']);
  });

  it('la URL de pruebas es la del WSDL', () => {
    expect(getServiceUrl('sandbox')).toBe(portAddresses()['SistemaVerifactuPruebas']);
  });

  it('la URL de sello de producción es la del WSDL', () => {
    expect(getServiceUrl('production', 'seal')).toBe(portAddresses()['SistemaVerifactuSello']);
  });

  it('la URL de sello de pruebas es la del WSDL', () => {
    expect(getServiceUrl('sandbox', 'seal')).toBe(portAddresses()['SistemaVerifactuSelloPruebas']);
  });

  it('el sello cambia de host, no de ruta', () => {
    const repr = new URL(getServiceUrl('sandbox'));
    const seal = new URL(getServiceUrl('sandbox', 'seal'));
    expect(seal.pathname).toBe(repr.pathname);
    expect(seal.host).not.toBe(repr.host);
  });

  // No hay endpoint separado de consulta ni de anulación: las dos operaciones
  // comparten binding y puerto, y la anulación viaja como RegistroAnulacion
  // dentro del mismo mensaje de alta.
  it('alta, anulación y consulta comparten URL', () => {
    for (const env of ['production', 'sandbox'] as const) {
      const e = getEndpoints(env);
      expect(e.anulacion).toBe(e.alta);
      expect(e.consulta).toBe(e.alta);
      expect(e.alta).toBe(getServiceUrl(env));
    }
  });

  // El WSDL declara soapAction="" y SOAP 1.1 exige que la cabecera esté presente
  // con su valor entrecomillado. Son dos hechos distintos: el valor DECLARADO es
  // la cadena vacía; el valor que viaja en la CABECERA es la cadena de dos
  // comillas. La versión anterior de este test los confundía.
  it('el WSDL declara soapAction vacía y la cabecera lleva la cadena entrecomillada', () => {
    expect(soapActions().every((a) => a === '')).toBe(true);
    expect(SOAP_ACTION_HEADER).toBe('""');
    expect(SOAP_ACTIONS.ALTA).toBe(SOAP_ACTION_HEADER);
    expect(SOAP_ACTIONS.ANULACION).toBe(SOAP_ACTION_HEADER);
    expect(SOAP_ACTIONS.CONSULTA).toBe(SOAP_ACTION_HEADER);
  });

  it('ya no queda ninguna ruta del SII', () => {
    const urls = Object.values(VERIFACTU_SERVICE_URLS).flatMap((e) => Object.values(e));
    expect(urls).toHaveLength(4);
    for (const u of urls) {
      expect(u).toContain('/SistemaFacturacion/VerifactuSOAP');
      expect(u).not.toContain('SuministroLR');
      expect(u).not.toContain('ConsultaLR');
    }
  });

  // Los nombres de operación del WSDL no son valores de SOAPAction: son el
  // elemento raíz del cuerpo. Confundirlos es lo que produjo VF-007.
  it('los nombres de operación coinciden con los del WSDL', () => {
    expect(WSDL).toContain(`name="${SOAP_OPERATIONS.SUMINISTRO}"`);
    expect(WSDL).toContain(`name="${SOAP_OPERATIONS.CONSULTA}"`);
  });

  // Constantes que salen del XSD y de la orden ministerial, y que hacen falta
  // para el control de flujo y el envío por lotes (issues #22 y #36).
  it('el máximo por envío es el del XSD', () => {
    const xsd = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas', 'SuministroLR.xsd'),
      'utf8'
    );
    expect(xsd).toContain(`maxOccurs="${MAX_RECORDS_PER_SUBMISSION}"`);
    expect(INITIAL_WAIT_SECONDS).toBe(60);
  });
});
