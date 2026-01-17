/**
 * SHA-256 Hash Implementation for Verifactu
 *
 * Uses Node.js crypto module (available in Node.js, Deno, and Bun)
 * for calculating record hashes according to AEAT specifications.
 */

import { createHash } from 'node:crypto';
import { HashError } from '../errors/crypto-errors.js';
import type { Invoice, InvoiceCancellation } from '../models/invoice.js';
import { formatXmlDate } from '../xml/builder.js';

/**
 * Calculate SHA-256 hash of a string
 * Returns the hash as a Base64 encoded string
 */
export function sha256(data: string): string {
  try {
    const hash = createHash('sha256');
    hash.update(data, 'utf8');
    return hash.digest('base64');
  } catch (error) {
    throw new HashError(
      'Failed to calculate SHA-256 hash',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Calculate SHA-256 hash and return as hex string
 */
export function sha256Hex(data: string): string {
  try {
    const hash = createHash('sha256');
    hash.update(data, 'utf8');
    return hash.digest('hex');
  } catch (error) {
    throw new HashError(
      'Failed to calculate SHA-256 hash',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Hash input fields according to AEAT Verifactu specification
 *
 * For Alta (registration) records, the hash is calculated from:
 * - IDEmisorFactura (NIF)
 * - NumSerieFactura
 * - FechaExpedicionFactura
 * - TipoFactura
 * - CuotaTotal
 * - ImporteTotal
 * - Huella anterior (previous hash)
 * - FechaHoraHusoGenRegistro
 */
export interface AltaHashInput {
  /** Issuer NIF */
  issuerNif: string;
  /** Invoice number (with series if applicable) */
  invoiceNumber: string;
  /** Issue date */
  issueDate: Date;
  /** Invoice type (F1, F2, etc.) */
  invoiceType: string;
  /** Total VAT amount */
  vatTotal: number;
  /** Total invoice amount */
  totalAmount: number;
  /** Previous record hash (empty string for first record) */
  previousHash: string;
  /** Generation timestamp */
  generationTimestamp: Date;
}

/**
 * Build the hash input string for an Alta record
 */
export function buildAltaHashInput(input: AltaHashInput): string {
  const parts = [
    `IDEmisorFactura=${input.issuerNif}`,
    `NumSerieFactura=${input.invoiceNumber}`,
    `FechaExpedicionFactura=${formatXmlDate(input.issueDate)}`,
    `TipoFactura=${input.invoiceType}`,
    `CuotaTotal=${formatAmount(input.vatTotal)}`,
    `ImporteTotal=${formatAmount(input.totalAmount)}`,
    `Huella=${input.previousHash}`,
    `FechaHoraHusoGenRegistro=${formatTimestamp(input.generationTimestamp)}`,
  ];

  return parts.join('&');
}

/**
 * Calculate hash for an Alta (registration) record
 */
export function calculateAltaHash(input: AltaHashInput): string {
  const hashInput = buildAltaHashInput(input);
  return sha256(hashInput);
}

/**
 * Hash input fields for Anulación (cancellation) records
 *
 * For Anulación records, the hash is calculated from:
 * - IDEmisorFactura (NIF)
 * - NumSerieFactura
 * - FechaExpedicionFactura
 * - Huella anterior (previous hash)
 * - FechaHoraHusoGenRegistro
 */
export interface AnulacionHashInput {
  /** Issuer NIF */
  issuerNif: string;
  /** Invoice number (with series if applicable) */
  invoiceNumber: string;
  /** Issue date */
  issueDate: Date;
  /** Previous record hash (empty string for first record) */
  previousHash: string;
  /** Generation timestamp */
  generationTimestamp: Date;
}

/**
 * Build the hash input string for an Anulación record
 */
export function buildAnulacionHashInput(input: AnulacionHashInput): string {
  const parts = [
    `IDEmisorFactura=${input.issuerNif}`,
    `NumSerieFactura=${input.invoiceNumber}`,
    `FechaExpedicionFactura=${formatXmlDate(input.issueDate)}`,
    `Huella=${input.previousHash}`,
    `FechaHoraHusoGenRegistro=${formatTimestamp(input.generationTimestamp)}`,
  ];

  return parts.join('&');
}

/**
 * Calculate hash for an Anulación (cancellation) record
 */
export function calculateAnulacionHash(input: AnulacionHashInput): string {
  const hashInput = buildAnulacionHashInput(input);
  return sha256(hashInput);
}

/**
 * Calculate hash for an invoice record
 */
export function calculateInvoiceHash(
  invoice: Invoice,
  previousHash: string,
  generationTimestamp: Date
): string {
  const vatTotal = invoice.taxBreakdown.vatBreakdowns?.reduce(
    (sum, v) => sum + v.vatAmount,
    0
  ) ?? 0;

  return calculateAltaHash({
    issuerNif: invoice.issuer.taxId.value,
    invoiceNumber: invoice.id.series
      ? `${invoice.id.series}${invoice.id.number}`
      : invoice.id.number,
    issueDate: invoice.id.issueDate,
    invoiceType: invoice.invoiceType,
    vatTotal,
    totalAmount: invoice.totalAmount,
    previousHash,
    generationTimestamp,
  });
}

/**
 * Calculate hash for a cancellation record
 */
export function calculateCancellationHash(
  cancellation: InvoiceCancellation,
  previousHash: string,
  generationTimestamp: Date
): string {
  return calculateAnulacionHash({
    issuerNif: cancellation.issuer.taxId.value,
    invoiceNumber: cancellation.invoiceId.series
      ? `${cancellation.invoiceId.series}${cancellation.invoiceId.number}`
      : cancellation.invoiceId.number,
    issueDate: cancellation.invoiceId.issueDate,
    previousHash,
    generationTimestamp,
  });
}

/**
 * Format amount for hash input (2 decimal places)
 */
function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Format timestamp for hash input (ISO format without milliseconds)
 */
function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');

  // Get timezone offset
  const offsetMinutes = date.getTimezoneOffset();
  const offsetHours = Math.abs(Math.floor(offsetMinutes / 60));
  const offsetMins = Math.abs(offsetMinutes % 60);
  const offsetSign = offsetMinutes <= 0 ? '+' : '-';
  const timezone = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMins.toString().padStart(2, '0')}`;

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${timezone}`;
}
