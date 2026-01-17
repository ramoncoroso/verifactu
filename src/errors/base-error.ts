/**
 * Base error class for Verifactu errors
 */

/**
 * Error codes for Verifactu operations
 */
export const ErrorCode = {
  // Validation errors (1xxx)
  VALIDATION_ERROR: 'VF1000',
  INVALID_NIF: 'VF1001',
  INVALID_INVOICE_TYPE: 'VF1002',
  INVALID_DATE: 'VF1003',
  INVALID_AMOUNT: 'VF1004',
  MISSING_REQUIRED_FIELD: 'VF1005',
  INVALID_TAX_BREAKDOWN: 'VF1006',
  SCHEMA_VALIDATION_ERROR: 'VF1007',
  INVALID_INVOICE_NUMBER: 'VF1008',
  INVALID_SERIES: 'VF1009',

  // Crypto errors (2xxx)
  HASH_ERROR: 'VF2000',
  CHAIN_ERROR: 'VF2001',
  CERTIFICATE_ERROR: 'VF2002',
  SIGNATURE_ERROR: 'VF2003',
  CERTIFICATE_EXPIRED: 'VF2004',
  CERTIFICATE_NOT_FOUND: 'VF2005',
  INVALID_CERTIFICATE_FORMAT: 'VF2006',

  // XML errors (3xxx)
  XML_BUILD_ERROR: 'VF3000',
  XML_PARSE_ERROR: 'VF3001',
  XML_TEMPLATE_ERROR: 'VF3002',

  // Network/SOAP errors (4xxx)
  NETWORK_ERROR: 'VF4000',
  SOAP_ERROR: 'VF4001',
  TIMEOUT_ERROR: 'VF4002',
  CONNECTION_ERROR: 'VF4003',
  SSL_ERROR: 'VF4004',

  // AEAT response errors (5xxx)
  AEAT_ERROR: 'VF5000',
  AEAT_REJECTED: 'VF5001',
  AEAT_PARTIAL_ACCEPT: 'VF5002',
  AEAT_SERVICE_UNAVAILABLE: 'VF5003',
  AEAT_AUTHENTICATION_ERROR: 'VF5004',

  // QR errors (6xxx)
  QR_GENERATION_ERROR: 'VF6000',
  QR_DATA_TOO_LARGE: 'VF6001',

  // General errors (9xxx)
  UNKNOWN_ERROR: 'VF9000',
  INTERNAL_ERROR: 'VF9001',
  NOT_IMPLEMENTED: 'VF9002',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Error context with additional information
 */
export interface ErrorContext {
  /** Field that caused the error */
  field?: string;
  /** Value that caused the error */
  value?: unknown;
  /** Expected value or format */
  expected?: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Retry information for recoverable errors
 */
export interface RetryInfo {
  /** Whether the error is retryable */
  retryable: boolean;
  /** Suggested delay before retry in milliseconds */
  retryAfterMs?: number;
  /** Maximum number of retries */
  maxRetries?: number;
}

/**
 * Base error class for all Verifactu errors
 */
export class VerifactuError extends Error {
  /** Error code */
  readonly code: ErrorCode;
  /** Error context */
  readonly context?: ErrorContext;
  /** Retry information */
  readonly retry?: RetryInfo;
  /** Original error if this wraps another error */
  readonly cause?: Error;
  /** Timestamp when error occurred */
  readonly timestamp: Date;

  constructor(
    message: string,
    code: ErrorCode,
    options?: {
      context?: ErrorContext;
      retry?: RetryInfo;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'VerifactuError';
    this.code = code;
    this.context = options?.context;
    this.retry = options?.retry;
    this.cause = options?.cause;
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, VerifactuError);
    }
  }

  /**
   * Check if this error is retryable
   */
  isRetryable(): boolean {
    return this.retry?.retryable ?? false;
  }

  /**
   * Create a formatted error message with context
   */
  toDetailedString(): string {
    const parts = [`[${this.code}] ${this.message}`];

    if (this.context?.field) {
      parts.push(`Field: ${this.context.field}`);
    }
    if (this.context?.value !== undefined) {
      parts.push(`Value: ${JSON.stringify(this.context.value)}`);
    }
    if (this.context?.expected) {
      parts.push(`Expected: ${this.context.expected}`);
    }
    if (this.cause) {
      parts.push(`Caused by: ${this.cause.message}`);
    }

    return parts.join(' | ');
  }

  /**
   * Convert error to JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      retry: this.retry,
      timestamp: this.timestamp.toISOString(),
      cause: this.cause?.message,
    };
  }
}
