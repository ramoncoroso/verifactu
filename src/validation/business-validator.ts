/**
 * Business Rules Validator for Verifactu
 *
 * Validates invoices against Spanish tax law business rules.
 */

import type { Invoice, InvoiceCancellation } from '../models/invoice.js';
import type { TaxBreakdown, VatBreakdown } from '../models/tax.js';
import { isValidSpanishTaxId, getSpanishTaxIdType } from './nif-validator.js';

/**
 * Business rule violation
 */
export interface BusinessViolation {
  /** Rule code */
  code: string;
  /** Error message */
  message: string;
  /** Severity: error (blocking) or warning (informational) */
  severity: 'error' | 'warning';
  /** Affected field path */
  field?: string;
}

/**
 * Business validation result
 */
export interface BusinessValidationResult {
  /** Whether validation passed (no errors, warnings allowed) */
  valid: boolean;
  /** All violations (errors and warnings) */
  violations: BusinessViolation[];
  /** Only error violations */
  errors: BusinessViolation[];
  /** Only warning violations */
  warnings: BusinessViolation[];
}

/**
 * Business rule codes
 */
export const BusinessRules = {
  // NIF validation
  BR001: 'BR001', // Invalid issuer NIF
  BR002: 'BR002', // Invalid recipient NIF
  BR003: 'BR003', // Company issuing with personal NIF

  // Date validation
  BR010: 'BR010', // Future issue date
  BR011: 'BR011', // Issue date too old
  BR012: 'BR012', // Rectification date before original

  // Amount validation
  BR020: 'BR020', // Total doesn't match breakdown
  BR021: 'BR021', // Negative total for non-rectification
  BR022: 'BR022', // Zero total invoice
  BR023: 'BR023', // VAT calculation mismatch

  // Invoice type validation
  BR030: 'BR030', // Simplified invoice exceeds limit
  BR031: 'BR031', // Missing recipient for F1
  BR032: 'BR032', // Invalid rectification reference

  // Tax validation
  BR040: 'BR040', // Invalid VAT rate
  BR041: 'BR041', // Missing exemption cause
  BR042: 'BR042', // Equivalence surcharge without VAT
} as const;

/**
 * Standard Spanish VAT rates
 */
const VALID_VAT_RATES = [0, 4, 5, 10, 21];

/**
 * Simplified invoice amount limit
 */
const SIMPLIFIED_INVOICE_LIMIT = 400;

/**
 * Create a business validation result
 */
function createBusinessResult(): {
  violations: BusinessViolation[];
  addError: (code: string, message: string, field?: string) => void;
  addWarning: (code: string, message: string, field?: string) => void;
  getResult: () => BusinessValidationResult;
} {
  const violations: BusinessViolation[] = [];

  return {
    violations,
    addError(code: string, message: string, field?: string) {
      violations.push({ code, message, severity: 'error', field });
    },
    addWarning(code: string, message: string, field?: string) {
      violations.push({ code, message, severity: 'warning', field });
    },
    getResult(): BusinessValidationResult {
      const errors = violations.filter((v) => v.severity === 'error');
      const warnings = violations.filter((v) => v.severity === 'warning');
      return {
        valid: errors.length === 0,
        violations,
        errors,
        warnings,
      };
    },
  };
}

/**
 * Validate NIF-related business rules
 */
function validateNifRules(invoice: Invoice, result: ReturnType<typeof createBusinessResult>): void {
  // BR001: Validate issuer NIF
  if (!isValidSpanishTaxId(invoice.issuer.taxId.value)) {
    result.addError(BusinessRules.BR001, 'Issuer NIF is invalid', 'issuer.taxId.value');
  }

  // BR003: Check if company is using personal NIF
  const issuerType = getSpanishTaxIdType(invoice.issuer.taxId.value);
  if (issuerType === 'nif') {
    result.addWarning(
      BusinessRules.BR003,
      'Issuer is using a personal NIF. Companies should use CIF.',
      'issuer.taxId.value'
    );
  }

  // BR002: Validate recipient NIFs
  if (invoice.recipients) {
    for (let i = 0; i < invoice.recipients.length; i++) {
      const recipient = invoice.recipients[i];
      if (recipient?.taxId.type === 'NIF' && !isValidSpanishTaxId(recipient.taxId.value)) {
        result.addError(
          BusinessRules.BR002,
          `Recipient ${i + 1} NIF is invalid`,
          `recipients[${i}].taxId.value`
        );
      }
    }
  }
}

/**
 * Validate date-related business rules
 */
function validateDateRules(invoice: Invoice, result: ReturnType<typeof createBusinessResult>): void {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const issueDate = invoice.id.issueDate;

  // BR010: Future issue date
  if (issueDate > today) {
    result.addError(
      BusinessRules.BR010,
      'Invoice issue date cannot be in the future',
      'id.issueDate'
    );
  }

  // BR011: Issue date too old (more than 4 years)
  const fourYearsAgo = new Date();
  fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);
  if (issueDate < fourYearsAgo) {
    result.addWarning(
      BusinessRules.BR011,
      'Invoice issue date is more than 4 years old',
      'id.issueDate'
    );
  }

  // BR012: Rectification date validation
  if (invoice.rectifiedInvoices) {
    for (const ref of invoice.rectifiedInvoices) {
      if (ref.invoiceId.issueDate > issueDate) {
        result.addError(
          BusinessRules.BR012,
          'Rectifying invoice cannot have an earlier date than the original',
          'rectifiedInvoices'
        );
        break;
      }
    }
  }
}

/**
 * Calculate total from tax breakdown
 */
function calculateTotalFromBreakdown(breakdown: TaxBreakdown): number {
  let total = 0;

  if (breakdown.vatBreakdowns) {
    for (const vat of breakdown.vatBreakdowns) {
      total += vat.taxBase + vat.vatAmount;
      if (vat.equivalenceSurchargeAmount) {
        total += vat.equivalenceSurchargeAmount;
      }
    }
  }

  if (breakdown.exemptBreakdowns) {
    for (const exempt of breakdown.exemptBreakdowns) {
      total += exempt.taxBase;
    }
  }

  if (breakdown.nonSubjectBreakdowns) {
    for (const ns of breakdown.nonSubjectBreakdowns) {
      total += ns.amount;
    }
  }

  return Math.round(total * 100) / 100;
}

/**
 * Validate amount-related business rules
 */
function validateAmountRules(invoice: Invoice, result: ReturnType<typeof createBusinessResult>): void {
  // BR020: Total matches breakdown
  const calculatedTotal = calculateTotalFromBreakdown(invoice.taxBreakdown);
  const diff = Math.abs(invoice.totalAmount - calculatedTotal);
  if (diff > 0.01) {
    result.addError(
      BusinessRules.BR020,
      `Total amount (${invoice.totalAmount}) doesn't match breakdown total (${calculatedTotal})`,
      'totalAmount'
    );
  }

  // BR021: Negative total for non-rectification
  if (invoice.totalAmount < 0 && invoice.invoiceType !== 'F3') {
    result.addError(
      BusinessRules.BR021,
      'Negative total amount is only allowed for rectification invoices (F3)',
      'totalAmount'
    );
  }

  // BR022: Zero total warning
  if (invoice.totalAmount === 0) {
    result.addWarning(
      BusinessRules.BR022,
      'Invoice has zero total amount',
      'totalAmount'
    );
  }

  // BR023: Validate VAT calculations
  if (invoice.taxBreakdown.vatBreakdowns) {
    for (let i = 0; i < invoice.taxBreakdown.vatBreakdowns.length; i++) {
      const vat = invoice.taxBreakdown.vatBreakdowns[i];
      if (!vat) continue;

      const expectedVat = Math.round(vat.taxBase * vat.vatRate) / 100;
      const vatDiff = Math.abs(vat.vatAmount - expectedVat);
      if (vatDiff > 0.01) {
        result.addError(
          BusinessRules.BR023,
          `VAT calculation mismatch in breakdown ${i + 1}: expected ${expectedVat}, got ${vat.vatAmount}`,
          `taxBreakdown.vatBreakdowns[${i}].vatAmount`
        );
      }
    }
  }
}

/**
 * Validate invoice type-related business rules
 */
function validateInvoiceTypeRules(invoice: Invoice, result: ReturnType<typeof createBusinessResult>): void {
  // BR030: Simplified invoice amount limit
  if (invoice.invoiceType === 'F2' && invoice.totalAmount > SIMPLIFIED_INVOICE_LIMIT) {
    result.addWarning(
      BusinessRules.BR030,
      `Simplified invoice (F2) exceeds ${SIMPLIFIED_INVOICE_LIMIT}€ limit. Consider using F1.`,
      'invoiceType'
    );
  }

  // BR031: F1 invoices should have a recipient
  if (invoice.invoiceType === 'F1' && (!invoice.recipients || invoice.recipients.length === 0)) {
    result.addWarning(
      BusinessRules.BR031,
      'Standard invoice (F1) should have a recipient',
      'recipients'
    );
  }

  // BR032: Rectification without references
  if (invoice.invoiceType === 'F3') {
    if (!invoice.rectifiedInvoices || invoice.rectifiedInvoices.length === 0) {
      result.addError(
        BusinessRules.BR032,
        'Rectification invoice (F3) must reference the original invoice(s)',
        'rectifiedInvoices'
      );
    }
    if (!invoice.rectifiedInvoiceType) {
      result.addError(
        BusinessRules.BR032,
        'Rectification invoice (F3) must specify rectification type (S or I)',
        'rectifiedInvoiceType'
      );
    }
  }
}

/**
 * Validate tax-related business rules
 */
function validateTaxRules(invoice: Invoice, result: ReturnType<typeof createBusinessResult>): void {
  if (invoice.taxBreakdown.vatBreakdowns) {
    for (let i = 0; i < invoice.taxBreakdown.vatBreakdowns.length; i++) {
      const vat = invoice.taxBreakdown.vatBreakdowns[i];
      if (!vat) continue;

      // BR040: Validate VAT rate
      if (!VALID_VAT_RATES.includes(vat.vatRate)) {
        result.addWarning(
          BusinessRules.BR040,
          `Non-standard VAT rate ${vat.vatRate}% in breakdown ${i + 1}`,
          `taxBreakdown.vatBreakdowns[${i}].vatRate`
        );
      }

      // BR042: Equivalence surcharge without VAT
      if (vat.equivalenceSurchargeAmount && vat.vatAmount === 0) {
        result.addError(
          BusinessRules.BR042,
          'Equivalence surcharge cannot be applied without VAT',
          `taxBreakdown.vatBreakdowns[${i}]`
        );
      }
    }
  }

  // BR041: Exempt operations without cause
  if (invoice.taxBreakdown.exemptBreakdowns) {
    for (let i = 0; i < invoice.taxBreakdown.exemptBreakdowns.length; i++) {
      const exempt = invoice.taxBreakdown.exemptBreakdowns[i];
      if (exempt && !exempt.cause) {
        result.addError(
          BusinessRules.BR041,
          `Exempt breakdown ${i + 1} is missing exemption cause`,
          `taxBreakdown.exemptBreakdowns[${i}].cause`
        );
      }
    }
  }
}

/**
 * Validate invoice against business rules
 */
export function validateInvoiceBusinessRules(invoice: Invoice): BusinessValidationResult {
  const result = createBusinessResult();

  validateNifRules(invoice, result);
  validateDateRules(invoice, result);
  validateAmountRules(invoice, result);
  validateInvoiceTypeRules(invoice, result);
  validateTaxRules(invoice, result);

  return result.getResult();
}

/**
 * Validate cancellation against business rules
 */
export function validateCancellationBusinessRules(cancellation: InvoiceCancellation): BusinessValidationResult {
  const result = createBusinessResult();

  // Validate issuer NIF
  if (!isValidSpanishTaxId(cancellation.issuer.taxId.value)) {
    result.addError(BusinessRules.BR001, 'Issuer NIF is invalid', 'issuer.taxId.value');
  }

  // Validate issue date is not in the future
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (cancellation.invoiceId.issueDate > today) {
    result.addError(
      BusinessRules.BR010,
      'Original invoice date cannot be in the future',
      'invoiceId.issueDate'
    );
  }

  return result.getResult();
}

/**
 * Combined validator: schema + business rules
 */
export function validateInvoiceFull(invoice: Invoice): {
  valid: boolean;
  schemaErrors: import('../errors/validation-errors.js').SchemaViolation[];
  businessErrors: BusinessViolation[];
  warnings: BusinessViolation[];
} {
  // Import inline to avoid circular dependency
  const { validateInvoice } = require('./schema-validator.js') as {
    validateInvoice: (invoice: Invoice) => import('./schema-validator.js').ValidationResult;
  };

  const schemaResult = validateInvoice(invoice);
  const businessResult = validateInvoiceBusinessRules(invoice);

  return {
    valid: schemaResult.valid && businessResult.valid,
    schemaErrors: schemaResult.violations,
    businessErrors: businessResult.errors,
    warnings: businessResult.warnings,
  };
}
