/**
 * Shared test fixtures for Verifactu tests
 *
 * This file contains reusable factory functions for creating test data.
 * Use these instead of creating inline test data to ensure consistency.
 */

import type { Invoice, InvoiceCancellation, InvoiceId } from '../../src/models/invoice.js';
import type { Issuer, Recipient } from '../../src/models/party.js';

/**
 * Test tax IDs
 * B12345674 - Valid CIF (corporate ID with correct control digit)
 * A87654321 - Valid CIF for recipients
 * 12345678Z - Valid personal NIF
 * X0000000T - Valid NIE
 */
export const TEST_TAX_IDS = {
  VALID_CIF: 'B12345674',
  VALID_CIF_ALT: 'A87654321',
  VALID_NIF: '12345678Z',
  VALID_NIE: 'X0000000T',
  INVALID: 'INVALID123',
} as const;

/**
 * Default test date (January 15, 2024)
 */
export const TEST_DATE = new Date('2024-01-15');

/**
 * Create a valid issuer for testing
 */
export function createTestIssuer(overrides?: Partial<Issuer>): Issuer {
  return {
    taxId: { type: 'NIF', value: TEST_TAX_IDS.VALID_CIF },
    name: 'Test Company SL',
    ...overrides,
  };
}

/**
 * Create a valid recipient for testing
 */
export function createTestRecipient(overrides?: Partial<Recipient>): Recipient {
  return {
    taxId: { type: 'NIF', value: TEST_TAX_IDS.VALID_CIF_ALT },
    name: 'Client SA',
    ...overrides,
  };
}

/**
 * Create a valid invoice ID for testing
 */
export function createTestInvoiceId(number: string = '001', series?: string): InvoiceId {
  return series !== undefined
    ? { series, number, issueDate: TEST_DATE }
    : { number, issueDate: TEST_DATE };
}

/**
 * Create a valid invoice for testing
 *
 * Uses:
 * - B12345674: Valid CIF (corporate ID)
 * - invoiceType 'F1': Standard invoice
 * - operationType 'A': Alta (new record)
 * - 21% VAT on 100€ base = 121€ total
 */
export function createTestInvoice(overrides?: Partial<Invoice>): Invoice {
  return {
    operationType: 'A',
    invoiceType: 'F1',
    id: createTestInvoiceId('001'),
    issuer: createTestIssuer(),
    operationRegimes: ['01'],
    taxBreakdown: {
      vatBreakdowns: [
        {
          vatRate: 21,
          taxBase: 100,
          vatAmount: 21,
        },
      ],
    },
    totalAmount: 121,
    ...overrides,
  };
}

/**
 * Create a valid invoice with recipient
 */
export function createTestInvoiceWithRecipient(overrides?: Partial<Invoice>): Invoice {
  return createTestInvoice({
    recipients: [createTestRecipient()],
    ...overrides,
  });
}

/**
 * Create a valid cancellation for testing
 *
 * Uses:
 * - operationType 'AN': Anulación (cancellation)
 * - B12345674: Valid CIF
 */
export function createTestCancellation(
  number: string = '001',
  overrides?: Partial<InvoiceCancellation>
): InvoiceCancellation {
  return {
    operationType: 'AN',
    invoiceId: createTestInvoiceId(number),
    issuer: createTestIssuer(),
    ...overrides,
  };
}

/**
 * Create a rectification invoice (F3) for testing
 */
export function createTestRectificationInvoice(
  originalNumber: string = '000',
  overrides?: Partial<Invoice>
): Invoice {
  return createTestInvoice({
    invoiceType: 'F3',
    rectifiedInvoiceType: 'S',
    rectifiedInvoices: [{
      issuerTaxId: TEST_TAX_IDS.VALID_CIF,
      invoiceId: createTestInvoiceId(originalNumber),
    }],
    ...overrides,
  });
}

/**
 * Create a simplified invoice (F2) for testing
 */
export function createTestSimplifiedInvoice(overrides?: Partial<Invoice>): Invoice {
  return createTestInvoice({
    invoiceType: 'F2',
    recipients: undefined, // Simplified invoices typically don't require recipients
    ...overrides,
  });
}
