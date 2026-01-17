/**
 * Cryptography-related errors
 */

import { VerifactuError, ErrorCode, type ErrorContext } from './base-error.js';

/**
 * Base class for cryptographic errors
 */
export class CryptoError extends VerifactuError {
  constructor(message: string, code: ErrorCode = ErrorCode.HASH_ERROR, context?: ErrorContext, cause?: Error) {
    super(message, code, { context, cause });
    this.name = 'CryptoError';
  }
}

/**
 * Hash calculation error
 */
export class HashError extends CryptoError {
  constructor(reason: string, cause?: Error) {
    super(`Hash calculation failed: ${reason}`, ErrorCode.HASH_ERROR, { details: { reason } }, cause);
    this.name = 'HashError';
  }
}

/**
 * Chain calculation error
 */
export class ChainError extends CryptoError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(`Chain calculation failed: ${reason}`, ErrorCode.CHAIN_ERROR, { details });
    this.name = 'ChainError';
  }
}

/**
 * Certificate error
 */
export class CertificateError extends CryptoError {
  constructor(message: string, code: ErrorCode = ErrorCode.CERTIFICATE_ERROR, context?: ErrorContext) {
    super(message, code, context);
    this.name = 'CertificateError';
  }
}

/**
 * Certificate not found error
 */
export class CertificateNotFoundError extends CertificateError {
  constructor(path: string) {
    super(`Certificate not found: ${path}`, ErrorCode.CERTIFICATE_NOT_FOUND, {
      field: 'certificate.path',
      value: path,
    });
    this.name = 'CertificateNotFoundError';
  }
}

/**
 * Certificate expired error
 */
export class CertificateExpiredError extends CertificateError {
  readonly expirationDate: Date;

  constructor(expirationDate: Date) {
    super(
      `Certificate expired on ${expirationDate.toISOString()}`,
      ErrorCode.CERTIFICATE_EXPIRED,
      { details: { expirationDate: expirationDate.toISOString() } }
    );
    this.name = 'CertificateExpiredError';
    this.expirationDate = expirationDate;
  }
}

/**
 * Invalid certificate format error
 */
export class InvalidCertificateFormatError extends CertificateError {
  constructor(format: string, expected: string) {
    super(
      `Invalid certificate format: expected ${expected}, got ${format}`,
      ErrorCode.INVALID_CERTIFICATE_FORMAT,
      { value: format, expected }
    );
    this.name = 'InvalidCertificateFormatError';
  }
}

/**
 * Signature error
 */
export class SignatureError extends CryptoError {
  constructor(reason: string, cause?: Error) {
    super(`Signature operation failed: ${reason}`, ErrorCode.SIGNATURE_ERROR, { details: { reason } }, cause);
    this.name = 'SignatureError';
  }
}
