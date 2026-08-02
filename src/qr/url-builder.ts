/**
 * URL de cotejo que se codifica en el código QR.
 *
 * Fuente: AEAT, «Detalle de las especificaciones técnicas del código "QR" de la
 * factura y de la "URL" del servicio de cotejo», v0.5.0 (10/12/2025).
 */

import type { Environment, QrUrlKind } from '../client/endpoints.js';
import { getQrVerificationUrl } from '../client/endpoints.js';
import { QrGenerationError } from '../errors/qr-errors.js';
import { buildNumSerieFactura, formatAeatAmount, formatAeatDate } from '../format/aeat.js';
import type { Invoice } from '../models/invoice.js';

export type { QrUrlKind };

/**
 * Parámetros de la URL de cotejo.
 *
 * El §6 dice que la URL «deberá incorporar **únicamente** los siguientes 4
 * parámetros obligatorios». La huella **no** es uno de ellos: no aparece en
 * ninguna de las 35 páginas del documento.
 */
export interface QrUrlParams {
  /** NIF del obligado a expedir la factura. */
  nif: string;
  /** Nº Serie + Nº Factura. Máximo 60 caracteres, ASCII 32-126. */
  numserie: string;
  /** Fecha de expedición, `DD-MM-AAAA`. */
  fecha: string;
  /** Importe total, con punto decimal. */
  importe: string;
  /**
   * @deprecated No forma parte de la URL de cotejo. Se ignora, y desaparecerá.
   */
  huella?: string;
}

/** ASCII imprimible: el §4 no admite nada más en las cadenas de texto. */
const ASCII_IMPRIMIBLE = /^[\x20-\x7E]+$/;

/** Importe: hasta 12 dígitos enteros y hasta 2 decimales. */
const IMPORTE = /^-?\d{1,12}(\.\d{1,2})?$/;

/** Fecha `DD-MM-AAAA`. */
const FECHA = /^(\d{2})-(\d{2})-(\d{4})$/;

/** Construye los parámetros a partir de una factura. */
export function buildQrUrlParams(invoice: Invoice & { hash: string }): QrUrlParams {
  return {
    // Misma composición que el XML y la huella. Si divergen, la factura es válida
    // pero no cotejable, y el fallo es silencioso.
    nif: invoice.issuer.taxId.value,
    numserie: buildNumSerieFactura(invoice.id),
    fecha: formatAeatDate(invoice.id.issueDate),
    importe: formatAeatAmount(invoice.totalAmount),
  };
}

/**
 * Valida los parámetros contra el §6 y el §10.
 *
 * Los códigos entre corchetes son los que devolvería el servicio de cotejo.
 */
export function validateQrParams(params: QrUrlParams): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!/^[0-9A-Z]{9}$/.test(params.nif)) {
    errors.push('[2001] NIF inválido: deben ser 9 caracteres alfanuméricos en mayúsculas');
  }

  if (!params.numserie) {
    errors.push('[2003] El número de serie es obligatorio');
  } else if (params.numserie.length > 60) {
    errors.push('[2002] El número de serie excede los 60 caracteres');
  } else if (!ASCII_IMPRIMIBLE.test(params.numserie)) {
    // El §4 lo prohíbe expresamente: «las cadenas de texto solo pueden contener
    // caracteres ASCII con códigos del 32 al 126».
    errors.push('[2003] El número de serie contiene caracteres fuera de ASCII 32-126');
  }

  const fecha = FECHA.exec(params.fecha);
  if (!fecha) {
    errors.push('[2004] La fecha debe tener el formato DD-MM-AAAA');
  } else {
    const [, dd, mm, aaaa] = fecha;
    const d = Number(dd);
    const m = Number(mm);
    const a = Number(aaaa);
    const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
    if (m < 1 || m > 12 || d < 1 || d > dias) {
      errors.push(`[2004] La fecha ${params.fecha} no existe`);
    }
  }

  if (!IMPORTE.test(params.importe)) {
    errors.push(
      '[2006] El importe debe ser numérico con punto decimal, ' +
        'hasta 12 dígitos enteros y 2 decimales'
    );
  }

  return { valid: errors.length === 0, errors };
}

/** Igual que {@link validateQrParams}, pero lanza. */
export function assertValidQrParams(params: QrUrlParams): void {
  const { valid, errors } = validateQrParams(params);
  if (!valid) {
    throw new QrGenerationError(`Parámetros de la URL de cotejo inválidos:\n  ${errors.join('\n  ')}`);
  }
}

/**
 * Construye la URL de cotejo a partir de sus parámetros.
 *
 * **La codificación con `URLSearchParams` es deliberada.** El §4.1 adjunta la
 * implementación de referencia de la AEAT en Java —incrustada como imagen en la
 * página 9, recuperable con `pdfimages`—, cuyo núcleo es
 * `java.net.URLEncoder.encode(param, "UTF-8")`: el serializador
 * `x-www-form-urlencoded`, que codifica el espacio como `+`.
 *
 * Comparado carácter a carácter sobre todo ASCII 32-126 contra una JVM real,
 * `URLSearchParams` coincide en **0 diferencias** y `encodeURIComponent` diverge
 * en **6** (` `, `!`, `'`, `(`, `)`, `~`). No lo «arregles» a `encodeURIComponent`.
 */
export function buildQrUrlFromParams(
  params: QrUrlParams,
  environment: Environment = 'production',
  kind: QrUrlKind = 'verifactu'
): string {
  assertValidQrParams(params);
  const search = new URLSearchParams();
  search.set('nif', params.nif);
  search.set('numserie', params.numserie);
  search.set('fecha', params.fecha);
  search.set('importe', params.importe);
  return `${getQrVerificationUrl(environment, kind)}?${search.toString()}`;
}

/** Construye la URL de cotejo de una factura. */
export function buildQrUrl(
  invoice: Invoice & { hash: string },
  environment: Environment = 'production',
  kind: QrUrlKind = 'verifactu'
): string {
  return buildQrUrlFromParams(buildQrUrlParams(invoice), environment, kind);
}

/** Alias de {@link buildQrUrl}: el contenido del QR es la URL. */
export function buildQrData(
  invoice: Invoice & { hash: string },
  environment: Environment = 'production',
  kind: QrUrlKind = 'verifactu'
): string {
  return buildQrUrl(invoice, environment, kind);
}
