/**
 * Cálculo de la huella («hash») de los registros de facturación.
 *
 * Fuente: AEAT, «Detalle de las especificaciones técnicas para generación de la
 * huella o hash de los registros de facturación», v0.1.2 (27/08/2024).
 *
 * Dos decisiones de diseño, ambas para hacer imposibles defectos que ya
 * ocurrieron:
 *
 *  1. **Los campos entran ya como texto.** Este módulo no formatea fechas ni
 *     importes. Antes lo hacía, con un formateador distinto del que usaba el XML,
 *     de modo que la huella no podía coincidir con lo que se enviaba. Ahora el
 *     texto se produce una sola vez en `src/format/aeat.ts` y alimenta a los dos.
 *     El invariante que exige el apartado 3 del documento —«los valores de los
 *     campos deberán tener la misma información contenida en el campo
 *     correspondiente del fichero XML»— pasa a ser estructural.
 *
 *  2. **Los nombres de campo son claves de un tipo.** Escribir `IDEmisorFactura`
 *     en un registro de anulación, donde toca `IDEmisorFacturaAnulada`, es ahora
 *     un error de compilación en lugar de un fallo silencioso.
 */

import { createHash } from 'node:crypto';
import { HashError } from '../errors/crypto-errors.js';
import {
  buildNumSerieFactura,
  formatAeatAmount,
  formatAeatDate,
  formatAeatTimestamp,
  normalizeAeatText,
} from '../format/aeat.js';
import type { Invoice, InvoiceCancellation } from '../models/invoice.js';
import { calculateCuotaTotal } from '../models/tax.js';

/** Campos de la huella de un registro de alta, en el orden en que se concatenan. */
export const ALTA_HASH_FIELDS = [
  'IDEmisorFactura',
  'NumSerieFactura',
  'FechaExpedicionFactura',
  'TipoFactura',
  'CuotaTotal',
  'ImporteTotal',
  'Huella',
  'FechaHoraHusoGenRegistro',
] as const;

/** Campos de la huella de un registro de anulación, en orden. */
export const ANULACION_HASH_FIELDS = [
  'IDEmisorFacturaAnulada',
  'NumSerieFacturaAnulada',
  'FechaExpedicionFacturaAnulada',
  'Huella',
  'FechaHoraHusoGenRegistro',
] as const;

/** Valores ya formateados de los campos de la huella de un alta. */
export type AltaHashFields = Record<(typeof ALTA_HASH_FIELDS)[number], string>;

/** Valores ya formateados de los campos de la huella de una anulación. */
export type AnulacionHashFields = Record<(typeof ANULACION_HASH_FIELDS)[number], string>;

/**
 * SHA-256 en hexadecimal MAYÚSCULAS, 64 caracteres.
 *
 * Único punto del proyecto que invoca `createHash`. La versión anterior exponía
 * `sha256()` en Base64 y `sha256Hex()` en minúsculas; la primera era la que se
 * usaba —y era el defecto— y la segunda no la llamaba nadie.
 */
export function computeHuella(input: string): string {
  try {
    return createHash('sha256').update(input, 'utf8').digest('hex').toUpperCase();
  } catch (error) {
    throw new HashError(
      'Failed to calculate SHA-256 hash',
      error instanceof Error ? error : undefined
    );
  }
}

/** Formato de una huella válida. */
export const HUELLA_PATTERN = /^[0-9A-F]{64}$/;

/** Comprueba que un valor tiene forma de huella. */
export function isHuella(value: string): boolean {
  return HUELLA_PATTERN.test(value);
}

function concat(order: readonly string[], fields: Record<string, string>): string {
  // `nombre=valor`, unidos por `&`, sin `&` final, sin URL-encoding, y con cada
  // valor recortado por los extremos. Un campo vacío se emite igualmente: es el
  // caso de `Huella=` en el primer registro de la cadena.
  return order.map((name) => `${name}=${normalizeAeatText(fields[name])}`).join('&');
}

/** Cadena a hashear de un registro de alta. */
export function buildAltaHashInput(fields: AltaHashFields): string {
  return concat(ALTA_HASH_FIELDS, fields);
}

/** Cadena a hashear de un registro de anulación. */
export function buildAnulacionHashInput(fields: AnulacionHashFields): string {
  return concat(ANULACION_HASH_FIELDS, fields);
}

/** Huella de un registro de alta. */
export function calculateAltaHash(fields: AltaHashFields): string {
  return computeHuella(buildAltaHashInput(fields));
}

/** Huella de un registro de anulación. */
export function calculateAnulacionHash(fields: AnulacionHashFields): string {
  return computeHuella(buildAnulacionHashInput(fields));
}

/** Opciones de formateo compartidas por el XML y la huella. */
export interface HashFieldOptions {
  /** Zona IANA con la que se interpretan las fechas. Por defecto, la del proceso. */
  timeZone?: string | undefined;
}

/**
 * Construye los campos de la huella de una factura.
 *
 * Único punto donde el modelo de dominio se convierte en el texto que verán tanto
 * la huella como el XML.
 */
export function buildAltaHashFields(
  invoice: Invoice,
  previousHash: string,
  generationTimestamp: Date,
  options: HashFieldOptions = {}
): AltaHashFields {
  const { timeZone } = options;
  return {
    IDEmisorFactura: normalizeAeatText(invoice.issuer.taxId.value),
    NumSerieFactura: buildNumSerieFactura(invoice.id),
    FechaExpedicionFactura: formatAeatDate(invoice.id.issueDate, timeZone),
    TipoFactura: invoice.invoiceType,
    CuotaTotal: formatAeatAmount(calculateCuotaTotal(invoice.taxBreakdown)),
    ImporteTotal: formatAeatAmount(invoice.totalAmount),
    Huella: previousHash,
    FechaHoraHusoGenRegistro: formatAeatTimestamp(generationTimestamp, timeZone),
  };
}

/** Construye los campos de la huella de una anulación. */
export function buildAnulacionHashFields(
  cancellation: InvoiceCancellation,
  previousHash: string,
  generationTimestamp: Date,
  options: HashFieldOptions = {}
): AnulacionHashFields {
  const { timeZone } = options;
  return {
    IDEmisorFacturaAnulada: normalizeAeatText(cancellation.issuer.taxId.value),
    NumSerieFacturaAnulada: buildNumSerieFactura(cancellation.invoiceId),
    FechaExpedicionFacturaAnulada: formatAeatDate(cancellation.invoiceId.issueDate, timeZone),
    Huella: previousHash,
    FechaHoraHusoGenRegistro: formatAeatTimestamp(generationTimestamp, timeZone),
  };
}

/** Huella de una factura, a partir del modelo de dominio. */
export function calculateInvoiceHash(
  invoice: Invoice,
  previousHash: string,
  generationTimestamp: Date,
  options?: HashFieldOptions
): string {
  return calculateAltaHash(
    buildAltaHashFields(invoice, previousHash, generationTimestamp, options)
  );
}

/** Huella de una anulación, a partir del modelo de dominio. */
export function calculateCancellationHash(
  cancellation: InvoiceCancellation,
  previousHash: string,
  generationTimestamp: Date,
  options?: HashFieldOptions
): string {
  return calculateAnulacionHash(
    buildAnulacionHashFields(cancellation, previousHash, generationTimestamp, options)
  );
}
