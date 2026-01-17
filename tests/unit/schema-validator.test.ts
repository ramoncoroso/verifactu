/**
 * Tests for Schema Validator
 */

import { describe, it, expect } from 'vitest';
import {
  validateInvoice,
  validateCancellation,
  assertValidInvoice,
  assertValidCancellation,
} from '../../src/validation/schema-validator.js';
import type { Invoice, InvoiceCancellation } from '../../src/models/invoice.js';
import { SchemaValidationError } from '../../src/errors/validation-errors.js';

describe('Schema Validator', () => {
  const createValidInvoice = (): Invoice => ({
    operationType: 'A',
    invoiceType: 'F1',
    id: {
      series: 'A',
      number: '001',
      issueDate: new Date('2024-01-15'),
    },
    issuer: {
      taxId: { type: 'NIF', value: 'B12345674' },
      name: 'Test Company SL',
    },
    recipients: [
      {
        taxId: { type: 'NIF', value: 'A12345674' },
        name: 'Client SA',
      },
    ],
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
  });

  const createValidCancellation = (): InvoiceCancellation => ({
    operationType: 'AN',
    invoiceId: {
      series: 'A',
      number: '001',
      issueDate: new Date('2024-01-15'),
    },
    issuer: {
      taxId: { type: 'NIF', value: 'B12345674' },
      name: 'Test Company SL',
    },
  });

  describe('validateInvoice', () => {
    describe('basic validation', () => {
      it('should pass with valid invoice', () => {
        const invoice = createValidInvoice();
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      });

      it('should error when invoice is null', () => {
        const result = validateInvoice(null as unknown as Invoice);

        expect(result.valid).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].path).toBe('invoice');
        expect(result.violations[0].message).toBe('Invoice is required');
      });

      it('should error when invoice is undefined', () => {
        const result = validateInvoice(undefined as unknown as Invoice);

        expect(result.valid).toBe(false);
        expect(result.violations[0].message).toBe('Invoice is required');
      });
    });

    describe('operation type validation', () => {
      it('should error on invalid operation type', () => {
        const invoice = createValidInvoice();
        invoice.operationType = 'X' as any;
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'operationType')).toBe(true);
      });

      it('should pass with valid operation type A', () => {
        const invoice = createValidInvoice();
        invoice.operationType = 'A';
        const result = validateInvoice(invoice);

        expect(result.violations.some(v => v.path === 'operationType')).toBe(false);
      });
    });

    describe('invoice type validation', () => {
      const validTypes = ['F1', 'F2', 'F3', 'R1', 'R2', 'R3', 'R4', 'R5'];

      validTypes.forEach((type) => {
        it(`should pass with valid invoice type ${type}`, () => {
          const invoice = createValidInvoice();
          invoice.invoiceType = type as any;
          const result = validateInvoice(invoice);

          expect(result.violations.some(v => v.path === 'invoiceType')).toBe(false);
        });
      });

      it('should error on invalid invoice type', () => {
        const invoice = createValidInvoice();
        invoice.invoiceType = 'INVALID' as any;
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'invoiceType')).toBe(true);
      });
    });

    describe('invoice ID validation', () => {
      it('should error when id is missing', () => {
        const invoice = createValidInvoice();
        invoice.id = null as any;
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'id')).toBe(true);
      });

      it('should error when invoice number is missing', () => {
        const invoice = createValidInvoice();
        invoice.id.number = '';
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'id.number')).toBe(true);
      });

      it('should error when invoice number exceeds max length', () => {
        const invoice = createValidInvoice();
        invoice.id.number = 'A'.repeat(21); // max is 20
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'id.number' && v.message.includes('maximum length'))).toBe(true);
      });

      it('should error when series exceeds max length', () => {
        const invoice = createValidInvoice();
        invoice.id.series = 'A'.repeat(21); // max is 20
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'id.series')).toBe(true);
      });

      it('should pass when series is undefined', () => {
        const invoice = createValidInvoice();
        invoice.id.series = undefined;
        const result = validateInvoice(invoice);

        expect(result.violations.some(v => v.path === 'id.series')).toBe(false);
      });

      it('should error when issue date is missing', () => {
        const invoice = createValidInvoice();
        invoice.id.issueDate = null as any;
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'id.issueDate')).toBe(true);
      });

      it('should error when issue date is invalid', () => {
        const invoice = createValidInvoice();
        invoice.id.issueDate = new Date('invalid');
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'id.issueDate')).toBe(true);
      });
    });

    describe('issuer validation', () => {
      it('should error when issuer is missing', () => {
        const invoice = createValidInvoice();
        invoice.issuer = null as any;
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'issuer')).toBe(true);
      });

      it('should error when issuer name is missing', () => {
        const invoice = createValidInvoice();
        invoice.issuer.name = '';
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'issuer.name')).toBe(true);
      });

      it('should error when issuer name exceeds max length', () => {
        const invoice = createValidInvoice();
        invoice.issuer.name = 'A'.repeat(121); // max is 120
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'issuer.name')).toBe(true);
      });

      it('should error when issuer tax ID is missing', () => {
        const invoice = createValidInvoice();
        invoice.issuer.taxId = null as any;
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'issuer.taxId')).toBe(true);
      });

      it('should error when issuer tax ID type is missing', () => {
        const invoice = createValidInvoice();
        invoice.issuer.taxId.type = '' as any;
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'issuer.taxId.type')).toBe(true);
      });

      it('should error when issuer tax ID value is missing', () => {
        const invoice = createValidInvoice();
        invoice.issuer.taxId.value = '';
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'issuer.taxId.value')).toBe(true);
      });
    });

    describe('NIF validation', () => {
      it('should error when NIF length is not 9', () => {
        const invoice = createValidInvoice();
        invoice.issuer.taxId = { type: 'NIF', value: '12345' }; // 5 chars
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.message.includes('9 characters'))).toBe(true);
      });

      it('should error when NIF contains invalid characters', () => {
        const invoice = createValidInvoice();
        invoice.issuer.taxId = { type: 'NIF', value: 'B1234-678' }; // contains dash
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.message.includes('alphanumeric'))).toBe(true);
      });

      it('should pass for non-NIF tax ID types', () => {
        const invoice = createValidInvoice();
        invoice.issuer.taxId = { type: 'OTHER', value: 'FOREIGN123' };
        const result = validateInvoice(invoice);

        // Should not trigger NIF-specific validation
        expect(result.violations.some(v => v.message.includes('9 characters'))).toBe(false);
      });
    });

    describe('recipient validation', () => {
      it('should pass when recipients is undefined', () => {
        const invoice = createValidInvoice();
        invoice.recipients = undefined;
        const result = validateInvoice(invoice);

        expect(result.violations.some(v => v.path.includes('recipients'))).toBe(false);
      });

      it('should error when recipient is invalid', () => {
        const invoice = createValidInvoice();
        invoice.recipients = [null as any];
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'recipients[0]')).toBe(true);
      });

      it('should error when recipient name is missing', () => {
        const invoice = createValidInvoice();
        invoice.recipients![0].name = '';
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'recipients[0].name')).toBe(true);
      });

      it('should error when recipient name exceeds max length', () => {
        const invoice = createValidInvoice();
        invoice.recipients![0].name = 'A'.repeat(121);
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'recipients[0].name')).toBe(true);
      });

      it('should validate multiple recipients', () => {
        const invoice = createValidInvoice();
        invoice.recipients = [
          { taxId: { type: 'NIF', value: 'A12345674' }, name: 'Client 1' },
          { taxId: { type: 'NIF', value: '' }, name: '' }, // Invalid
        ];
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'recipients[1].taxId.value')).toBe(true);
        expect(result.violations.some(v => v.path === 'recipients[1].name')).toBe(true);
      });
    });

    describe('operation regimes validation', () => {
      it('should error when operation regimes is missing', () => {
        const invoice = createValidInvoice();
        invoice.operationRegimes = [];
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'operationRegimes')).toBe(true);
      });

      it('should error when operation regimes is undefined', () => {
        const invoice = createValidInvoice();
        invoice.operationRegimes = undefined as any;
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'operationRegimes')).toBe(true);
      });
    });

    describe('tax breakdown validation', () => {
      it('should error when tax breakdown is missing', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown = null as any;
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'taxBreakdown')).toBe(true);
      });

      it('should error when tax breakdown has no breakdowns', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown = {};
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.message.includes('at least one breakdown type'))).toBe(true);
      });

      it('should pass with only exempt breakdowns', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown = {
          exemptBreakdowns: [{ cause: 'E1', taxBase: 100 }],
        };
        invoice.totalAmount = 100;
        const result = validateInvoice(invoice);

        expect(result.violations.some(v => v.message.includes('at least one breakdown type'))).toBe(false);
      });

      it('should pass with only non-subject breakdowns', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown = {
          nonSubjectBreakdowns: [{ cause: 'NS1', amount: 100 }],
        };
        invoice.totalAmount = 100;
        const result = validateInvoice(invoice);

        expect(result.violations.some(v => v.message.includes('at least one breakdown type'))).toBe(false);
      });

      it('should error when exempt breakdown has no cause', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown = {
          exemptBreakdowns: [{ cause: '', taxBase: 100 }],
        };
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.message.includes('Exemption cause is required'))).toBe(true);
      });

      it('should error when non-subject breakdown has no cause', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown = {
          nonSubjectBreakdowns: [{ cause: '', amount: 100 }],
        };
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.message.includes('Non-subject cause is required'))).toBe(true);
      });
    });

    describe('VAT breakdown validation', () => {
      it('should error when VAT rate is negative', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown.vatBreakdowns = [
          { vatRate: -5, taxBase: 100, vatAmount: -5 },
        ];
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path.includes('vatRate'))).toBe(true);
      });

      it('should error when VAT rate exceeds 100', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown.vatBreakdowns = [
          { vatRate: 150, taxBase: 100, vatAmount: 150 },
        ];
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path.includes('vatRate'))).toBe(true);
      });

      it('should error when VAT amount does not match calculated value', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown.vatBreakdowns = [
          { vatRate: 21, taxBase: 100, vatAmount: 50 }, // Should be 21
        ];
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.message.includes('does not match calculated value'))).toBe(true);
      });

      it('should pass when VAT amount matches calculated value', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown.vatBreakdowns = [
          { vatRate: 21, taxBase: 100, vatAmount: 21 }, // Exact match
        ];
        const result = validateInvoice(invoice);

        expect(result.violations.some(v => v.message.includes('does not match calculated value'))).toBe(false);
      });
    });

    describe('amount validation', () => {
      it('should error when total amount is not a number', () => {
        const invoice = createValidInvoice();
        invoice.totalAmount = 'invalid' as any;
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'totalAmount')).toBe(true);
      });

      it('should error when total amount is NaN', () => {
        const invoice = createValidInvoice();
        invoice.totalAmount = NaN;
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'totalAmount')).toBe(true);
      });

      it('should error when amount exceeds maximum', () => {
        const invoice = createValidInvoice();
        invoice.totalAmount = 999999999999.99; // Exceeds max
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.message.includes('out of valid range'))).toBe(true);
      });

      it('should error when amount is below minimum', () => {
        const invoice = createValidInvoice();
        invoice.totalAmount = -999999999999.99; // Below min
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.message.includes('out of valid range'))).toBe(true);
      });

      it('should error when amount has too many decimals', () => {
        const invoice = createValidInvoice();
        invoice.totalAmount = 100.123; // More than 2 decimals
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.message.includes('decimal places'))).toBe(true);
      });

      it('should pass with valid negative amount', () => {
        const invoice = createValidInvoice();
        invoice.totalAmount = -100.00;
        invoice.taxBreakdown.vatBreakdowns = [
          { vatRate: 21, taxBase: -82.64, vatAmount: -17.35 },
        ];
        const result = validateInvoice(invoice);

        expect(result.violations.some(v => v.path === 'totalAmount' && v.message.includes('negative'))).toBe(false);
      });
    });

    describe('description validation', () => {
      it('should pass when description is undefined', () => {
        const invoice = createValidInvoice();
        invoice.description = undefined;
        const result = validateInvoice(invoice);

        expect(result.violations.some(v => v.path === 'description')).toBe(false);
      });

      it('should error when description exceeds max length', () => {
        const invoice = createValidInvoice();
        invoice.description = 'A'.repeat(501); // max is 500
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'description')).toBe(true);
      });

      it('should pass when description is at max length', () => {
        const invoice = createValidInvoice();
        invoice.description = 'A'.repeat(500);
        const result = validateInvoice(invoice);

        expect(result.violations.some(v => v.path === 'description')).toBe(false);
      });
    });

    describe('rectification validation', () => {
      it('should error when F3 invoice has no rectified invoice type', () => {
        const invoice = createValidInvoice();
        invoice.invoiceType = 'F3';
        invoice.rectifiedInvoices = [{
          issuerTaxId: 'B12345674',
          invoiceId: { number: '000', issueDate: new Date('2024-01-10'), series: 'A' },
        }];
        invoice.rectifiedInvoiceType = undefined;
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'rectifiedInvoiceType')).toBe(true);
      });

      it('should error when F3 invoice has no rectified invoices', () => {
        const invoice = createValidInvoice();
        invoice.invoiceType = 'F3';
        invoice.rectifiedInvoiceType = 'S';
        invoice.rectifiedInvoices = undefined;
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'rectifiedInvoices')).toBe(true);
      });

      it('should error when F3 invoice has empty rectified invoices', () => {
        const invoice = createValidInvoice();
        invoice.invoiceType = 'F3';
        invoice.rectifiedInvoiceType = 'S';
        invoice.rectifiedInvoices = [];
        const result = validateInvoice(invoice);

        expect(result.valid).toBe(false);
        expect(result.violations.some(v => v.path === 'rectifiedInvoices')).toBe(true);
      });

      it('should pass when F3 invoice has valid rectification data', () => {
        const invoice = createValidInvoice();
        invoice.invoiceType = 'F3';
        invoice.rectifiedInvoiceType = 'S';
        invoice.rectifiedInvoices = [{
          issuerTaxId: 'B12345674',
          invoiceId: { number: '000', issueDate: new Date('2024-01-10'), series: 'A' },
        }];
        const result = validateInvoice(invoice);

        expect(result.violations.some(v => v.path === 'rectifiedInvoiceType')).toBe(false);
        expect(result.violations.some(v => v.path === 'rectifiedInvoices')).toBe(false);
      });
    });
  });

  describe('validateCancellation', () => {
    it('should pass with valid cancellation', () => {
      const cancellation = createValidCancellation();
      const result = validateCancellation(cancellation);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should error when cancellation is null', () => {
      const result = validateCancellation(null as unknown as InvoiceCancellation);

      expect(result.valid).toBe(false);
      expect(result.violations[0].message).toBe('Cancellation is required');
    });

    it('should error when cancellation is undefined', () => {
      const result = validateCancellation(undefined as unknown as InvoiceCancellation);

      expect(result.valid).toBe(false);
      expect(result.violations[0].message).toBe('Cancellation is required');
    });

    it('should error on invalid operation type', () => {
      const cancellation = createValidCancellation();
      cancellation.operationType = 'A' as any; // Should be 'AN'
      const result = validateCancellation(cancellation);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.path === 'operationType')).toBe(true);
    });

    it('should error when invoice ID is missing', () => {
      const cancellation = createValidCancellation();
      cancellation.invoiceId = null as any;
      const result = validateCancellation(cancellation);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.path === 'invoiceId')).toBe(true);
    });

    it('should error when issuer is missing', () => {
      const cancellation = createValidCancellation();
      cancellation.issuer = null as any;
      const result = validateCancellation(cancellation);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.path === 'issuer')).toBe(true);
    });
  });

  describe('assertValidInvoice', () => {
    it('should not throw for valid invoice', () => {
      const invoice = createValidInvoice();

      expect(() => assertValidInvoice(invoice)).not.toThrow();
    });

    it('should throw SchemaValidationError for invalid invoice', () => {
      const invoice = createValidInvoice();
      invoice.issuer = null as any;

      expect(() => assertValidInvoice(invoice)).toThrow(SchemaValidationError);
    });

    it('should include violations in thrown error', () => {
      const invoice = createValidInvoice();
      invoice.issuer = null as any;

      try {
        assertValidInvoice(invoice);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SchemaValidationError);
        const schemaError = error as SchemaValidationError;
        expect(schemaError.violations.length).toBeGreaterThan(0);
      }
    });
  });

  describe('assertValidCancellation', () => {
    it('should not throw for valid cancellation', () => {
      const cancellation = createValidCancellation();

      expect(() => assertValidCancellation(cancellation)).not.toThrow();
    });

    it('should throw SchemaValidationError for invalid cancellation', () => {
      const cancellation = createValidCancellation();
      cancellation.invoiceId = null as any;

      expect(() => assertValidCancellation(cancellation)).toThrow(SchemaValidationError);
    });

    it('should include violations in thrown error', () => {
      const cancellation = createValidCancellation();
      cancellation.issuer = null as any;

      try {
        assertValidCancellation(cancellation);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SchemaValidationError);
        const schemaError = error as SchemaValidationError;
        expect(schemaError.violations.length).toBeGreaterThan(0);
      }
    });
  });
});
