/**
 * El parseo de respuestas se verifica contra respuestas validadas por el XSD.
 *
 * Es el oráculo de VF-023 (issue #33), que es el bloqueante más grave: el parser
 * busca `RespuestaRegFactura`, elemento que no existe en ningún esquema de la
 * AEAT, de modo que **toda respuesta real lanza `AeatError` aunque el registro
 * haya sido aceptado**. Los 28 tests de `verifactu-client.test.ts` no lo ven
 * porque alimentan un formato inventado.
 *
 * Cada respuesta se valida primero contra `RespuestaSuministro.xsd` y solo
 * después se le pasa al parser, para que el fixture no pueda derivar.
 */

import { describe, expect, it } from 'vitest';

import { parseXml } from '../../src/xml/parser.js';
import { VerifactuClient } from '../../src/client/verifactu-client.js';
import type { SoftwareInfo } from '../../src/models/party.js';
import { buildRespuestaSuministro, wrapSoapResponse } from '../fixtures/aeat-respuesta.js';
import { formatXsdErrors, validateRespuestaSuministro } from '../helpers/xsd.js';

const SOFTWARE: SoftwareInfo = {
  name: 'verifactu-ts',
  developerTaxId: 'B99999999',
  version: '1.0.0',
  installationNumber: '001',
  systemType: 'S',
};

function makeClient(): VerifactuClient {
  return new VerifactuClient({
    environment: 'sandbox',
    certificate: { type: 'pfx', data: Buffer.from('certificado-de-prueba'), password: 'x' },
    software: SOFTWARE,
  });
}

/** Invoca el parser real sobre el sobre SOAP, como haría el cliente. */
function parseAlta(respuesta: string): unknown {
  const xml = parseXml(wrapSoapResponse(respuesta));
  return (
    makeClient() as unknown as { parseAltaResponse(x: unknown, i: unknown): unknown }
  ).parseAltaResponse(xml, { hash: 'A'.repeat(64) });
}

describe('El fixture de respuesta es conforme', () => {
  // Control positivo: si el fixture no validara, los `it.fails` de abajo podrían
  // estar fallando por un fixture mal construido y no por el parser.
  it.each([
    ['aceptada', buildRespuestaSuministro()],
    [
      'aceptada con errores',
      buildRespuestaSuministro({
        estadoEnvio: 'ParcialmenteCorrecto',
        lineas: [{ estadoRegistro: 'AceptadoConErrores', codigoError: 2000 }],
      }),
    ],
    [
      'rechazada',
      buildRespuestaSuministro({
        estadoEnvio: 'Incorrecto',
        lineas: [{ estadoRegistro: 'Incorrecto', codigoError: 1103 }],
      }),
    ],
  ])('%s valida contra RespuestaSuministro.xsd', (_caso, xml) => {
    const result = validateRespuestaSuministro(xml);
    expect(result.valid, formatXsdErrors(result)).toBe(true);
  });

  it('el estado «Rechazado» que declara el tipo del cliente no existe en el XSD', () => {
    // `SubmitInvoiceResponse.state` declara 'Rechazado'; el enumerado real es
    // Correcto | AceptadoConErrores | Incorrecto. Ver issue #33.
    const xml = buildRespuestaSuministro({
      lineas: [{ estadoRegistro: 'Incorrecto' }],
    }).replace('<sfR:EstadoRegistro>Incorrecto<', '<sfR:EstadoRegistro>Rechazado<');
    expect(validateRespuestaSuministro(xml).valid).toBe(false);
  });
});

describe('parseAltaResponse contra una respuesta real · VF-023', () => {
  // VF-023: busca `RespuestaRegFactura`, que no existe.
  it.fails('no lanza ante una respuesta aceptada [VF-023 abierto]', () => {
    expect(() => parseAlta(buildRespuestaSuministro())).not.toThrow();
  });

  it.fails('lee el estado de la respuesta [VF-023 abierto]', () => {
    const r = parseAlta(buildRespuestaSuministro()) as { state: string };
    expect(r.state).toBe('Correcto');
  });

  it.fails('lee el CSV del envío [VF-023 abierto]', () => {
    const r = parseAlta(buildRespuestaSuministro()) as { csv?: string };
    expect(r.csv).toBe('A-B4CD5EF6GH7IJ8K');
  });

  // VF-012: TiempoEsperaEnvio y EstadoEnvio son obligatorios en toda respuesta y
  // gobiernan el control de flujo. Hoy no se leen — `grep` sobre src/ no los
  // encuentra. Sin ellos no se puede implementar el pacer ni el envío por lotes.
  it.fails('expone TiempoEsperaEnvio [VF-012 abierto]', () => {
    const r = parseAlta(buildRespuestaSuministro({ tiempoEsperaEnvio: '120' })) as Record<
      string,
      unknown
    >;
    expect(r).toHaveProperty('tiempoEsperaEnvioSeconds', 120);
  });

  it.fails('expone EstadoEnvio [VF-012 abierto]', () => {
    const r = parseAlta(
      buildRespuestaSuministro({
        estadoEnvio: 'ParcialmenteCorrecto',
        lineas: [{ estadoRegistro: 'AceptadoConErrores', codigoError: 2000 }],
      })
    ) as Record<string, unknown>;
    expect(r).toHaveProperty('estadoEnvio', 'ParcialmenteCorrecto');
  });

  // Documenta el estado actual de forma afirmativa: qué error concreto emerge.
  // Al corregir VF-023 hay que borrar este test, no actualizarlo.
  it('hoy lanza AeatError incluso con el registro aceptado [VF-023 abierto]', () => {
    expect(() => parseAlta(buildRespuestaSuministro())).toThrowError(
      /missing RespuestaRegFactura/
    );
  });
});
