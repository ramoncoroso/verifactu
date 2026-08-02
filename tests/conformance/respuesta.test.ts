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
 *
 * Los `it.fails` que documentaban VF-023 se retiraron al corregirlo.
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

});

describe('parseAltaResponse contra una respuesta real', () => {
  it('no lanza ante una respuesta aceptada', () => {
    expect(() => parseAlta(buildRespuestaSuministro())).not.toThrow();
  });

  it('lee el estado, el CSV y el sello temporal', () => {
    const r = parseAlta(buildRespuestaSuministro()) as {
      accepted: boolean;
      state: string;
      csv?: string;
      timestampPresentacion?: Date;
    };
    expect(r.accepted).toBe(true);
    expect(r.state).toBe('Correcto');
    expect(r.csv).toBe('A-B4CD5EF6GH7IJ8K');
    expect(r.timestampPresentacion?.toISOString()).toBe('2026-08-02T12:00:00.000Z');
  });

  // Art. 16.2: la AEAT devuelve el tiempo de espera «que deberá ser tenido en
  // cuenta para el siguiente envío». Sin leerlo no se puede implementar el
  // control de flujo (#22).
  it('expone TiempoEsperaEnvio y EstadoEnvio', () => {
    const r = parseAlta(
      buildRespuestaSuministro({ tiempoEsperaEnvio: '120', estadoEnvio: 'Correcto' })
    ) as Record<string, unknown>;
    expect(r['tiempoEsperaEnvioSeconds']).toBe(120);
    expect(r['estadoEnvio']).toBe('Correcto');
  });

  it('si TiempoEsperaEnvio viene vacío, usa los 60 segundos de la norma', () => {
    const r = parseAlta(buildRespuestaSuministro({ tiempoEsperaEnvio: '' })) as Record<
      string,
      unknown
    >;
    expect(r['tiempoEsperaEnvioSeconds']).toBe(60);
  });

  it('un registro aceptado con errores cuenta como aceptado, y expone el código', () => {
    const r = parseAlta(
      buildRespuestaSuministro({
        estadoEnvio: 'ParcialmenteCorrecto',
        lineas: [
          {
            estadoRegistro: 'AceptadoConErrores',
            codigoError: 2000,
            descripcionError: 'El cálculo de la huella suministrada es incorrecta.',
          },
        ],
      })
    ) as { accepted: boolean; state: string; errorCode?: string; errorDescription?: string };
    // «AceptadoConErrores» SÍ se registra: tiene errores que no provocan rechazo.
    expect(r.accepted).toBe(true);
    expect(r.state).toBe('AceptadoConErrores');
    expect(r.errorCode).toBe('2000');
    expect(r.errorDescription).toContain('huella');
  });

  it('un registro rechazado no cuenta como aceptado', () => {
    const r = parseAlta(
      buildRespuestaSuministro({
        estadoEnvio: 'Incorrecto',
        lineas: [{ estadoRegistro: 'Incorrecto', codigoError: 1103 }],
      })
    ) as { accepted: boolean; state: string };
    expect(r.accepted).toBe(false);
    // «Incorrecto», no «Rechazado»: ese valor no existe en el enumerado.
    expect(r.state).toBe('Incorrecto');
  });
});

describe('Semántica que no es obvia', () => {
  // Trampa de la lista L18: «ParcialmenteCorrecto» no implica que haya registros
  // rechazados; basta uno «AceptadoConErrores». EstadoEnvio no sirve para decidir
  // nada por registro.
  it('ParcialmenteCorrecto no implica rechazo', () => {
    const r = parseAlta(
      buildRespuestaSuministro({
        estadoEnvio: 'ParcialmenteCorrecto',
        lineas: [{ estadoRegistro: 'AceptadoConErrores', codigoError: 2000 }],
      })
    ) as { accepted: boolean; estadoEnvio: string };
    expect(r.estadoEnvio).toBe('ParcialmenteCorrecto');
    expect(r.accepted).toBe(true);
  });

  it('el estado «Rechazado» no existe en el enumerado del XSD', () => {
    const xml = buildRespuestaSuministro({
      lineas: [{ estadoRegistro: 'Incorrecto' }],
    }).replace('<sfR:EstadoRegistro>Incorrecto<', '<sfR:EstadoRegistro>Rechazado<');
    expect(validateRespuestaSuministro(xml).valid).toBe(false);
  });
});
