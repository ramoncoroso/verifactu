/**
 * Tests for Error Classes
 */

import { describe, it, expect } from 'vitest';
import { VerifactuError, ErrorCode } from '../../src/errors/base-error.js';
import {
  ValidationError,
  InvalidNifError,
  MissingFieldError,
  InvalidDateError,
  InvalidAmountError,
  InvalidInvoiceTypeError,
  InvalidTaxBreakdownError,
  SchemaValidationError,
  InvalidInvoiceNumberError,
  InvalidSeriesError,
} from '../../src/errors/validation-errors.js';
import {
  NetworkError,
  ConnectionError,
  TimeoutError,
  SslError,
  SoapError,
  AeatError,
  AeatRejectedError,
  AeatServiceUnavailableError,
  AeatAuthenticationError,
} from '../../src/errors/network-errors.js';
import {
  CryptoError,
  HashError,
  ChainError,
  CertificateError,
  CertificateNotFoundError,
  CertificateExpiredError,
  SignatureError,
  InvalidCertificateFormatError,
} from '../../src/errors/crypto-errors.js';
import { XmlError, XmlParseError, XmlBuildError, XmlTemplateError } from '../../src/errors/xml-errors.js';
import { QrGenerationError, QrDataTooLargeError } from '../../src/errors/qr-errors.js';

describe('Error Classes', () => {
  describe('VerifactuError (base)', () => {
    it('should create error with message and code', () => {
      const error = new VerifactuError('Test error', ErrorCode.INTERNAL_ERROR);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.name).toBe('VerifactuError');
    });

    it('should have timestamp', () => {
      const before = new Date();
      const error = new VerifactuError('Test', ErrorCode.INTERNAL_ERROR);
      const after = new Date();

      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should support cause', () => {
      const cause = new Error('Original error');
      const error = new VerifactuError('Wrapped error', ErrorCode.INTERNAL_ERROR, { cause });

      expect(error.cause).toBe(cause);
    });

    it('should support retry info', () => {
      const error = new VerifactuError('Test', ErrorCode.INTERNAL_ERROR, {
        retry: {
          retryable: true,
          retryAfterMs: 1000,
          maxRetries: 3,
        },
      });

      expect(error.isRetryable()).toBe(true);
      expect(error.retry?.retryAfterMs).toBe(1000);
    });

    it('should be instance of Error', () => {
      const error = new VerifactuError('Test', ErrorCode.INTERNAL_ERROR);
      expect(error).toBeInstanceOf(Error);
    });

    it('should return false for isRetryable when no retry info', () => {
      const error = new VerifactuError('Test', ErrorCode.INTERNAL_ERROR);
      expect(error.isRetryable()).toBe(false);
    });

    describe('toDetailedString', () => {
      it('should format basic error', () => {
        const error = new VerifactuError('Test error', ErrorCode.INTERNAL_ERROR);
        const detailed = error.toDetailedString();

        expect(detailed).toContain('[VF9001]');
        expect(detailed).toContain('Test error');
      });

      it('should include field when present', () => {
        const error = new VerifactuError('Test', ErrorCode.INTERNAL_ERROR, {
          context: { field: 'issuer.nif' },
        });
        const detailed = error.toDetailedString();

        expect(detailed).toContain('Field: issuer.nif');
      });

      it('should include value when present', () => {
        const error = new VerifactuError('Test', ErrorCode.INTERNAL_ERROR, {
          context: { value: 'invalid-value' },
        });
        const detailed = error.toDetailedString();

        expect(detailed).toContain('Value: "invalid-value"');
      });

      it('should include expected when present', () => {
        const error = new VerifactuError('Test', ErrorCode.INTERNAL_ERROR, {
          context: { expected: 'valid NIF' },
        });
        const detailed = error.toDetailedString();

        expect(detailed).toContain('Expected: valid NIF');
      });

      it('should include cause when present', () => {
        const cause = new Error('Original error');
        const error = new VerifactuError('Test', ErrorCode.INTERNAL_ERROR, { cause });
        const detailed = error.toDetailedString();

        expect(detailed).toContain('Caused by: Original error');
      });

      it('should include all parts when all present', () => {
        const cause = new Error('Root cause');
        const error = new VerifactuError('Test', ErrorCode.INTERNAL_ERROR, {
          context: {
            field: 'nif',
            value: 'BAD',
            expected: 'valid NIF',
          },
          cause,
        });
        const detailed = error.toDetailedString();

        expect(detailed).toContain('[VF9001]');
        expect(detailed).toContain('Field: nif');
        expect(detailed).toContain('Value: "BAD"');
        expect(detailed).toContain('Expected: valid NIF');
        expect(detailed).toContain('Caused by: Root cause');
      });
    });

    describe('toJSON', () => {
      it('should serialize error to JSON', () => {
        const cause = new Error('Original');
        const error = new VerifactuError('Test error', ErrorCode.INTERNAL_ERROR, {
          context: { field: 'test', value: 123 },
          retry: { retryable: true, retryAfterMs: 1000 },
          cause,
        });

        const json = error.toJSON();

        expect(json.name).toBe('VerifactuError');
        expect(json.code).toBe('VF9001');
        expect(json.message).toBe('Test error');
        expect(json.context).toEqual({ field: 'test', value: 123 });
        expect(json.retry).toEqual({ retryable: true, retryAfterMs: 1000 });
        expect(json.cause).toBe('Original');
        expect(json.timestamp).toBeDefined();
      });

      it('should handle error without optional fields', () => {
        const error = new VerifactuError('Simple', ErrorCode.UNKNOWN_ERROR);
        const json = error.toJSON();

        expect(json.name).toBe('VerifactuError');
        expect(json.code).toBe('VF9000');
        expect(json.message).toBe('Simple');
        expect(json.context).toBeUndefined();
        expect(json.retry).toBeUndefined();
        expect(json.cause).toBeUndefined();
      });
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input');

      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.name).toBe('ValidationError');
    });

    it('should support custom code', () => {
      const error = new ValidationError('Invalid', ErrorCode.INVALID_NIF);
      expect(error.code).toBe(ErrorCode.INVALID_NIF);
    });
  });

  describe('MissingFieldError', () => {
    it('should create missing field error', () => {
      const error = new MissingFieldError('email');

      expect(error.message).toContain('email');
      expect(error.message).toContain('required');
      expect(error.code).toBe(ErrorCode.MISSING_REQUIRED_FIELD);
    });

    it('should support parent path', () => {
      const error = new MissingFieldError('street', 'address');
      expect(error.message).toContain('address.street');
    });
  });

  describe('InvalidNifError', () => {
    it('should create NIF error', () => {
      const error = new InvalidNifError('123', 'Invalid format');

      expect(error.message).toContain('NIF');
      expect(error.message).toContain('123');
      expect(error.code).toBe(ErrorCode.INVALID_NIF);
    });

    it('should work without reason', () => {
      const error = new InvalidNifError('ABC');
      expect(error.message).toContain('ABC');
    });
  });

  describe('InvalidDateError', () => {
    it('should create date error with reason', () => {
      const error = new InvalidDateError('issueDate', 'not-a-date', 'Must be valid');

      expect(error.message).toContain('issueDate');
      expect(error.message).toContain('Must be valid');
      expect(error.code).toBe(ErrorCode.INVALID_DATE);
    });

    it('should create date error without reason', () => {
      const error = new InvalidDateError('issueDate', 'invalid');

      expect(error.message).toContain('issueDate');
      expect(error.code).toBe(ErrorCode.INVALID_DATE);
    });
  });

  describe('InvalidAmountError', () => {
    it('should create amount error with reason', () => {
      const error = new InvalidAmountError('total', 'not-a-number', 'Must be numeric');

      expect(error.message).toContain('total');
      expect(error.message).toContain('Must be numeric');
      expect(error.code).toBe(ErrorCode.INVALID_AMOUNT);
    });

    it('should create amount error without reason', () => {
      const error = new InvalidAmountError('total', 'invalid');

      expect(error.message).toContain('total');
      expect(error.code).toBe(ErrorCode.INVALID_AMOUNT);
    });
  });

  describe('InvalidInvoiceTypeError', () => {
    it('should create invoice type error', () => {
      const error = new InvalidInvoiceTypeError('XX');

      expect(error.message).toContain('XX');
      expect(error.code).toBe(ErrorCode.INVALID_INVOICE_TYPE);
      expect(error.name).toBe('InvalidInvoiceTypeError');
    });
  });

  describe('InvalidTaxBreakdownError', () => {
    it('should create tax breakdown error', () => {
      const error = new InvalidTaxBreakdownError('VAT mismatch', { expected: 21, actual: 10 });

      expect(error.message).toContain('VAT mismatch');
      expect(error.code).toBe(ErrorCode.INVALID_TAX_BREAKDOWN);
      expect(error.name).toBe('InvalidTaxBreakdownError');
    });

    it('should work without details', () => {
      const error = new InvalidTaxBreakdownError('Missing breakdown');
      expect(error.message).toContain('Missing breakdown');
    });
  });

  describe('SchemaValidationError', () => {
    it('should create schema error with violations', () => {
      const error = new SchemaValidationError([
        { path: 'issuer.nif', message: 'Required' },
        { path: 'total', message: 'Must be positive' },
      ]);

      expect(error.violations).toHaveLength(2);
      expect(error.code).toBe(ErrorCode.SCHEMA_VALIDATION_ERROR);
    });

    it('should handle single violation', () => {
      const error = new SchemaValidationError([
        { path: 'nif', message: 'Invalid' },
      ]);

      expect(error.message).toContain('Invalid');
    });

    it('should handle undefined violation', () => {
      const error = new SchemaValidationError([
        { path: 'field' } as any,
      ]);

      expect(error.message).toContain('Unknown error');
    });
  });

  describe('InvalidInvoiceNumberError', () => {
    it('should create invoice number error with reason', () => {
      const error = new InvalidInvoiceNumberError('ABC@123', 'Invalid characters');

      expect(error.message).toContain('ABC@123');
      expect(error.message).toContain('Invalid characters');
      expect(error.code).toBe(ErrorCode.INVALID_INVOICE_NUMBER);
      expect(error.name).toBe('InvalidInvoiceNumberError');
    });

    it('should create invoice number error without reason', () => {
      const error = new InvalidInvoiceNumberError('TOOLONG12345678901234567890');

      expect(error.message).toContain('TOOLONG12345678901234567890');
      expect(error.code).toBe(ErrorCode.INVALID_INVOICE_NUMBER);
    });
  });

  describe('InvalidSeriesError', () => {
    it('should create series error with reason', () => {
      const error = new InvalidSeriesError('INVALID@SERIES', 'Contains invalid characters');

      expect(error.message).toContain('INVALID@SERIES');
      expect(error.message).toContain('Contains invalid characters');
      expect(error.code).toBe(ErrorCode.INVALID_SERIES);
      expect(error.name).toBe('InvalidSeriesError');
    });

    it('should create series error without reason', () => {
      const error = new InvalidSeriesError('TOOLONGSERIES123456789');

      expect(error.message).toContain('TOOLONGSERIES123456789');
      expect(error.code).toBe(ErrorCode.INVALID_SERIES);
    });
  });

  describe('NetworkError', () => {
    it('should be retryable by default', () => {
      const error = new NetworkError('Connection failed');

      expect(error.isRetryable()).toBe(true);
    });
  });

  describe('ConnectionError', () => {
    it('should include host in message', () => {
      const error = new ConnectionError('api.example.com');

      expect(error.message).toContain('api.example.com');
      expect(error.code).toBe(ErrorCode.CONNECTION_ERROR);
    });
  });

  describe('TimeoutError', () => {
    it('should include operation and timeout in message', () => {
      const error = new TimeoutError('fetch', 5000);

      expect(error.message).toContain('fetch');
      expect(error.message).toContain('5000');
      expect(error.timeoutMs).toBe(5000);
      expect(error.isRetryable()).toBe(true);
    });
  });

  describe('SslError', () => {
    it('should not be retryable', () => {
      const error = new SslError('Certificate expired');

      expect(error.isRetryable()).toBe(false);
      expect(error.code).toBe(ErrorCode.SSL_ERROR);
    });
  });

  describe('SoapError', () => {
    it('should include fault info', () => {
      const error = new SoapError('SOAP fault', {
        faultCode: 'Server',
        faultString: 'Internal error',
      });

      expect(error.soapFaultCode).toBe('Server');
      expect(error.soapFaultString).toBe('Internal error');
    });

    it('should create from fault', () => {
      const error = SoapError.fromFault('Client', 'Bad request');

      expect(error.soapFaultCode).toBe('Client');
      expect(error.soapFaultString).toBe('Bad request');
      expect(error.message).toContain('Client');
      expect(error.message).toContain('Bad request');
    });
  });

  describe('AeatError', () => {
    it('should include AEAT-specific info', () => {
      const error = new AeatError('AEAT error', ErrorCode.AEAT_ERROR, {
        aeatCode: '001',
        aeatDescription: 'Error description',
        registryState: 'Rechazado',
      });

      expect(error.aeatCode).toBe('001');
      expect(error.aeatDescription).toBe('Error description');
      expect(error.registryState).toBe('Rechazado');
    });
  });

  describe('AeatRejectedError', () => {
    it('should not be retryable', () => {
      const error = new AeatRejectedError('001', 'Rejected');

      expect(error.isRetryable()).toBe(false);
      expect(error.registryState).toBe('Rechazado');
    });
  });

  describe('AeatServiceUnavailableError', () => {
    it('should be retryable with delay', () => {
      const error = new AeatServiceUnavailableError();

      expect(error.isRetryable()).toBe(true);
      expect(error.retry?.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe('CryptoError', () => {
    it('should create crypto error', () => {
      const error = new CryptoError('Crypto failed');

      expect(error.code).toBe(ErrorCode.HASH_ERROR);
    });
  });

  describe('HashError', () => {
    it('should include reason', () => {
      const error = new HashError('Invalid input');

      expect(error.message).toContain('Hash');
      expect(error.message).toContain('Invalid input');
    });
  });

  describe('ChainError', () => {
    it('should include reason', () => {
      const error = new ChainError('Chain broken');

      expect(error.message).toContain('Chain');
      expect(error.code).toBe(ErrorCode.CHAIN_ERROR);
    });
  });

  describe('CertificateError', () => {
    it('should create certificate error', () => {
      const error = new CertificateError('Certificate invalid');

      expect(error.code).toBe(ErrorCode.CERTIFICATE_ERROR);
    });
  });

  describe('CertificateNotFoundError', () => {
    it('should include path', () => {
      const error = new CertificateNotFoundError('/path/to/cert.pfx');

      expect(error.message).toContain('/path/to/cert.pfx');
      expect(error.code).toBe(ErrorCode.CERTIFICATE_NOT_FOUND);
    });
  });

  describe('CertificateExpiredError', () => {
    it('should include expiration date', () => {
      const date = new Date('2024-01-01');
      const error = new CertificateExpiredError(date);

      expect(error.expirationDate).toEqual(date);
      expect(error.message).toContain('2024');
    });
  });

  describe('SignatureError', () => {
    it('should include reason', () => {
      const error = new SignatureError('Invalid signature');

      expect(error.message).toContain('Signature');
      expect(error.code).toBe(ErrorCode.SIGNATURE_ERROR);
    });
  });

  describe('XmlError', () => {
    it('should create base XML error', () => {
      const error = new XmlError('XML error');

      expect(error.code).toBe(ErrorCode.XML_BUILD_ERROR);
      expect(error.name).toBe('XmlError');
    });

    it('should support custom code', () => {
      const error = new XmlError('Parse failed', ErrorCode.XML_PARSE_ERROR);
      expect(error.code).toBe(ErrorCode.XML_PARSE_ERROR);
    });
  });

  describe('XmlParseError', () => {
    it('should create XML parse error', () => {
      const error = new XmlParseError('Invalid XML');

      expect(error.code).toBe(ErrorCode.XML_PARSE_ERROR);
      expect(error.name).toBe('XmlParseError');
    });

    it('should include line number', () => {
      const error = new XmlParseError('Unexpected token', { line: 10 });

      expect(error.message).toContain('line 10');
      expect(error.line).toBe(10);
      expect(error.column).toBeUndefined();
    });

    it('should include line and column', () => {
      const error = new XmlParseError('Unexpected token', { line: 10, column: 5 });

      expect(error.message).toContain('line 10');
      expect(error.message).toContain('column 5');
      expect(error.line).toBe(10);
      expect(error.column).toBe(5);
    });

    it('should include cause', () => {
      const cause = new Error('Parser error');
      const error = new XmlParseError('Parse failed', { cause });

      expect(error.message).toContain('Parse failed');
    });
  });

  describe('XmlBuildError', () => {
    it('should create XML build error without element', () => {
      const error = new XmlBuildError('Build failed');

      expect(error.message).toContain('Build failed');
      expect(error.code).toBe(ErrorCode.XML_BUILD_ERROR);
      expect(error.name).toBe('XmlBuildError');
    });

    it('should create XML build error with element', () => {
      const error = new XmlBuildError('Invalid value', 'Invoice');

      expect(error.message).toContain('Invoice');
      expect(error.message).toContain('Invalid value');
      expect(error.code).toBe(ErrorCode.XML_BUILD_ERROR);
    });
  });

  describe('XmlTemplateError', () => {
    it('should create XML template error', () => {
      const error = new XmlTemplateError('alta', 'Missing field');

      expect(error.message).toContain('alta');
      expect(error.message).toContain('Missing field');
      expect(error.code).toBe(ErrorCode.XML_TEMPLATE_ERROR);
      expect(error.name).toBe('XmlTemplateError');
    });
  });

  describe('QrGenerationError', () => {
    it('should create QR error', () => {
      const error = new QrGenerationError('QR failed');

      expect(error.code).toBe(ErrorCode.QR_GENERATION_ERROR);
    });
  });

  describe('QrDataTooLargeError', () => {
    it('should include size information', () => {
      const error = new QrDataTooLargeError(5000, 3000);

      expect(error.dataSize).toBe(5000);
      expect(error.maxSize).toBe(3000);
      expect(error.message).toContain('5000');
      expect(error.message).toContain('3000');
    });
  });

  describe('InvalidCertificateFormatError', () => {
    it('should include format and expected format', () => {
      const error = new InvalidCertificateFormatError('pem', 'pfx');

      expect(error.message).toContain('expected pfx');
      expect(error.message).toContain('got pem');
      expect(error.code).toBe(ErrorCode.INVALID_CERTIFICATE_FORMAT);
      expect(error.name).toBe('InvalidCertificateFormatError');
    });
  });

  describe('AeatAuthenticationError', () => {
    it('should not be retryable', () => {
      const error = new AeatAuthenticationError('Invalid credentials');

      expect(error.message).toContain('authentication failed');
      expect(error.message).toContain('Invalid credentials');
      expect(error.code).toBe(ErrorCode.AEAT_AUTHENTICATION_ERROR);
      expect(error.name).toBe('AeatAuthenticationError');
      expect(error.isRetryable()).toBe(false);
    });
  });
});
