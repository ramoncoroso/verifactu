/**
 * Formateadores de `src/format/aeat.ts`.
 *
 * Los vectores oficiales (`tests/conformance/huella-vectores.test.ts`) fijan el
 * comportamiento normativo. Aquí se cubre lo que los vectores no pueden cubrir:
 * husos horarios exóticos, valores degenerados y la semántica del recorte.
 */

import { describe, expect, it } from 'vitest';

import {
  AEAT_AMOUNT_PATTERN,
  AEAT_DATE_PATTERN,
  AEAT_RATE_PATTERN,
  AEAT_TIMESTAMP_PATTERN,
  buildNumSerieFactura,
  formatAeatAmount,
  formatAeatDate,
  formatAeatRate,
  formatAeatTimestamp,
  normalizeAeatText,
} from '../../src/format/aeat.js';

const INSTANTE = new Date('2024-06-01T12:00:00Z');

describe('formatAeatDate', () => {
  it('emite dd-mm-yyyy con longitud fija 10', () => {
    const s = formatAeatDate(new Date('2024-01-05T12:00:00Z'), 'Europe/Madrid');
    expect(s).toBe('05-01-2024');
    expect(s).toHaveLength(10);
    expect(s).toMatch(AEAT_DATE_PATTERN);
  });

  it('rellena con ceros el día y el mes', () => {
    expect(formatAeatDate(new Date('2024-09-09T12:00:00Z'), 'UTC')).toBe('09-09-2024');
  });

  // VF-028: sin zona explícita el resultado depende del entorno; con ella, no.
  it('con zona explícita es independiente del entorno', () => {
    const previo = process.env.TZ;
    const resultados: string[] = [];
    for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      resultados.push(formatAeatDate(new Date('2024-01-15T00:00:00Z'), 'Europe/Madrid'));
    }
    process.env.TZ = previo;
    expect(new Set(resultados)).toEqual(new Set(['15-01-2024']));
  });

  it('rechaza una fecha inválida en lugar de emitir NaN', () => {
    expect(() => formatAeatDate(new Date('no soy una fecha'))).toThrow();
  });
});

describe('formatAeatTimestamp', () => {
  // VF-015: el defecto era `Math.abs(Math.floor(offset / 60))`, que aplica el
  // redondeo antes que el valor absoluto. Solo se manifestaba en husos
  // fraccionarios AL ESTE: un test escrito en un huso fraccionario occidental no
  // lo habría detectado, por eso están los dos.
  it.each([
    ['Europe/Madrid', '2024-06-01T14:00:00+02:00'],
    ['UTC', '2024-06-01T12:00:00+00:00'],
    ['Asia/Kolkata', '2024-06-01T17:30:00+05:30'],
    ['Asia/Kathmandu', '2024-06-01T17:45:00+05:45'],
    ['Pacific/Chatham', '2024-06-02T00:45:00+12:45'],
    ['America/New_York', '2024-06-01T08:00:00-04:00'],
    ['America/St_Johns', '2024-06-01T09:30:00-02:30'],
  ])('%s → %s', (tz, esperado) => {
    expect(formatAeatTimestamp(INSTANTE, tz)).toBe(esperado);
  });

  it('siempre lleva offset numérico, nunca Z, y mide 25 caracteres', () => {
    for (const tz of ['UTC', 'Europe/Madrid', 'Asia/Kolkata']) {
      const s = formatAeatTimestamp(INSTANTE, tz);
      expect(s).toHaveLength(25);
      expect(s).toMatch(AEAT_TIMESTAMP_PATTERN);
      expect(s).not.toContain('Z');
      expect(s).not.toContain('GMT');
    }
  });

  it('respeta el horario de verano', () => {
    expect(formatAeatTimestamp(new Date('2024-01-01T12:00:00Z'), 'Europe/Madrid')).toContain(
      '+01:00'
    );
    expect(formatAeatTimestamp(new Date('2024-07-01T12:00:00Z'), 'Europe/Madrid')).toContain(
      '+02:00'
    );
  });
});

describe('formatAeatAmount', () => {
  it.each([
    [0, '0.00'],
    [121, '121.00'],
    [123.45, '123.45'],
    [-50.5, '-50.50'],
    [999999999999.99, '999999999999.99'],
  ])('%s → %s', (valor, esperado) => {
    expect(formatAeatAmount(valor)).toBe(esperado);
    expect(formatAeatAmount(valor)).toMatch(AEAT_AMOUNT_PATTERN);
  });

  // `toFixed(2)` a secas emitía "-0.00", que es sintácticamente válido pero la
  // AEAT probablemente normaliza a 0, lo que produciría discrepancia de huella.
  it('colapsa el cero negativo', () => {
    expect(formatAeatAmount(-0)).toBe('0.00');
    expect(formatAeatAmount(-0.001)).toBe('0.00');
  });

  // Estos tres producían "NaN", "Infinity" y "1e+21" sin que nada avisara, y
  // violan el patrón del XSD.
  it.each([NaN, Infinity, -Infinity])('rechaza %s', (valor) => {
    expect(() => formatAeatAmount(valor)).toThrow(/no finito/);
  });

  it('rechaza importes de más de 12 dígitos enteros', () => {
    expect(() => formatAeatAmount(1e12)).toThrow(/fuera de rango/);
    expect(() => formatAeatAmount(1e21)).toThrow(/fuera de rango/);
  });

  // Redondear sobre céntimos enteros mejora a `toFixed(2)`, pero no hace milagros
  // y conviene dejar constancia de hasta dónde llega.
  it('mejora el redondeo de toFixed donde se puede', () => {
    // 8.045 * 100 vale exactamente 804.5, así que Math.round lo sube a 8.05.
    // `(8.045).toFixed(2)` devuelve "8.04".
    expect(formatAeatAmount(8.045)).toBe('8.05');
    expect((8.045).toFixed(2)).toBe('8.04');
  });

  it('no puede corregir lo que la coma flotante ya perdió', () => {
    // El literal 1.005 no existe en float64: el valor almacenado es
    // 1.00499999999999989... Ninguna estrategia de redondeo puede devolver 1.01
    // partiendo de un `number`, porque el 1.005 nunca llegó. Si esto llega a
    // importar, el remedio es no usar `number` para los importes.
    expect(1.005 * 100).toBeLessThan(100.5);
    expect(formatAeatAmount(1.005)).toBe('1.00');
  });
});

describe('formatAeatRate', () => {
  it.each([
    [21, '21.00'],
    [10, '10.00'],
    [5.2, '5.20'],
    [0, '0.00'],
  ])('%s → %s', (valor, esperado) => {
    expect(formatAeatRate(valor)).toBe(esperado);
    expect(formatAeatRate(valor)).toMatch(AEAT_RATE_PATTERN);
  });

  // `Tipo2.2Type` no admite signo.
  it('rechaza tipos negativos', () => {
    expect(() => formatAeatRate(-1)).toThrow();
  });
});

describe('normalizeAeatText', () => {
  it('recorta los extremos y conserva los espacios internos', () => {
    expect(normalizeAeatText('  12345678 / G33  ')).toBe('12345678 / G33');
  });

  it('trata undefined y null como cadena vacía', () => {
    expect(normalizeAeatText(undefined)).toBe('');
    expect(normalizeAeatText(null)).toBe('');
  });

  // El `.trim()` de JavaScript elimina el espacio duro; el de Java, que es el que
  // usa la implementación de referencia de la AEAT, no. Si divergimos, la huella
  // que calculamos deja de coincidir con la que calcula la AEAT.
  it('conserva el espacio duro, como String.trim() de Java', () => {
    expect(normalizeAeatText('ACME ')).toBe('ACME ');
    expect('ACME '.trim()).toBe('ACME'); // lo que NO debe hacerse
  });

  it('recorta tabuladores y saltos de línea', () => {
    expect(normalizeAeatText('\t\nACME\r\n')).toBe('ACME');
  });
});

describe('buildNumSerieFactura', () => {
  it('concatena serie y número', () => {
    expect(buildNumSerieFactura({ series: 'FC', number: '0001' })).toBe('FC0001');
  });

  it('sin serie devuelve solo el número', () => {
    expect(buildNumSerieFactura({ number: '0001' })).toBe('0001');
    expect(buildNumSerieFactura({ series: '', number: '0001' })).toBe('0001');
  });

  it('recorta ambos', () => {
    expect(buildNumSerieFactura({ series: ' FC ', number: ' 0001 ' })).toBe('FC0001');
  });
});
