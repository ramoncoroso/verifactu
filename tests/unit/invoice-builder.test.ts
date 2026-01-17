/**
 * Tests for Invoice Builder
 */

import { describe, it, expect } from 'vitest';
import { InvoiceBuilder, quickInvoice, createInvoiceBuilder } from '../../src/builders/invoice-builder.js';
import { VatRate } from '../../src/models/enums.js';
import { MissingFieldError } from '../../src/errors/validation-errors.js';

describe('InvoiceBuilder', () => {
  describe('basic invoice creation', () => {
    it('should create a valid standard invoice', () => {
      const invoice = InvoiceBuilder.create()
        .issuer({
          taxId: { type: 'NIF', value: 'B12345674' },
          name: 'Test Company SL',
        })
        .recipient({
          taxId: { type: 'NIF', value: 'A87654321' },
          name: 'Client SA',
        })
        .type('F1')
        .id('001', new Date('2024-01-15'))
        .series('A')
        .addVatBreakdown(100, VatRate.General)
        .build();

      expect(invoice.operationType).toBe('A');
      expect(invoice.invoiceType).toBe('F1');
      expect(invoice.issuer.name).toBe('Test Company SL');
      expect(invoice.totalAmount).toBe(121); // 100 + 21
    });

    it('should create invoice without series', () => {
      const invoice = InvoiceBuilder.create()
        .issuer({
          taxId: { type: 'NIF', value: 'B12345674' },
          name: 'Test Company SL',
        })
        .type('F1')
        .id('001', new Date('2024-01-15'))
        .addVatBreakdown(100, VatRate.General)
        .build();

      expect(invoice.id.series).toBeUndefined();
      expect(invoice.id.number).toBe('001');
    });

    it('should use string shorthand for issuer', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test Company SL')
        .type('F1')
        .id('001')
        .addVatBreakdown(100, VatRate.General)
        .build();

      expect(invoice.issuer.taxId.value).toBe('B12345674');
      expect(invoice.issuer.name).toBe('Test Company SL');
    });

    it('should use default date if not provided', () => {
      const before = new Date();
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .number('001')
        .addVatBreakdown(100, VatRate.General)
        .build();
      const after = new Date();

      expect(invoice.id.issueDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(invoice.id.issueDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('fluent interface', () => {
    it('should support method chaining', () => {
      const builder = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001');

      expect(builder).toBeInstanceOf(InvoiceBuilder);
    });

    it('should support description', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001')
        .description('Professional services')
        .addVatBreakdown(100, VatRate.General)
        .build();

      expect(invoice.description).toBe('Professional services');
    });
  });

  describe('tax breakdown', () => {
    it('should add multiple VAT breakdowns', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001')
        .addVatBreakdown(100, VatRate.General)
        .addVatBreakdown(50, VatRate.Reduced)
        .build();

      expect(invoice.taxBreakdown.vatBreakdowns).toHaveLength(2);
      // Total: 100 + 21 + 50 + 5 = 176
      expect(invoice.totalAmount).toBe(176);
    });

    it('should add exempt breakdown', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001')
        .addExemptBreakdown(100, 'E1')
        .build();

      expect(invoice.taxBreakdown.exemptBreakdowns).toHaveLength(1);
      expect(invoice.totalAmount).toBe(100);
    });

    it('should add non-subject breakdown', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001')
        .addNonSubjectBreakdown(100, 'OT')
        .build();

      expect(invoice.taxBreakdown.nonSubjectBreakdowns).toHaveLength(1);
      expect(invoice.totalAmount).toBe(100);
    });

    it('should combine different breakdown types', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001')
        .addVatBreakdown(100, 21)
        .addExemptBreakdown(50, 'E1')
        .build();

      expect(invoice.taxBreakdown.vatBreakdowns).toHaveLength(1);
      expect(invoice.taxBreakdown.exemptBreakdowns).toHaveLength(1);
    });
  });

  describe('recipients', () => {
    it('should add single recipient', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .recipient('A87654321', 'Client')
        .type('F1')
        .id('001')
        .addVatBreakdown(100, 21)
        .build();

      expect(invoice.recipients).toHaveLength(1);
      expect(invoice.recipients?.[0]?.name).toBe('Client');
    });

    it('should add multiple recipients', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .recipient('A87654321', 'Client 1')
        .recipient('B12345674', 'Client 2')
        .type('F1')
        .id('001')
        .addVatBreakdown(100, 21)
        .build();

      expect(invoice.recipients).toHaveLength(2);
    });
  });

  describe('operation regimes', () => {
    it('should add general regime by default', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001')
        .addVatBreakdown(100, 21)
        .build();

      expect(invoice.operationRegimes).toContain('01');
    });

    it('should add custom regime', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001')
        .regime('02')
        .addVatBreakdown(100, 21)
        .build();

      expect(invoice.operationRegimes).toContain('02');
    });

    it('should not duplicate regimes', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001')
        .regime('01')
        .regime('01')
        .generalRegime()
        .addVatBreakdown(100, 21)
        .build();

      const count = invoice.operationRegimes.filter(r => r === '01').length;
      expect(count).toBe(1);
    });
  });

  describe('rectifications', () => {
    it('should create rectifying invoice', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .rectification('S')
        .rectifies('B12345674', '001', new Date('2024-01-01'), 'A')
        .id('002')
        .series('A')
        .addVatBreakdown(-50, VatRate.General)
        .build();

      expect(invoice.invoiceType).toBe('F3');
      expect(invoice.rectifiedInvoiceType).toBe('S');
      expect(invoice.rectifiedInvoices).toHaveLength(1);
    });
  });

  describe('software info', () => {
    it('should add software information', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001')
        .software({
          name: 'TestApp',
          developerTaxId: 'B12345674',
          version: '1.0.0',
          installationNumber: '001',
          systemType: 'S',
        })
        .addVatBreakdown(100, VatRate.General)
        .build();

      expect(invoice.softwareInfo?.name).toBe('TestApp');
    });
  });

  describe('lines', () => {
    it('should add invoice lines', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001')
        .addLine({
          description: 'Service',
          quantity: 2,
          unitPrice: 50,
          vatRate: 21,
        })
        .build();

      expect(invoice.lines).toHaveLength(1);
      expect(invoice.lines?.[0]?.lineTotal).toBe(100);
    });

    it('should calculate breakdowns from lines', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001')
        .addLine({
          description: 'Service 1',
          quantity: 1,
          unitPrice: 100,
          vatRate: 21,
        })
        .addLine({
          description: 'Service 2',
          quantity: 2,
          unitPrice: 50,
          vatRate: 10,
        })
        .build();

      // Lines total: 100 + 100 = 200 base
      // VAT at 21%: 21, VAT at 10%: 10
      // Total: 200 + 31 = 231
      expect(invoice.totalAmount).toBe(231);
    });

    it('should apply line discounts', () => {
      const invoice = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001')
        .addLine({
          description: 'Service',
          quantity: 1,
          unitPrice: 100,
          vatRate: 21,
          discountPercent: 10,
        })
        .build();

      expect(invoice.lines?.[0]?.lineTotal).toBe(90);
    });
  });

  describe('validation', () => {
    it('should throw if issuer is missing', () => {
      expect(() => {
        InvoiceBuilder.create()
          .type('F1')
          .id('001')
          .addVatBreakdown(100, VatRate.General)
          .build();
      }).toThrow(MissingFieldError);
    });

    it('should throw if invoice type is missing', () => {
      expect(() => {
        InvoiceBuilder.create()
          .issuer('B12345674', 'Test')
          .id('001')
          .addVatBreakdown(100, VatRate.General)
          .build();
      }).toThrow(MissingFieldError);
    });

    it('should throw if invoice number is missing', () => {
      expect(() => {
        InvoiceBuilder.create()
          .issuer('B12345674', 'Test')
          .type('F1')
          .addVatBreakdown(100, VatRate.General)
          .build();
      }).toThrow(MissingFieldError);
    });

    it('should throw if no tax breakdown', () => {
      expect(() => {
        InvoiceBuilder.create()
          .issuer('B12345674', 'Test')
          .type('F1')
          .id('001')
          .build();
      }).toThrow();
    });
  });

  describe('reset', () => {
    it('should reset builder state', () => {
      const builder = InvoiceBuilder.create()
        .issuer('B12345674', 'Test')
        .type('F1')
        .id('001');

      builder.reset();

      expect(() => builder.build()).toThrow(MissingFieldError);
    });
  });

  describe('quickInvoice helper', () => {
    it('should create invoice with minimal options', () => {
      const invoice = quickInvoice({
        issuerNif: 'B12345674',
        issuerName: 'Test Company',
        number: '001',
        items: [
          { description: 'Service', amount: 100 },
        ],
      });

      expect(invoice.issuer.taxId.value).toBe('B12345674');
      expect(invoice.id.number).toBe('001');
      expect(invoice.invoiceType).toBe('F1');
    });

    it('should create invoice with all options', () => {
      const invoice = quickInvoice({
        issuerNif: 'B12345674',
        issuerName: 'Test Company',
        recipientNif: 'A87654321',
        recipientName: 'Client',
        number: '001',
        series: 'A',
        date: new Date('2024-01-15'),
        description: 'Services',
        items: [
          { description: 'Service 1', amount: 100, vatRate: 21 },
          { description: 'Service 2', amount: 50, vatRate: 10 },
        ],
      });

      expect(invoice.id.series).toBe('A');
      expect(invoice.recipients).toHaveLength(1);
      expect(invoice.description).toBe('Services');
    });
  });

  describe('createInvoiceBuilder', () => {
    it('should create an invoice builder instance', () => {
      const builder = createInvoiceBuilder();

      expect(builder).toBeInstanceOf(InvoiceBuilder);

      const invoice = builder
        .issuer({
          taxId: { type: 'NIF', value: 'B12345674' },
          name: 'Test Company',
        })
        .type('F1')
        .id('001', new Date('2024-01-15'))
        .addVatBreakdown(100, 21)
        .build();

      expect(invoice.operationType).toBe('A');
    });
  });
});
