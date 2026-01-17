/**
 * Invoice models for Verifactu
 */

import type {
  InvoiceType,
  RectifiedInvoiceType,
  OperationRegime,
  OperationType,
  VatRate,
} from './enums.js';
import type { Issuer, Recipient, SoftwareInfo } from './party.js';
import type { TaxBreakdown, TaxTotals } from './tax.js';

/**
 * Invoice identifier
 */
export interface InvoiceId {
  /** Invoice series (optional, max 20 chars) */
  readonly series?: string;
  /** Invoice number (required, max 20 chars) */
  readonly number: string;
  /** Issue date */
  readonly issueDate: Date;
}

/**
 * Reference to a previous invoice (for rectifications)
 */
export interface InvoiceReference {
  /** Referenced invoice ID */
  readonly invoiceId: InvoiceId;
  /** Issuer tax ID of the referenced invoice */
  readonly issuerTaxId: string;
}

/**
 * Invoice line item
 */
export interface InvoiceLine {
  /** Line description */
  readonly description: string;
  /** Quantity */
  readonly quantity: number;
  /** Unit price (without VAT) */
  readonly unitPrice: number;
  /** Discount percentage (optional) */
  readonly discountPercent?: number;
  /** VAT rate */
  readonly vatRate: VatRate;
  /** Line total (calculated: quantity * unitPrice * (1 - discount/100)) */
  readonly lineTotal?: number;
}

/**
 * Verifactu record hash chain reference
 */
export interface ChainReference {
  /** Previous record hash (Huella) */
  readonly previousHash: string;
  /** Previous invoice date */
  readonly previousDate: Date;
  /** Previous invoice series */
  readonly previousSeries?: string;
  /** Previous invoice number */
  readonly previousNumber: string;
}

/**
 * Invoice record for alta (registration)
 */
export interface Invoice {
  /** Operation type (alta/anulación) */
  readonly operationType: 'A';
  /** Invoice type (F1, F2, etc.) */
  readonly invoiceType: InvoiceType;
  /** Rectified invoice type (S/I) - only for rectifications */
  readonly rectifiedInvoiceType?: RectifiedInvoiceType;
  /** Invoice identifier */
  readonly id: InvoiceId;
  /** Issuer information */
  readonly issuer: Issuer;
  /** Recipient(s) information */
  readonly recipients?: readonly Recipient[];
  /** Operation description */
  readonly description?: string;
  /** Operation regime codes */
  readonly operationRegimes: readonly OperationRegime[];
  /** Tax breakdown */
  readonly taxBreakdown: TaxBreakdown;
  /** Total amount (including taxes) */
  readonly totalAmount: number;
  /** Invoice lines (optional, for reference) */
  readonly lines?: readonly InvoiceLine[];
  /** References to rectified invoices (for rectifications) */
  readonly rectifiedInvoices?: readonly InvoiceReference[];
  /** Software information */
  readonly softwareInfo?: SoftwareInfo;
  /** Hash chain reference (populated during processing) */
  readonly chainReference?: ChainReference;
  /** Record hash (populated during processing) */
  readonly hash?: string;
  /** QR code data (populated during processing) */
  readonly qrCode?: string;
}

/**
 * Invoice cancellation record
 */
export interface InvoiceCancellation {
  /** Operation type */
  readonly operationType: 'AN';
  /** Invoice to cancel */
  readonly invoiceId: InvoiceId;
  /** Issuer of the original invoice */
  readonly issuer: Issuer;
  /** Reason for cancellation */
  readonly reason?: string;
  /** Software information */
  readonly softwareInfo?: SoftwareInfo;
  /** Hash chain reference */
  readonly chainReference?: ChainReference;
  /** Record hash */
  readonly hash?: string;
}

/**
 * Union type for any Verifactu record
 */
export type VerifactuRecord = Invoice | InvoiceCancellation;

/**
 * Check if a record is an invoice (alta)
 */
export function isInvoice(record: VerifactuRecord): record is Invoice {
  return record.operationType === 'A';
}

/**
 * Check if a record is a cancellation (anulación)
 */
export function isCancellation(record: VerifactuRecord): record is InvoiceCancellation {
  return record.operationType === 'AN';
}

/**
 * Format invoice ID as string
 */
export function formatInvoiceId(id: InvoiceId): string {
  const parts: string[] = [];
  if (id.series) {
    parts.push(id.series);
  }
  parts.push(id.number);
  return parts.join('-');
}

/**
 * Format date as AEAT format (DD-MM-YYYY)
 */
export function formatAeatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString();
  return `${day}-${month}-${year}`;
}

/**
 * Format date as ISO format (YYYY-MM-DD)
 */
export function formatIsoDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString();
  return `${year}-${month}-${day}`;
}

/**
 * Parse AEAT date format (DD-MM-YYYY) to Date
 */
export function parseAeatDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split('-').map(Number);
  if (day === undefined || month === undefined || year === undefined) {
    throw new Error(`Invalid AEAT date format: ${dateStr}`);
  }
  return new Date(year, month - 1, day);
}

/**
 * Calculate invoice line total
 */
export function calculateLineTotal(line: Omit<InvoiceLine, 'lineTotal'>): number {
  const discount = line.discountPercent ?? 0;
  const subtotal = line.quantity * line.unitPrice;
  return Math.round(subtotal * (1 - discount / 100) * 100) / 100;
}

/**
 * Create an invoice line with calculated total
 */
export function createInvoiceLine(
  description: string,
  quantity: number,
  unitPrice: number,
  vatRate: VatRate,
  discountPercent?: number
): InvoiceLine {
  const line = { description, quantity, unitPrice, vatRate, discountPercent };
  return {
    ...line,
    lineTotal: calculateLineTotal(line),
  };
}
