/**
 * QR URL Builder for Verifactu
 *
 * Builds the verification URL that will be encoded in the QR code.
 */

import type { Invoice } from '../models/invoice.js';
import type { Environment } from '../client/endpoints.js';
import { getQrVerificationUrl } from '../client/endpoints.js';
import { formatXmlNumber } from '../xml/builder.js';

/**
 * QR URL parameters according to AEAT specification
 */
export interface QrUrlParams {
  /** Issuer NIF */
  nif: string;
  /** Invoice number (with series) */
  numserie: string;
  /** Issue date (DD-MM-YYYY) */
  fecha: string;
  /** Total amount */
  importe: string;
  /** Record hash (Huella) */
  huella: string;
}

/**
 * Build QR URL parameters from an invoice
 */
export function buildQrUrlParams(invoice: Invoice & { hash: string }): QrUrlParams {
  const numserie = invoice.id.series
    ? `${invoice.id.series}${invoice.id.number}`
    : invoice.id.number;

  // Format date as DD-MM-YYYY for QR
  const date = invoice.id.issueDate;
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString();
  const fecha = `${day}-${month}-${year}`;

  return {
    nif: invoice.issuer.taxId.value,
    numserie,
    fecha,
    importe: formatXmlNumber(invoice.totalAmount, 2),
    huella: invoice.hash,
  };
}

/**
 * Build the complete QR verification URL
 */
export function buildQrUrl(
  invoice: Invoice & { hash: string },
  environment: Environment = 'production'
): string {
  const baseUrl = getQrVerificationUrl(environment);
  const params = buildQrUrlParams(invoice);

  const searchParams = new URLSearchParams();
  searchParams.set('nif', params.nif);
  searchParams.set('numserie', params.numserie);
  searchParams.set('fecha', params.fecha);
  searchParams.set('importe', params.importe);
  searchParams.set('huella', params.huella);

  return `${baseUrl}?${searchParams.toString()}`;
}

/**
 * Build QR data string (URL to be encoded)
 */
export function buildQrData(
  invoice: Invoice & { hash: string },
  environment: Environment = 'production'
): string {
  return buildQrUrl(invoice, environment);
}

/**
 * Validate QR URL parameters
 */
export function validateQrParams(params: QrUrlParams): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate NIF
  if (!params.nif || params.nif.length !== 9) {
    errors.push('Invalid NIF: must be 9 characters');
  }

  // Validate invoice number
  if (!params.numserie || params.numserie.length > 60) {
    errors.push('Invalid invoice number: max 60 characters');
  }

  // Validate date format
  const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
  if (!dateRegex.test(params.fecha)) {
    errors.push('Invalid date format: must be DD-MM-YYYY');
  }

  // Validate amount
  const amountRegex = /^-?\d+\.\d{2}$/;
  if (!amountRegex.test(params.importe)) {
    errors.push('Invalid amount format: must have 2 decimal places');
  }

  // Validate hash
  if (!params.huella || params.huella.length < 20) {
    errors.push('Invalid hash: appears too short');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
