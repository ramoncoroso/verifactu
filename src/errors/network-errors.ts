/**
 * Network and SOAP-related errors
 */

import { VerifactuError, ErrorCode, type RetryInfo } from './base-error.js';

/**
 * Default retry configuration for network errors
 */
const DEFAULT_RETRY_INFO: RetryInfo = {
  retryable: true,
  retryAfterMs: 1000,
  maxRetries: 3,
};

/**
 * Base class for network errors
 */
export class NetworkError extends VerifactuError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.NETWORK_ERROR,
    options?: {
      cause?: Error;
      retry?: RetryInfo;
    }
  ) {
    super(message, code, {
      retry: options?.retry ?? DEFAULT_RETRY_INFO,
      cause: options?.cause,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Connection error
 */
export class ConnectionError extends NetworkError {
  constructor(host: string, cause?: Error) {
    super(`Failed to connect to ${host}`, ErrorCode.CONNECTION_ERROR, {
      cause,
      retry: DEFAULT_RETRY_INFO,
    });
    this.name = 'ConnectionError';
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends NetworkError {
  readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, ErrorCode.TIMEOUT_ERROR, {
      retry: {
        retryable: true,
        retryAfterMs: Math.min(timeoutMs, 5000),
        maxRetries: 2,
      },
    });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * SSL/TLS error
 */
export class SslError extends NetworkError {
  constructor(reason: string, cause?: Error) {
    super(`SSL/TLS error: ${reason}`, ErrorCode.SSL_ERROR, {
      cause,
      retry: { retryable: false },
    });
    this.name = 'SslError';
  }
}

/**
 * SOAP protocol error
 */
export class SoapError extends NetworkError {
  readonly soapFaultCode?: string;
  readonly soapFaultString?: string;

  constructor(
    message: string,
    options?: {
      faultCode?: string;
      faultString?: string;
      cause?: Error;
    }
  ) {
    super(message, ErrorCode.SOAP_ERROR, {
      cause: options?.cause,
      retry: { retryable: false },
    });
    this.name = 'SoapError';
    this.soapFaultCode = options?.faultCode;
    this.soapFaultString = options?.faultString;
  }

  static fromFault(faultCode: string, faultString: string): SoapError {
    return new SoapError(`SOAP Fault: [${faultCode}] ${faultString}`, {
      faultCode,
      faultString,
    });
  }
}

/**
 * AEAT service error
 */
export class AeatError extends VerifactuError {
  readonly aeatCode?: string;
  readonly aeatDescription?: string;
  readonly registryState?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.AEAT_ERROR,
    options?: {
      aeatCode?: string;
      aeatDescription?: string;
      registryState?: string;
      retry?: RetryInfo;
    }
  ) {
    super(message, code, {
      context: {
        details: {
          aeatCode: options?.aeatCode,
          aeatDescription: options?.aeatDescription,
          registryState: options?.registryState,
        },
      },
      retry: options?.retry,
    });
    this.name = 'AeatError';
    this.aeatCode = options?.aeatCode;
    this.aeatDescription = options?.aeatDescription;
    this.registryState = options?.registryState;
  }
}

/**
 * AEAT rejected record error
 */
export class AeatRejectedError extends AeatError {
  constructor(
    aeatCode: string,
    aeatDescription: string,
    details?: {
      registryId?: string;
      invoiceNumber?: string;
    }
  ) {
    super(
      `Record rejected by AEAT: [${aeatCode}] ${aeatDescription}`,
      ErrorCode.AEAT_REJECTED,
      {
        aeatCode,
        aeatDescription,
        registryState: 'Rechazado',
        retry: { retryable: false },
      }
    );
    this.name = 'AeatRejectedError';
  }
}

/**
 * AEAT service unavailable error
 */
export class AeatServiceUnavailableError extends AeatError {
  constructor(cause?: Error) {
    super('AEAT service is temporarily unavailable', ErrorCode.AEAT_SERVICE_UNAVAILABLE, {
      retry: {
        retryable: true,
        retryAfterMs: 30000,
        maxRetries: 5,
      },
    });
    this.name = 'AeatServiceUnavailableError';
  }
}

/**
 * AEAT authentication error
 */
export class AeatAuthenticationError extends AeatError {
  constructor(reason: string) {
    super(`AEAT authentication failed: ${reason}`, ErrorCode.AEAT_AUTHENTICATION_ERROR, {
      retry: { retryable: false },
    });
    this.name = 'AeatAuthenticationError';
  }
}
