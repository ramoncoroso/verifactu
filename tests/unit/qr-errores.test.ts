/**
 * Qué error da el generador de QR cuando falla, y si dice la verdad.
 *
 * El `catch` de `buildMatrix` atribuía **cualquier** fallo de
 * `qrcode-generator` a «datos demasiado grandes», con un máximo cableado a
 * 2331. Dos consecuencias medidas:
 *
 *  - 2331 es la capacidad del nivel **M**. Con nivel `H` —capacidad 1273— un
 *    contenido de 1400 bytes fallaba con «1400 bytes exceeds maximum 2331», un
 *    mensaje que **se contradice a sí mismo** y manda a acortar unos datos que,
 *    según él mismo, caben.
 *  - Un nivel de corrección ilegal —que un consumidor sin tipos puede pasar—
 *    lanza `bad rs block @ typeNumber:1/errorCorrectionLevel:undefined`, y se
 *    reportaba también como «datos demasiado grandes». El usuario acorta el
 *    contenido y el fallo persiste, porque el problema era otro.
 *
 * Y de paso: `qrcode-generator` lanza **cadenas**, no `Error`. Un `catch` que
 * descarta el valor tira el único texto que decía qué había pasado.
 *
 * En el uso normal esto no se alcanza —la URL de cotejo ronda los 120
 * caracteres—, así que es un defecto de diagnóstico, no de conformidad.
 */

import { describe, expect, it } from 'vitest';

import { generateQrCodeFromUrl, CAPACIDAD_BYTES_POR_NIVEL } from '../../src/qr/generator.js';
import { QrDataTooLargeError, QrGenerationError } from '../../src/errors/qr-errors.js';

/** Capacidades reales de `qrcode-generator` en versión 40, modo byte. Medidas. */
describe('Capacidad por nivel de corrección', () => {
  it.each([
    ['L', 2953],
    ['M', 2331],
    ['Q', 1663],
    ['H', 1273],
  ])('el nivel %s admite %i bytes', (nivel, capacidad) => {
    expect(CAPACIDAD_BYTES_POR_NIVEL[nivel as 'L' | 'M' | 'Q' | 'H']).toBe(capacidad);
  });

  it.each([
    ['L', 2953],
    ['M', 2331],
    ['Q', 1663],
    ['H', 1273],
  ])('y esa capacidad es la real: %s cabe justo con %i', (nivel, capacidad) => {
    const ec = nivel as 'L' | 'M' | 'Q' | 'H';
    expect(() => generateQrCodeFromUrl('A'.repeat(capacidad), { errorCorrection: ec })).not.toThrow();
    expect(() => generateQrCodeFromUrl('A'.repeat(capacidad + 1), { errorCorrection: ec })).toThrow(
      QrDataTooLargeError
    );
  });
});

describe('Desbordamiento', () => {
  it('el máximo que anuncia es el del nivel usado, no uno fijo', () => {
    const error = (() => {
      try {
        generateQrCodeFromUrl('A'.repeat(1400), { errorCorrection: 'H' });
      } catch (e) {
        return e as QrDataTooLargeError;
      }
      throw new Error('se esperaba un error');
    })();

    expect(error).toBeInstanceOf(QrDataTooLargeError);
    expect(error.maxSize).toBe(1273);
    // Y el mensaje deja de contradecirse: 1400 > 1273.
    expect(error.message).toContain('1273');
    expect(error.message).not.toContain('2331');
  });

  it('el mensaje nunca afirma que el tamaño supere un máximo mayor que él', () => {
    for (const ec of ['L', 'M', 'Q', 'H'] as const) {
      const tam = CAPACIDAD_BYTES_POR_NIVEL[ec] + 1;
      try {
        generateQrCodeFromUrl('A'.repeat(tam), { errorCorrection: ec });
        throw new Error(`se esperaba desbordamiento en ${ec}`);
      } catch (e) {
        const err = e as QrDataTooLargeError;
        expect(err).toBeInstanceOf(QrDataTooLargeError);
        expect(err.dataSize).toBeGreaterThan(err.maxSize);
      }
    }
  });
});

describe('Fallos que NO son desbordamiento', () => {
  it('un nivel de corrección ilegal no se disfraza de datos grandes', () => {
    // Lo puede pasar cualquier consumidor sin tipos.
    const opciones = { errorCorrection: 'X' } as unknown as { errorCorrection: 'L' };
    expect(() => generateQrCodeFromUrl('hola', opciones)).toThrow(QrGenerationError);
    expect(() => generateQrCodeFromUrl('hola', opciones)).not.toThrow(QrDataTooLargeError);
  });

  it('conserva el texto que lanzó la librería, que es el que dice qué pasó', () => {
    const opciones = { errorCorrection: 'X' } as unknown as { errorCorrection: 'L' };
    try {
      generateQrCodeFromUrl('hola', opciones);
      throw new Error('se esperaba un error');
    } catch (e) {
      // `qrcode-generator` lanza cadenas, no Error: descartarlas perdía el
      // único dato útil.
      expect((e as Error).message).toContain('bad rs block');
    }
  });
});

describe('Lo que ya funcionaba sigue igual', () => {
  it('un contenido normal genera su QR', () => {
    const qr = generateQrCodeFromUrl('https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678');
    expect(qr.data.startsWith('<svg')).toBe(true);
    expect(qr.modules.length).toBeGreaterThan(20);
  });

  it('un carácter fuera de ASCII se sigue rechazando antes de codificar', () => {
    expect(() => generateQrCodeFromUrl('https://x?nombre=Peña')).toThrow(QrGenerationError);
  });
});
