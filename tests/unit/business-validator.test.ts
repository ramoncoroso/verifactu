/**
 * Tests for Business Rules Validator
 */

import { describe, it, expect } from 'vitest';
import {
  validateInvoiceBusinessRules,
  validateCancellationBusinessRules,
  validateInvoiceFull,
  BusinessRules,
} from '../../src/validation/business-validator.js';
import type { Invoice, InvoiceCancellation } from '../../src/models/invoice.js';

describe('Business Rules Validator', () => {
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

  describe('validateInvoiceBusinessRules', () => {
    describe('NIF validation (BR001, BR002, BR003)', () => {
      it('should pass with valid CIF issuer', () => {
        const invoice = createValidInvoice();
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should error on invalid issuer NIF (BR001)', () => {
        const invoice = createValidInvoice();
        invoice.issuer.taxId.value = 'INVALID123';
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === BusinessRules.BR001)).toBe(true);
      });

      it('should warn on personal NIF for issuer (BR003)', () => {
        const invoice = createValidInvoice();
        invoice.issuer.taxId.value = '12345678Z'; // Valid personal NIF
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.warnings.some(w => w.code === BusinessRules.BR003)).toBe(true);
      });

      it('should error on invalid recipient NIF (BR002)', () => {
        const invoice = createValidInvoice();
        if (invoice.recipients) {
          invoice.recipients[0] = {
            taxId: { type: 'NIF', value: 'INVALID' },
            name: 'Client',
          };
        }
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === BusinessRules.BR002)).toBe(true);
      });
    });

    describe('Date validation (BR010, BR011)', () => {
      it('should error on future issue date (BR010)', () => {
        const invoice = createValidInvoice();
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 10);
        invoice.id.issueDate = futureDate;
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === BusinessRules.BR010)).toBe(true);
      });

      it('should warn on old issue date (BR011)', () => {
        const invoice = createValidInvoice();
        const oldDate = new Date();
        oldDate.setFullYear(oldDate.getFullYear() - 5);
        invoice.id.issueDate = oldDate;
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.warnings.some(w => w.code === BusinessRules.BR011)).toBe(true);
      });
    });

    describe('Amount validation (BR020, BR021, BR022, BR023)', () => {
      it('should error when total does not match breakdown (BR020)', () => {
        const invoice = createValidInvoice();
        invoice.totalAmount = 500; // Doesn't match 100 + 21
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === BusinessRules.BR020)).toBe(true);
      });

      it('should error on negative total for non-rectification (BR021)', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown.vatBreakdowns = [
          { vatRate: 21, taxBase: -100, vatAmount: -21 },
        ];
        invoice.totalAmount = -121;
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === BusinessRules.BR021)).toBe(true);
      });

      it('should allow negative total for rectification', () => {
        const invoice = createValidInvoice();
        invoice.invoiceType = 'F3';
        invoice.rectifiedInvoiceType = 'S';
        invoice.rectifiedInvoices = [{
          issuerTaxId: 'B12345674',
          invoiceId: { number: '000', issueDate: new Date('2024-01-10'), series: 'A' },
        }];
        invoice.taxBreakdown.vatBreakdowns = [
          { vatRate: 21, taxBase: -100, vatAmount: -21 },
        ];
        invoice.totalAmount = -121;
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.errors.some(e => e.code === BusinessRules.BR021)).toBe(false);
      });

      it('should warn on zero total (BR022)', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown.vatBreakdowns = [
          { vatRate: 0, taxBase: 0, vatAmount: 0 },
        ];
        invoice.totalAmount = 0;
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.warnings.some(w => w.code === BusinessRules.BR022)).toBe(true);
      });

      it('should error on VAT calculation mismatch (BR023)', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown.vatBreakdowns = [
          { vatRate: 21, taxBase: 100, vatAmount: 50 }, // Should be 21
        ];
        invoice.totalAmount = 150;
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === BusinessRules.BR023)).toBe(true);
      });
    });

    describe('Invoice type validation (BR030, BR031)', () => {
      it('should warn when simplified invoice exceeds limit (BR030)', () => {
        const invoice = createValidInvoice();
        invoice.invoiceType = 'F2'; // Simplified
        invoice.taxBreakdown.vatBreakdowns = [
          { vatRate: 21, taxBase: 400, vatAmount: 84 },
        ];
        invoice.totalAmount = 484;
        const result = validateInvoiceBusinessRules(invoice);

        // BR030 is a warning, not an error
        expect(result.warnings.some(w => w.code === BusinessRules.BR030)).toBe(true);
      });

      it('should warn when F1 invoice has no recipient (BR031)', () => {
        const invoice = createValidInvoice();
        invoice.invoiceType = 'F1';
        invoice.recipients = undefined;
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.warnings.some(w => w.code === BusinessRules.BR031)).toBe(true);
      });
    });

    describe('Tax validation (BR040, BR041, BR042)', () => {
      it('should warn on non-standard VAT rate (BR040)', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown.vatBreakdowns = [
          { vatRate: 15, taxBase: 100, vatAmount: 15 }, // Non-standard rate
        ];
        invoice.totalAmount = 115;
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.warnings.some(w => w.code === BusinessRules.BR040)).toBe(true);
      });

      it('should error when exempt has no cause (BR041)', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown.vatBreakdowns = [];
        invoice.taxBreakdown.exemptBreakdowns = [
          { cause: '', taxBase: 100 } as any, // Empty cause
        ];
        invoice.totalAmount = 100;
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === BusinessRules.BR041)).toBe(true);
      });

      it('should error on equivalence surcharge without VAT (BR042)', () => {
        const invoice = createValidInvoice();
        invoice.taxBreakdown.vatBreakdowns = [
          { vatRate: 0, taxBase: 100, vatAmount: 0, equivalenceSurchargeAmount: 5.2, equivalenceSurchargeRate: 5.2 },
        ];
        invoice.totalAmount = 100;
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === BusinessRules.BR042)).toBe(true);
      });
    });

    describe('Rectification validation (BR012, BR032)', () => {
      it('should error when rectification date is before original (BR012)', () => {
        const invoice = createValidInvoice();
        invoice.invoiceType = 'F3';
        invoice.rectifiedInvoiceType = 'S';
        invoice.rectifiedInvoices = [{
          issuerTaxId: 'B12345674',
          invoiceId: { number: '000', issueDate: new Date('2024-02-01'), series: 'A' },
        }];
        invoice.id.issueDate = new Date('2024-01-15'); // Before rectified invoice
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === BusinessRules.BR012)).toBe(true);
      });

      it('should error when rectification has no references (BR032)', () => {
        const invoice = createValidInvoice();
        invoice.invoiceType = 'F3';
        invoice.rectifiedInvoiceType = 'S';
        invoice.rectifiedInvoices = undefined;
        const result = validateInvoiceBusinessRules(invoice);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.code === BusinessRules.BR032)).toBe(true);
      });
    });
  });

  describe('validateCancellationBusinessRules', () => {
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

    it('should pass with valid cancellation', () => {
      const cancellation = createValidCancellation();
      const result = validateCancellationBusinessRules(cancellation);

      expect(result.valid).toBe(true);
    });

    it('should error on invalid issuer NIF', () => {
      const cancellation = createValidCancellation();
      cancellation.issuer.taxId.value = 'INVALID';
      const result = validateCancellationBusinessRules(cancellation);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === BusinessRules.BR001)).toBe(true);
    });

    it('should error on future issue date', () => {
      const cancellation = createValidCancellation();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      cancellation.invoiceId.issueDate = futureDate;
      const result = validateCancellationBusinessRules(cancellation);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === BusinessRules.BR010)).toBe(true);
    });
  });

  describe('validateInvoiceFull', () => {
    it('should return combined validation results for valid invoice', () => {
      const invoice = createValidInvoice();
      const result = validateInvoiceFull(invoice);

      expect(result.valid).toBe(true);
      expect(result.schemaErrors).toHaveLength(0);
      expect(result.businessErrors).toHaveLength(0);
    });

    it('should return schema errors when schema validation fails', () => {
      const invoice = createValidInvoice();
      invoice.operationType = 'INVALID' as any; // Invalid operation type
      invoice.totalAmount = 999999999999.99; // Out of range

      const result = validateInvoiceFull(invoice);

      expect(result.valid).toBe(false);
      expect(result.schemaErrors.length).toBeGreaterThan(0);
    });

    it('should return business errors when business validation fails', () => {
      const invoice = createValidInvoice();
      invoice.issuer.taxId.value = 'INVALID123'; // Invalid NIF

      const result = validateInvoiceFull(invoice);

      expect(result.valid).toBe(false);
      expect(result.businessErrors.length).toBeGreaterThan(0);
    });

    it('should include warnings', () => {
      const invoice = createValidInvoice();
      invoice.issuer.taxId.value = '12345678Z'; // Valid personal NIF - triggers warning

      const result = validateInvoiceFull(invoice);

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
