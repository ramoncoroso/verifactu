/**
 * QR code generation errors
 */

import { VerifactuError, ErrorCode } from './base-error.js';

/**
 * QR generation error
 */
export class QrGenerationError extends VerifactuError {
  constructor(reason: string, cause?: Error) {
    super(`QR code generation failed: ${reason}`, ErrorCode.QR_GENERATION_ERROR, {
      context: { details: { reason } },
      cause,
    });
    this.name = 'QrGenerationError';
  }
}

/**
 * QR data too large error
 */
export class QrDataTooLargeError extends VerifactuError {
  readonly dataSize: number;
  readonly maxSize: number;

  constructor(dataSize: number, maxSize: number) {
    super(
      `QR data too large: ${dataSize} bytes exceeds maximum ${maxSize} bytes`,
      ErrorCode.QR_DATA_TOO_LARGE,
      {
        context: {
          details: { dataSize, maxSize },
        },
      }
    );
    this.name = 'QrDataTooLargeError';
    this.dataSize = dataSize;
    this.maxSize = maxSize;
  }
}
