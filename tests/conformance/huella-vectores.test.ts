/**
 * Nivel 0 y 1 de la pirámide de verificación: el digest y la cadena.
 *
 * Estos tests no comparan el código consigo mismo. Comparan su salida con tres
 * vectores publicados por la AEAT. Es el oráculo externo que le faltaba a la
 * suite y que habría detectado VF-002, VF-003 y VF-004a de un golpe.
 *
 * Los `it.fails` que documentaban VF-002, VF-003 y VF-004a se retiraron al
 * corregirlos: ahora estos tests fijan el comportamiento correcto.
 *
 * REGLA: prohibido `toContain` sobre la cadena de la huella. `toContain('IDEmisorFactura=B1')`
 * pasa aunque el campo esté en la posición equivocada, aunque falte otro campo y
 * aunque el separador sea `;`. Siempre `toBe` sobre la cadena completa.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  ALTA_HASH_FIELDS,
  ANULACION_HASH_FIELDS,
  buildAltaHashFields,
  buildAltaHashInput,
  buildAnulacionHashInput,
  calculateAltaHash,
  calculateAnulacionHash,
  computeHuella,
  isHuella,
  type AltaHashFields,
  type AnulacionHashFields,
} from '../../src/crypto/hash.js';
import {
  AEAT_ALTA_VECTORS,
  AEAT_ANULACION_VECTOR,
  AEAT_HASH_VECTORS,
} from '../fixtures/aeat-hash-vectors.js';

/** Referencia independiente del código de la librería. */
const sha256Upper = (s: string): string =>
  createHash('sha256').update(s, 'utf8').digest('hex').toUpperCase();

describe('Precondición · la zona horaria está fijada', () => {
  // Si alguien quita `env: { TZ }` de vitest.config.ts, los vectores dejan de ser
  // reproducibles y los `it.fails` de abajo empiezan a mentir: pasarían por el
  // huso equivocado en vez de por el defecto que documentan. Este test lo impide.
  it('el proceso corre en Europe/Madrid', () => {
    expect(process.env.TZ).toBe('Europe/Madrid');
  });

  it('el huso del proceso reproduce el instante del vector oficial', () => {
    const instante = new Date('2024-01-01T19:20:30+01:00');
    expect(instante.getHours()).toBe(19);
    expect(instante.getTimezoneOffset()).toBe(-60);
  });
});

describe('Vectores oficiales de la AEAT · integridad del fixture', () => {
  // Este sí debe pasar siempre: verifica que los vectores son coherentes entre
  // sí, no que la librería los reproduzca. Si falla, el fixture está corrupto.
  it.each(AEAT_HASH_VECTORS)('$id · el digest publicado es el SHA-256 de la cadena', (v) => {
    expect(sha256Upper(v.input)).toBe(v.digest);
  });

  it('los tres vectores forman una cadena encadenada', () => {
    const [primero, segundo] = AEAT_ALTA_VECTORS;
    expect(segundo?.fields.Huella).toBe(primero?.digest);
    expect(AEAT_ANULACION_VECTOR.fields.Huella).toBe(segundo?.digest);
  });

  it('el primer registro de la cadena lleva la huella anterior vacía', () => {
    expect(AEAT_ALTA_VECTORS[0]?.fields.Huella).toBe('');
    expect(AEAT_ALTA_VECTORS[0]?.input).toContain('&Huella=&');
  });
});

describe('Nivel 1 · cadena de concatenación', () => {
  // Con la API de campos como texto, el vector se alimenta VERBATIM: no hay que
  // fabricar un Date intermedio ni depender del huso del proceso. Ésta es la
  // forma correcta del test, y solo fue posible tras reescribir la API.
  it.each(AEAT_ALTA_VECTORS)('$id · reproduce la cadena oficial', (v) => {
    expect(buildAltaHashInput(v.fields as unknown as AltaHashFields)).toBe(v.input);
  });

  it('anulación · reproduce la cadena oficial', () => {
    const v = AEAT_ANULACION_VECTOR;
    expect(buildAnulacionHashInput(v.fields as unknown as AnulacionHashFields)).toBe(v.input);
  });

  it('el orden y los nombres de los campos son los del documento', () => {
    expect([...ALTA_HASH_FIELDS]).toEqual([
      'IDEmisorFactura',
      'NumSerieFactura',
      'FechaExpedicionFactura',
      'TipoFactura',
      'CuotaTotal',
      'ImporteTotal',
      'Huella',
      'FechaHoraHusoGenRegistro',
    ]);
    expect([...ANULACION_HASH_FIELDS]).toEqual([
      'IDEmisorFacturaAnulada',
      'NumSerieFacturaAnulada',
      'FechaExpedicionFacturaAnulada',
      'Huella',
      'FechaHoraHusoGenRegistro',
    ]);
  });

  it('recorta los extremos de cada valor, y solo los extremos', () => {
    const v = AEAT_ALTA_VECTORS[0]!;
    const conEspacios = Object.fromEntries(
      Object.entries(v.fields).map(([k, val]) => [k, val === '' ? '' : `  ${val}  `])
    ) as unknown as AltaHashFields;
    expect(buildAltaHashInput(conEspacios)).toBe(v.input);
  });
});

describe('Nivel 0 · el digest', () => {
  it.each(AEAT_ALTA_VECTORS)('$id · reproduce la huella oficial', (v) => {
    expect(calculateAltaHash(v.fields as unknown as AltaHashFields)).toBe(v.digest);
  });

  it('anulación · reproduce la huella oficial', () => {
    const v = AEAT_ANULACION_VECTOR;
    expect(calculateAnulacionHash(v.fields as unknown as AnulacionHashFields)).toBe(v.digest);
  });

  it('la huella es hexadecimal en mayúsculas de 64 caracteres', () => {
    expect(computeHuella('cualquier cosa')).toMatch(/^[0-9A-F]{64}$/);
    expect(isHuella(computeHuella(''))).toBe(true);
  });
});

describe('Extremo a extremo · desde el modelo de dominio', () => {
  // Recorre el pipeline entero —modelo, totales, formateo, concatenación,
  // digest— y aterriza en un número publicado por la AEAT. Ningún error
  // intermedio sobrevive a esto.
  it('reproduce el vector 6.1 partiendo de un Invoice', () => {
    const v = AEAT_ALTA_VECTORS[0]!;
    const invoice = {
      operationType: 'A',
      issuer: { taxId: { type: 'NIF', value: '89890001K' }, name: 'Emisor de prueba' },
      invoiceType: 'F1',
      id: {
        // El vector usa `12345678/G33` como NumSerieFactura completo.
        series: '12345678/',
        number: 'G33',
        issueDate: new Date('2024-01-01T12:00:00Z'),
      },
      taxBreakdown: { vatBreakdowns: [{ taxBase: 111.1, vatRate: 11.12, vatAmount: 12.35 }] },
      totalAmount: 123.45,
    } as unknown as Parameters<typeof buildAltaHashFields>[0];

    const fields = buildAltaHashFields(invoice, '', new Date('2024-01-01T18:20:30Z'), {
      timeZone: 'Europe/Madrid',
    });

    expect(fields).toEqual(v.fields);
    expect(calculateAltaHash(fields)).toBe(v.digest);
  });

  // La misma factura debe producir la misma huella en cualquier zona del proceso
  // cuando se pasa `timeZone`. Es lo que convierte VF-028 en inalcanzable para
  // quien use la opción.
  it('con timeZone explícita, el resultado no depende del entorno', () => {
    const invoice = {
      operationType: 'A',
      issuer: { taxId: { type: 'NIF', value: '89890001K' }, name: 'X' },
      invoiceType: 'F1',
      id: { series: '12345678/', number: 'G33', issueDate: new Date('2024-01-01T12:00:00Z') },
      taxBreakdown: { vatBreakdowns: [{ taxBase: 111.1, vatRate: 11.12, vatAmount: 12.35 }] },
      totalAmount: 123.45,
    } as unknown as Parameters<typeof buildAltaHashFields>[0];
    const at = new Date('2024-01-01T18:20:30Z');
    const tz = 'Europe/Madrid';

    const previo = process.env.TZ;
    const huellas: string[] = [];
    for (const entorno of ['UTC', 'America/New_York', 'Asia/Kolkata', 'Europe/Madrid']) {
      process.env.TZ = entorno;
      huellas.push(calculateAltaHash(buildAltaHashFields(invoice, '', at, { timeZone: tz })));
    }
    process.env.TZ = previo;

    expect(new Set(huellas).size).toBe(1);
    expect(huellas[0]).toBe(AEAT_ALTA_VECTORS[0]!.digest);
  });

  it('la cadena encadena: cada huella alimenta a la siguiente', () => {
    const [uno, dos] = AEAT_ALTA_VECTORS;
    expect(calculateAltaHash(uno!.fields as unknown as AltaHashFields)).toBe(dos!.fields.Huella);
    expect(calculateAltaHash(dos!.fields as unknown as AltaHashFields)).toBe(
      AEAT_ANULACION_VECTOR.fields.Huella
    );
  });
});
