/**
 * URL de cotejo.
 *
 * La conformidad con la especificación se comprueba en
 * `tests/conformance/qr-decode.test.ts`. Aquí van los casos de borde de la
 * construcción y la validación.
 */

import { describe, expect, it } from 'vitest';

import {
  assertValidQrParams,
  buildQrUrl,
  buildQrUrlFromParams,
  buildQrUrlParams,
  validateQrParams,
  type QrUrlParams,
} from '../../src/qr/url-builder.js';

const VALIDOS: QrUrlParams = {
  nif: 'B12345678',
  numserie: 'FC0001',
  fecha: '02-08-2026',
  importe: '121.00',
};

const FACTURA = {
  issuer: { taxId: { type: 'NIF', value: 'B12345678' }, name: 'Mi Empresa SL' },
  id: { series: 'FC', number: '0001', issueDate: new Date('2026-08-02T10:00:00Z') },
  totalAmount: 121,
  hash: 'A'.repeat(64),
} as unknown as Parameters<typeof buildQrUrlParams>[0];

describe('buildQrUrlParams', () => {
  it('produce los cuatro parámetros, y solo esos', () => {
    expect(buildQrUrlParams(FACTURA)).toEqual({
      nif: 'B12345678',
      numserie: 'FC0001',
      fecha: '02-08-2026',
      importe: '121.00',
    });
  });
});

describe('buildQrUrlFromParams', () => {
  it('usa la URL del entorno', () => {
    expect(buildQrUrlFromParams(VALIDOS, 'production')).toContain(
      'www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?'
    );
    expect(buildQrUrlFromParams(VALIDOS, 'sandbox')).toContain('prewww2.aeat.es');
  });

  // §5.2: los sistemas que no emiten facturas verificables usan otro servicio.
  it('usa ValidarQRNoVerifactu para sistemas no verificables', () => {
    const url = buildQrUrlFromParams(VALIDOS, 'sandbox', 'no-verifactu');
    expect(url).toContain('/ValidarQRNoVerifactu?');
  });

  // El §4.1 de la especificación adjunta la implementación de referencia de la
  // AEAT, `java.net.URLEncoder.encode`, que codifica el espacio como `+`. Estos
  // valores se contrastaron contra una JVM real.
  it.each([
    ['FC-2026/0042', 'FC-2026%2F0042', 'barra'],
    ['FAC 2026 0042', 'FAC+2026+0042', 'espacios → "+", no %20'],
    ['A&B/2026', 'A%26B%2F2026', 'ampersand'],
    ['SERIE?X=1', 'SERIE%3FX%3D1', 'interrogación e igual'],
    ['A+B', 'A%2BB', 'un "+" literal va como %2B'],
    ['100%FAC', '100%25FAC', 'porcentaje'],
    ["O'BRIEN-01", 'O%27BRIEN-01', 'apóstrofo'],
    ['F(2026)', 'F%282026%29', 'paréntesis'],
    ['A~B', 'A%7EB', 'tilde'],
    ['S*01', 'S*01', 'asterisco NO se codifica'],
    ['A.B_C-D', 'A.B_C-D', 'punto, guion bajo y guion no se codifican'],
  ])('numserie %s → %s (%s)', (numserie, esperado) => {
    const url = buildQrUrlFromParams({ ...VALIDOS, numserie }, 'production');
    expect(url).toContain(`numserie=${esperado}`);
    // Ida y vuelta: el valor debe recuperarse intacto.
    expect(new URL(url).searchParams.get('numserie')).toBe(numserie);
  });

  it('valida antes de construir', () => {
    expect(() => buildQrUrlFromParams({ ...VALIDOS, nif: 'B123' })).toThrow();
  });
});

describe('validateQrParams', () => {
  it('acepta un juego válido', () => {
    expect(validateQrParams(VALIDOS)).toEqual({ valid: true, errors: [] });
  });

  // §4: «las cadenas de texto solo pueden contener caracteres ASCII con códigos
  // del 32 al 126». §10 lo tipifica como error 2003.
  it.each([
    ['SERIE-Ñ', 'eñe'],
    ['CAFÉ-01', 'vocal acentuada'],
    ['A€1', 'euro'],
    ['A\tB', 'tabulador'],
    ['A\nB', 'salto de línea'],
  ])('rechaza numserie %s (%s) con el código 2003', (numserie) => {
    const r = validateQrParams({ ...VALIDOS, numserie });
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toContain('2003');
  });

  it('rechaza numserie vacío y de más de 60 caracteres', () => {
    expect(validateQrParams({ ...VALIDOS, numserie: '' }).valid).toBe(false);
    expect(validateQrParams({ ...VALIDOS, numserie: 'A'.repeat(61) }).valid).toBe(false);
    expect(validateQrParams({ ...VALIDOS, numserie: 'A'.repeat(60) }).valid).toBe(true);
  });

  it('rechaza NIF que no sean 9 alfanuméricos en mayúsculas', () => {
    for (const nif of ['B123', 'b12345678', 'B1234567890', '']) {
      expect(validateQrParams({ ...VALIDOS, nif }).valid).toBe(false);
    }
  });

  // El patrón por sí solo aceptaba 99-99-9999.
  it('rechaza fechas que encajan en el patrón pero no existen', () => {
    for (const fecha of ['99-99-9999', '32-01-2026', '29-02-2025', '00-01-2026']) {
      const r = validateQrParams({ ...VALIDOS, fecha });
      expect(r.valid, fecha).toBe(false);
      expect(r.errors.join()).toContain('2004');
    }
    expect(validateQrParams({ ...VALIDOS, fecha: '29-02-2024' }).valid).toBe(true); // bisiesto
  });

  // Los ejemplos del §8 usan `importe=241.4`, con UN decimal: exigir dos
  // rechazaría el ejemplo canónico de la propia AEAT.
  it('acepta importes con uno o dos decimales', () => {
    expect(validateQrParams({ ...VALIDOS, importe: '241.4' }).valid).toBe(true);
    expect(validateQrParams({ ...VALIDOS, importe: '241.40' }).valid).toBe(true);
    expect(validateQrParams({ ...VALIDOS, importe: '241' }).valid).toBe(true);
  });

  it('rechaza importes de más de 12 dígitos enteros', () => {
    expect(validateQrParams({ ...VALIDOS, importe: '1234567890123.00' }).valid).toBe(false);
    expect(validateQrParams({ ...VALIDOS, importe: '999999999999.99' }).valid).toBe(true);
  });

  it('assertValidQrParams enumera todos los problemas', () => {
    expect(() => assertValidQrParams({ nif: 'X', numserie: '', fecha: 'x', importe: 'y' })).toThrow(
      /2001[\s\S]*2003[\s\S]*2004[\s\S]*2006/
    );
  });
});

describe('buildQrUrl', () => {
  it('la URL no contiene la huella', () => {
    const url = buildQrUrl(FACTURA, 'production');
    expect(url).not.toContain('huella');
    expect([...new URL(url).searchParams.keys()]).toHaveLength(4);
  });
});
