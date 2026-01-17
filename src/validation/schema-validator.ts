/**
 * Schema Validator for Verifactu
 *
 * Validates invoice and cancellation records against Verifactu schema rules.
 * This is a structural validation, not full XSD validation.
 */

import type { Invoice, InvoiceCancellation, InvoiceId } from '../models/invoice.js';
import type { Issuer, Recipient, TaxId } from '../models/party.js';
import type { TaxBreakdown, VatBreakdown } from '../models/tax.js';
import { SchemaValidationError, type SchemaViolation } from '../errors/validation-errors.js';

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** List of violations (empty if valid) */
  violations: SchemaViolation[];
}

/**
 * Field constraints from Verifactu schema
 */
const CONSTRAINTS = {
  NIF_LENGTH: 9,
  SERIES_MAX_LENGTH: 20,
  NUMBER_MAX_LENGTH: 20,
  NAME_MAX_LENGTH: 120,
  DESCRIPTION_MAX_LENGTH: 500,
  AMOUNT_DECIMALS: 2,
  MAX_AMOUNT: 99999999999.99,
  MIN_AMOUNT: -99999999999.99,
} as const;

/**
 * Create a validation result helper
 */
function createResult(): { violations: SchemaViolation[]; addViolation: (path: string, message: string, expected?: string, actual?: unknown) => void; getResult: () => ValidationResult } {
  const violations: SchemaViolation[] = [];

  return {
    violations,
    addViolation(path: string, message: string, expected?: string, actual?: unknown) {
      violations.push({ path, message, expected, actual });
    },
    getResult(): ValidationResult {
      return {
        valid: violations.length === 0,
        violations,
      };
    },
  };
}

/**
 * Validate a NIF
 */
function validateNif(nif: string, path: string, result: ReturnType<typeof createResult>): void {
  if (!nif) {
    result.addViolation(path, 'NIF is required');
    return;
  }

  if (nif.length !== CONSTRAINTS.NIF_LENGTH) {
    result.addViolation(
      path,
      `NIF must be exactly ${CONSTRAINTS.NIF_LENGTH} characters`,
      `${CONSTRAINTS.NIF_LENGTH} characters`,
      nif.length
    );
  }

  // Basic format check
  if (!/^[A-Z0-9]+$/i.test(nif)) {
    result.addViolation(path, 'NIF must contain only alphanumeric characters');
  }
}

/**
 * Validate a tax ID
 */
function validateTaxId(taxId: TaxId, path: string, result: ReturnType<typeof createResult>): void {
  if (!taxId) {
    result.addViolation(path, 'Tax ID is required');
    return;
  }

  if (!taxId.type) {
    result.addViolation(`${path}.type`, 'Tax ID type is required');
  }

  if (!taxId.value) {
    result.addViolation(`${path}.value`, 'Tax ID value is required');
  }

  if (taxId.type === 'NIF') {
    validateNif(taxId.value, `${path}.value`, result);
  }
}

/**
 * Validate an issuer
 */
function validateIssuer(issuer: Issuer, path: string, result: ReturnType<typeof createResult>): void {
  if (!issuer) {
    result.addViolation(path, 'Issuer is required');
    return;
  }

  validateTaxId(issuer.taxId, `${path}.taxId`, result);

  if (!issuer.name) {
    result.addViolation(`${path}.name`, 'Issuer name is required');
  } else if (issuer.name.length > CONSTRAINTS.NAME_MAX_LENGTH) {
    result.addViolation(
      `${path}.name`,
      `Name exceeds maximum length`,
      `max ${CONSTRAINTS.NAME_MAX_LENGTH} characters`,
      issuer.name.length
    );
  }
}

/**
 * Validate a recipient
 */
function validateRecipient(recipient: Recipient, path: string, result: ReturnType<typeof createResult>): void {
  if (!recipient) {
    result.addViolation(path, 'Recipient is required');
    return;
  }

  validateTaxId(recipient.taxId, `${path}.taxId`, result);

  if (!recipient.name) {
    result.addViolation(`${path}.name`, 'Recipient name is required');
  } else if (recipient.name.length > CONSTRAINTS.NAME_MAX_LENGTH) {
    result.addViolation(
      `${path}.name`,
      `Name exceeds maximum length`,
      `max ${CONSTRAINTS.NAME_MAX_LENGTH} characters`,
      recipient.name.length
    );
  }
}

/**
 * Validate an invoice ID
 */
function validateInvoiceId(id: InvoiceId, path: string, result: ReturnType<typeof createResult>): void {
  if (!id) {
    result.addViolation(path, 'Invoice ID is required');
    return;
  }

  if (id.series !== undefined && id.series.length > CONSTRAINTS.SERIES_MAX_LENGTH) {
    result.addViolation(
      `${path}.series`,
      `Series exceeds maximum length`,
      `max ${CONSTRAINTS.SERIES_MAX_LENGTH} characters`,
      id.series.length
    );
  }

  if (!id.number) {
    result.addViolation(`${path}.number`, 'Invoice number is required');
  } else if (id.number.length > CONSTRAINTS.NUMBER_MAX_LENGTH) {
    result.addViolation(
      `${path}.number`,
      `Number exceeds maximum length`,
      `max ${CONSTRAINTS.NUMBER_MAX_LENGTH} characters`,
      id.number.length
    );
  }

  if (!id.issueDate) {
    result.addViolation(`${path}.issueDate`, 'Issue date is required');
  } else if (!(id.issueDate instanceof Date) || isNaN(id.issueDate.getTime())) {
    result.addViolation(`${path}.issueDate`, 'Issue date must be a valid Date');
  }
}

/**
 * Validate an amount
 */
function validateAmount(
  amount: number,
  path: string,
  result: ReturnType<typeof createResult>,
  allowNegative: boolean = true
): void {
  if (typeof amount !== 'number' || isNaN(amount)) {
    result.addViolation(path, 'Amount must be a valid number');
    return;
  }

  if (!allowNegative && amount < 0) {
    result.addViolation(path, 'Amount cannot be negative');
  }

  if (amount < CONSTRAINTS.MIN_AMOUNT || amount > CONSTRAINTS.MAX_AMOUNT) {
    result.addViolation(
      path,
      `Amount out of valid range`,
      `${CONSTRAINTS.MIN_AMOUNT} to ${CONSTRAINTS.MAX_AMOUNT}`,
      amount
    );
  }

  // Check decimal places
  const decimals = (amount.toString().split('.')[1] ?? '').length;
  if (decimals > CONSTRAINTS.AMOUNT_DECIMALS) {
    result.addViolation(
      path,
      `Amount has too many decimal places`,
      `max ${CONSTRAINTS.AMOUNT_DECIMALS} decimals`,
      decimals
    );
  }
}

/**
 * Validate VAT breakdown
 */
function validateVatBreakdown(breakdown: VatBreakdown, path: string, result: ReturnType<typeof createResult>): void {
  validateAmount(breakdown.taxBase, `${path}.taxBase`, result);
  validateAmount(breakdown.vatAmount, `${path}.vatAmount`, result);

  if (breakdown.vatRate < 0 || breakdown.vatRate > 100) {
    result.addViolation(
      `${path}.vatRate`,
      'VAT rate must be between 0 and 100',
      '0-100',
      breakdown.vatRate
    );
  }

  // Validate calculated VAT matches (with small tolerance for rounding)
  const expectedVat = Math.round(breakdown.taxBase * breakdown.vatRate) / 100;
  const diff = Math.abs(breakdown.vatAmount - expectedVat);
  if (diff > 0.01) {
    result.addViolation(
      `${path}.vatAmount`,
      'VAT amount does not match calculated value',
      expectedVat.toFixed(2),
      breakdown.vatAmount
    );
  }
}

/**
 * Validate tax breakdown
 */
function validateTaxBreakdown(breakdown: TaxBreakdown, path: string, result: ReturnType<typeof createResult>): void {
  if (!breakdown) {
    result.addViolation(path, 'Tax breakdown is required');
    return;
  }

  const hasVat = breakdown.vatBreakdowns && breakdown.vatBreakdowns.length > 0;
  const hasExempt = breakdown.exemptBreakdowns && breakdown.exemptBreakdowns.length > 0;
  const hasNonSubject = breakdown.nonSubjectBreakdowns && breakdown.nonSubjectBreakdowns.length > 0;

  if (!hasVat && !hasExempt && !hasNonSubject) {
    result.addViolation(path, 'Tax breakdown must have at least one breakdown type');
  }

  if (breakdown.vatBreakdowns) {
    breakdown.vatBreakdowns.forEach((vat, index) => {
      validateVatBreakdown(vat, `${path}.vatBreakdowns[${index}]`, result);
    });
  }

  if (breakdown.exemptBreakdowns) {
    breakdown.exemptBreakdowns.forEach((exempt, index) => {
      validateAmount(exempt.taxBase, `${path}.exemptBreakdowns[${index}].taxBase`, result);
      if (!exempt.cause) {
        result.addViolation(`${path}.exemptBreakdowns[${index}].cause`, 'Exemption cause is required');
      }
    });
  }

  if (breakdown.nonSubjectBreakdowns) {
    breakdown.nonSubjectBreakdowns.forEach((ns, index) => {
      validateAmount(ns.amount, `${path}.nonSubjectBreakdowns[${index}].amount`, result);
      if (!ns.cause) {
        result.addViolation(`${path}.nonSubjectBreakdowns[${index}].cause`, 'Non-subject cause is required');
      }
    });
  }
}

/**
 * Validate an invoice
 */
export function validateInvoice(invoice: Invoice): ValidationResult {
  const result = createResult();

  if (!invoice) {
    result.addViolation('invoice', 'Invoice is required');
    return result.getResult();
  }

  // Validate operation type
  if (invoice.operationType !== 'A') {
    result.addViolation('operationType', 'Operation type must be "A" for alta', 'A', invoice.operationType);
  }

  // Validate invoice type
  const validTypes = ['F1', 'F2', 'F3', 'R1', 'R2', 'R3', 'R4', 'R5'];
  if (!validTypes.includes(invoice.invoiceType)) {
    result.addViolation('invoiceType', 'Invalid invoice type', validTypes.join(', '), invoice.invoiceType);
  }

  // Validate invoice ID
  validateInvoiceId(invoice.id, 'id', result);

  // Validate issuer
  validateIssuer(invoice.issuer, 'issuer', result);

  // Validate recipients (optional but if present, must be valid)
  if (invoice.recipients) {
    invoice.recipients.forEach((recipient, index) => {
      validateRecipient(recipient, `recipients[${index}]`, result);
    });
  }

  // Validate operation regimes
  if (!invoice.operationRegimes || invoice.operationRegimes.length === 0) {
    result.addViolation('operationRegimes', 'At least one operation regime is required');
  }

  // Validate tax breakdown
  validateTaxBreakdown(invoice.taxBreakdown, 'taxBreakdown', result);

  // Validate total amount
  validateAmount(invoice.totalAmount, 'totalAmount', result);

  // Validate description length if present
  if (invoice.description && invoice.description.length > CONSTRAINTS.DESCRIPTION_MAX_LENGTH) {
    result.addViolation(
      'description',
      'Description exceeds maximum length',
      `max ${CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`,
      invoice.description.length
    );
  }

  // Validate rectified invoice type for rectifications
  if (invoice.invoiceType === 'F3') {
    if (!invoice.rectifiedInvoiceType) {
      result.addViolation('rectifiedInvoiceType', 'Rectified invoice type is required for F3 invoices');
    }
    if (!invoice.rectifiedInvoices || invoice.rectifiedInvoices.length === 0) {
      result.addViolation('rectifiedInvoices', 'Rectified invoices are required for F3 invoices');
    }
  }

  return result.getResult();
}

/**
 * Validate a cancellation
 */
export function validateCancellation(cancellation: InvoiceCancellation): ValidationResult {
  const result = createResult();

  if (!cancellation) {
    result.addViolation('cancellation', 'Cancellation is required');
    return result.getResult();
  }

  // Validate operation type
  if (cancellation.operationType !== 'AN') {
    result.addViolation('operationType', 'Operation type must be "AN" for anulación', 'AN', cancellation.operationType);
  }

  // Validate invoice ID
  validateInvoiceId(cancellation.invoiceId, 'invoiceId', result);

  // Validate issuer
  validateIssuer(cancellation.issuer, 'issuer', result);

  return result.getResult();
}

/**
 * Validate and throw if invalid
 */
export function assertValidInvoice(invoice: Invoice): void {
  const result = validateInvoice(invoice);
  if (!result.valid) {
    throw new SchemaValidationError(result.violations);
  }
}

/**
 * Validate and throw if invalid
 */
export function assertValidCancellation(cancellation: InvoiceCancellation): void {
  const result = validateCancellation(cancellation);
  if (!result.valid) {
    throw new SchemaValidationError(result.violations);
  }
}
