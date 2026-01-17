/**
 * Validation-related errors
 */

import { VerifactuError, ErrorCode, type ErrorContext } from './base-error.js';

/**
 * Base class for validation errors
 */
export class ValidationError extends VerifactuError {
  constructor(message: string, code: ErrorCode = ErrorCode.VALIDATION_ERROR, context?: ErrorContext) {
    super(message, code, { context });
    this.name = 'ValidationError';
  }
}

/**
 * Invalid NIF/CIF error
 */
export class InvalidNifError extends ValidationError {
  constructor(nif: string, reason?: string) {
    const message = reason
      ? `Invalid NIF/CIF '${nif}': ${reason}`
      : `Invalid NIF/CIF '${nif}'`;
    super(message, ErrorCode.INVALID_NIF, {
      field: 'nif',
      value: nif,
      expected: 'Valid Spanish NIF/CIF/NIE',
    });
    this.name = 'InvalidNifError';
  }
}

/**
 * Missing required field error
 */
export class MissingFieldError extends ValidationError {
  constructor(fieldName: string, parentPath?: string) {
    const path = parentPath ? `${parentPath}.${fieldName}` : fieldName;
    super(`Missing required field: ${path}`, ErrorCode.MISSING_REQUIRED_FIELD, {
      field: path,
    });
    this.name = 'MissingFieldError';
  }
}

/**
 * Invalid date error
 */
export class InvalidDateError extends ValidationError {
  constructor(field: string, value: unknown, reason?: string) {
    const message = reason
      ? `Invalid date for '${field}': ${reason}`
      : `Invalid date for '${field}'`;
    super(message, ErrorCode.INVALID_DATE, {
      field,
      value,
      expected: 'Valid Date object or ISO date string',
    });
    this.name = 'InvalidDateError';
  }
}

/**
 * Invalid amount error
 */
export class InvalidAmountError extends ValidationError {
  constructor(field: string, value: unknown, reason?: string) {
    const message = reason
      ? `Invalid amount for '${field}': ${reason}`
      : `Invalid amount for '${field}'`;
    super(message, ErrorCode.INVALID_AMOUNT, {
      field,
      value,
      expected: 'Valid numeric amount with max 2 decimal places',
    });
    this.name = 'InvalidAmountError';
  }
}

/**
 * Invalid invoice type error
 */
export class InvalidInvoiceTypeError extends ValidationError {
  constructor(type: string) {
    super(`Invalid invoice type: ${type}`, ErrorCode.INVALID_INVOICE_TYPE, {
      field: 'invoiceType',
      value: type,
      expected: 'F1, F2, F3, R1, R2, R3, R4, or R5',
    });
    this.name = 'InvalidInvoiceTypeError';
  }
}

/**
 * Invalid tax breakdown error
 */
export class InvalidTaxBreakdownError extends ValidationError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(`Invalid tax breakdown: ${reason}`, ErrorCode.INVALID_TAX_BREAKDOWN, {
      field: 'taxBreakdown',
      details,
    });
    this.name = 'InvalidTaxBreakdownError';
  }
}

/**
 * Schema validation error
 */
export class SchemaValidationError extends ValidationError {
  readonly violations: readonly SchemaViolation[];

  constructor(violations: readonly SchemaViolation[]) {
    const message =
      violations.length === 1
        ? `Schema validation error: ${violations[0]?.message ?? 'Unknown error'}`
        : `Schema validation failed with ${violations.length} errors`;
    super(message, ErrorCode.SCHEMA_VALIDATION_ERROR, {
      details: { violationCount: violations.length },
    });
    this.name = 'SchemaValidationError';
    this.violations = violations;
  }
}

/**
 * Single schema violation
 */
export interface SchemaViolation {
  /** Path to the invalid element */
  path: string;
  /** Error message */
  message: string;
  /** Expected value or type */
  expected?: string;
  /** Actual value */
  actual?: unknown;
}

/**
 * Invalid invoice number error
 */
export class InvalidInvoiceNumberError extends ValidationError {
  constructor(number: string, reason?: string) {
    const message = reason
      ? `Invalid invoice number '${number}': ${reason}`
      : `Invalid invoice number '${number}'`;
    super(message, ErrorCode.INVALID_INVOICE_NUMBER, {
      field: 'invoiceNumber',
      value: number,
      expected: 'Alphanumeric string, max 20 characters',
    });
    this.name = 'InvalidInvoiceNumberError';
  }
}

/**
 * Invalid series error
 */
export class InvalidSeriesError extends ValidationError {
  constructor(series: string, reason?: string) {
    const message = reason
      ? `Invalid invoice series '${series}': ${reason}`
      : `Invalid invoice series '${series}'`;
    super(message, ErrorCode.INVALID_SERIES, {
      field: 'series',
      value: series,
      expected: 'Alphanumeric string, max 20 characters',
    });
    this.name = 'InvalidSeriesError';
  }
}
