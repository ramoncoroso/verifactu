/**
 * Nivel 3 de la pirámide: el QR se verifica decodificándolo.
 *
 * El art. 21.1 de la OM HAC/1177/2024 exige ISO/IEC 18004:2015 con nivel M. La
 * única comprobación que verifica eso es que un lector lo lea.
 *
 * Los `it.fails` que documentaban VF-001 se retiraron al sustituir el motor de
 * codificación: ahora estos tests fijan el comportamiento correcto.
 */

import { describe, expect, it } from 'vitest';

import { generateQrCode, generateQrCodeFromUrl } from '../../src/qr/generator.js';
import { buildQrUrl, buildQrUrlFromParams } from '../../src/qr/url-builder.js';
import { QR_CONTROL_MATRIX, QR_CONTROL_URL } from '../fixtures/qr-control.js';
import { decodeAcrossConfigurations, decodeMatrix } from '../helpers/qr.js';

/** URL de cotejo conforme al §6: exactamente 4 parámetros. */
const URL_COTEJO = buildQrUrlFromParams(
  { nif: '89890001K', numserie: '12345678/G33', fecha: '01-01-2024', importe: '241.40' },
  'sandbox'
);

const FACTURA = {
  issuer: { taxId: { type: 'NIF', value: 'B12345678' }, name: 'Mi Empresa SL' },
  id: { series: 'FC', number: '0001', issueDate: new Date('2026-08-02T10:00:00Z') },
  totalAmount: 121,
  hash: 'A'.repeat(64),
} as unknown as Parameters<typeof generateQrCode>[0];

describe('Control positivo · el método de prueba funciona', () => {
  it('decodifica un QR correcto y devuelve exactamente su contenido', () => {
    expect(decodeMatrix(QR_CONTROL_MATRIX)).toBe(QR_CONTROL_URL);
  });

  it('lo decodifica en todas las escalas y zonas de silencio probadas', () => {
    for (const scale of [2, 4, 8]) {
      for (const quietZone of [2, 4]) {
        expect(decodeMatrix(QR_CONTROL_MATRIX, { scale, quietZone })).toBe(QR_CONTROL_URL);
      }
    }
  });
});

describe('El QR generado es legible', () => {
  it('decodifica exactamente a la URL de cotejo', () => {
    const r = generateQrCodeFromUrl(URL_COTEJO, { errorCorrection: 'M' });
    expect(decodeMatrix(r.modules)).toBe(URL_COTEJO);
  });

  it('decodifica en las veinte configuraciones de rasterizado', () => {
    const r = generateQrCodeFromUrl(URL_COTEJO, { errorCorrection: 'M' });
    for (const scale of [2, 3, 4, 6, 8]) {
      for (const quietZone of [0, 2, 4, 8]) {
        expect(decodeMatrix(r.modules, { scale, quietZone })).toBe(URL_COTEJO);
      }
    }
  });

  it('el QR de una factura decodifica a su propia URL', () => {
    const r = generateQrCode(FACTURA, 'sandbox');
    expect(decodeMatrix(r.modules)).toBe(buildQrUrl(FACTURA, 'sandbox'));
  });

  // El defecto anterior elegía la versión con tablas de capacidad de modo
  // ALFANUMÉRICO para datos que van en modo byte, así que se quedaba corta:
  // versión 5 donde hacen falta la 7.
  it('elige la versión que corresponde al modo byte', () => {
    const r = generateQrCodeFromUrl(URL_COTEJO, { errorCorrection: 'M' });
    expect(r.version).toBe(7);
    expect(r.modules.length).toBe(45); // (7-1)*4+21
  });

  it('el nivel de corrección por defecto es M, el que exige la norma', () => {
    expect(generateQrCodeFromUrl(URL_COTEJO).errorCorrection).toBe('M');
  });

  it('a mayor corrección de errores, mayor versión', () => {
    const l = generateQrCodeFromUrl(URL_COTEJO, { errorCorrection: 'L' }).version;
    const h = generateQrCodeFromUrl(URL_COTEJO, { errorCorrection: 'H' }).version;
    expect(h).toBeGreaterThan(l);
  });

  it('decodifica en el peor caso: numserie de 60 caracteres', () => {
    const url = buildQrUrlFromParams(
      {
        nif: 'B12345678',
        numserie: 'A'.repeat(60),
        fecha: '31-12-2026',
        importe: '999999999999.99',
      },
      'production'
    );
    const r = generateQrCodeFromUrl(url);
    expect(decodeMatrix(r.modules)).toBe(url);
    expect(r.version).toBeLessThanOrEqual(40);
  });

  it('decodifica con una serie que lleva espacios y barras', () => {
    const url = buildQrUrlFromParams(
      { nif: 'B12345678', numserie: 'FAC 2026/0042', fecha: '02-08-2026', importe: '121.00' },
      'production'
    );
    expect(decodeAcrossConfigurations(generateQrCodeFromUrl(url).modules).decoded).toBe(url);
  });
});

describe('El QR no lleva la huella · VF-013', () => {
  it('el contenido tiene exactamente los cuatro parámetros de la norma', () => {
    const decoded = decodeMatrix(generateQrCode(FACTURA, 'sandbox').modules);
    expect(decoded).not.toBeNull();
    const params = new URL(decoded!).searchParams;
    expect([...params.keys()]).toEqual(['nif', 'numserie', 'fecha', 'importe']);
    expect(decoded).not.toContain('huella');
  });
});
