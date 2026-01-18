/**
 * Verifactu - TypeScript library for Spanish AEAT invoice verification
 *
 * @packageDocumentation
 */

// Models and types
export * from './models/index.js';

// Errors
export * from './errors/index.js';

// Validation
export * from './validation/index.js';

// XML utilities
export * from './xml/index.js';

// Cryptographic utilities
export * from './crypto/index.js';

// QR code generation
export * from './qr/index.js';

// Client
export * from './client/index.js';

// Fluent builders
export * from './builders/index.js';

// Re-export main classes and functions for convenience
export { VerifactuClient, createVerifactuClient } from './client/verifactu-client.js';
export { withRetry, withRetryAndMetadata, type RetryOptions, type RetryResult } from './client/retry.js';
export { InvoiceBuilder, createInvoiceBuilder, quickInvoice } from './builders/invoice-builder.js';
export { RecordChain } from './crypto/chain.js';
export { QrGenerator, createQrGenerator, generateQrCode } from './qr/generator.js';
export {
  validateInvoice,
  validateCancellation,
  assertValidInvoice,
  assertValidCancellation,
} from './validation/schema-validator.js';
export {
  validateInvoiceBusinessRules,
  validateCancellationBusinessRules,
} from './validation/business-validator.js';
export {
  validateSpanishTaxId,
  isValidSpanishTaxId,
  assertValidSpanishTaxId,
} from './validation/nif-validator.js';
