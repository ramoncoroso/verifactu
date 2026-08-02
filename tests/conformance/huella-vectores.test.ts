/**
 * Nivel 0 y 1 de la pirámide de verificación: el digest y la cadena.
 *
 * Estos tests no comparan el código consigo mismo. Comparan su salida con tres
 * vectores publicados por la AEAT. Es el oráculo externo que le faltaba a la
 * suite y que habría detectado VF-002, VF-003 y VF-004a de un golpe.
 *
 * Los que están marcados `it.fails` documentan un defecto abierto: **pasan
 * mientras el defecto exista**. Al corregirlo empiezan a fallar, lo que obliga a
 * quitar el `.fails` en el mismo PR. Corregir un hallazgo es quitar un `.fails`.
 *
 * REGLA: prohibido `toContain` sobre la cadena de la huella. `toContain('IDEmisorFactura=B1')`
 * pasa aunque el campo esté en la posición equivocada, aunque falte otro campo y
 * aunque el separador sea `;`. Siempre `toBe` sobre la cadena completa.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  buildAltaHashInput,
  buildAnulacionHashInput,
  calculateAltaHash,
  calculateAnulacionHash,
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
  // VF-004a: buildAltaHashInput formatea la fecha con formatXmlDate, que emite
  // YYYY-MM-DD en lugar del dd-mm-yyyy que exige el XSD.
  it.fails.each(AEAT_ALTA_VECTORS)(
    '$id · reproduce la cadena oficial [VF-004a abierto]',
    (v) => {
      const input = buildAltaHashInput({
        issuerNif: v.fields.IDEmisorFactura!,
        invoiceNumber: v.fields.NumSerieFactura!,
        issueDate: new Date('2024-01-01T12:00:00Z'),
        invoiceType: v.fields.TipoFactura!,
        vatTotal: Number(v.fields.CuotaTotal),
        totalAmount: Number(v.fields.ImporteTotal),
        previousHash: v.fields.Huella!,
        generationTimestamp: new Date(v.fields.FechaHoraHusoGenRegistro!),
      });
      expect(input).toBe(v.input);
    }
  );

  // VF-003: los campos de anulación deben llevar el sufijo `Anulada`.
  // VF-004a: y además la fecha sale en formato ISO.
  it.fails('anulación · reproduce la cadena oficial [VF-003 y VF-004a abiertos]', () => {
    const v = AEAT_ANULACION_VECTOR;
    const input = buildAnulacionHashInput({
      issuerNif: v.fields.IDEmisorFacturaAnulada!,
      invoiceNumber: v.fields.NumSerieFacturaAnulada!,
      issueDate: new Date('2024-01-01T12:00:00Z'),
      previousHash: v.fields.Huella!,
      generationTimestamp: new Date(v.fields.FechaHoraHusoGenRegistro!),
    });
    expect(input).toBe(v.input);
  });

  // Aserto quirúrgico sobre VF-003, independiente del formato de fecha: aísla el
  // defecto de los nombres de campo para que no quede tapado por VF-004a.
  it.fails('la cadena de anulación usa los nombres con sufijo Anulada [VF-003 abierto]', () => {
    const input = buildAnulacionHashInput({
      issuerNif: '89890001K',
      invoiceNumber: '12345679/G34',
      issueDate: new Date('2024-01-01T12:00:00Z'),
      previousHash: '',
      generationTimestamp: new Date('2024-01-01T19:20:40+01:00'),
    });
    const nombres = input.split('&').map((p) => p.split('=')[0]);
    expect(nombres).toEqual([
      'IDEmisorFacturaAnulada',
      'NumSerieFacturaAnulada',
      'FechaExpedicionFacturaAnulada',
      'Huella',
      'FechaHoraHusoGenRegistro',
    ]);
  });
});

describe('Nivel 0 · el digest', () => {
  // VF-002: calculateAltaHash devuelve Base64 en vez de hexadecimal mayúsculas.
  it.fails.each(AEAT_ALTA_VECTORS)('$id · reproduce la huella oficial [VF-002 abierto]', (v) => {
    const huella = calculateAltaHash({
      issuerNif: v.fields.IDEmisorFactura!,
      invoiceNumber: v.fields.NumSerieFactura!,
      issueDate: new Date('2024-01-01T12:00:00Z'),
      invoiceType: v.fields.TipoFactura!,
      vatTotal: Number(v.fields.CuotaTotal),
      totalAmount: Number(v.fields.ImporteTotal),
      previousHash: v.fields.Huella!,
      generationTimestamp: new Date(v.fields.FechaHoraHusoGenRegistro!),
    });
    expect(huella).toBe(v.digest);
  });

  it.fails('anulación · reproduce la huella oficial [VF-002 y VF-003 abiertos]', () => {
    const v = AEAT_ANULACION_VECTOR;
    const huella = calculateAnulacionHash({
      issuerNif: v.fields.IDEmisorFacturaAnulada!,
      invoiceNumber: v.fields.NumSerieFacturaAnulada!,
      issueDate: new Date('2024-01-01T12:00:00Z'),
      previousHash: v.fields.Huella!,
      generationTimestamp: new Date(v.fields.FechaHoraHusoGenRegistro!),
    });
    expect(huella).toBe(v.digest);
  });

  // Aserto de formato, independiente de que la cadena de entrada sea correcta.
  // Aísla VF-002 de VF-003 y VF-004a.
  it.fails('la huella es hexadecimal en mayúsculas de 64 caracteres [VF-002 abierto]', () => {
    const huella = calculateAltaHash({
      issuerNif: 'B12345678',
      invoiceNumber: 'A001',
      issueDate: new Date('2024-01-15T12:00:00Z'),
      invoiceType: 'F1',
      vatTotal: 21,
      totalAmount: 121,
      previousHash: '',
      generationTimestamp: new Date('2024-01-15T12:00:00+01:00'),
    });
    expect(huella).toMatch(/^[0-9A-F]{64}$/);
  });
});
