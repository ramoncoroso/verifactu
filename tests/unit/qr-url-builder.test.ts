/**
 * Tests for QR URL Builder
 */

import { describe, it, expect } from 'vitest';
import {
  buildQrUrlParams,
  buildQrUrl,
  buildQrData,
  validateQrParams,
} from '../../src/qr/url-builder.js';
import type { Invoice } from '../../src/models/invoice.js';
import { InvoiceType } from '../../src/models/enums.js';

describe('QR URL Builder', () => {
  const createTestInvoice = (hash: string = 'testhash123'): Invoice & { hash: string } => ({
    operationType: 'A',
    invoiceType: InvoiceType.STANDARD,
    id: {
      series: 'A',
      number: '001',
      issueDate: new Date('2024-01-15'),
    },
    issuer: {
      taxId: { type: 'NIF', value: 'B12345678' },
      name: 'Test Company SL',
    },
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
    totalAmount: 121.50,
    hash,
  });

  describe('buildQrUrlParams', () => {
    it('should build correct parameters', () => {
      const invoice = createTestInvoice();
      const params = buildQrUrlParams(invoice);

      expect(params.nif).toBe('B12345678');
      expect(params.numserie).toBe('A001');
      expect(params.fecha).toBe('15-01-2024');
      expect(params.importe).toBe('121.50');
      expect(params.huella).toBe('testhash123');
    });

    it('should handle invoice without series', () => {
      const invoice = createTestInvoice();
      invoice.id.series = undefined;
      const params = buildQrUrlParams(invoice);

      expect(params.numserie).toBe('001');
    });

    it('should format date as DD-MM-YYYY', () => {
      const invoice = createTestInvoice();
      invoice.id.issueDate = new Date('2024-12-05');
      const params = buildQrUrlParams(invoice);

      expect(params.fecha).toBe('05-12-2024');
    });

    it('should format amount with 2 decimals', () => {
      const invoice = createTestInvoice();
      invoice.totalAmount = 100;
      const params = buildQrUrlParams(invoice);

      expect(params.importe).toBe('100.00');
    });

    it('should handle negative amounts', () => {
      const invoice = createTestInvoice();
      invoice.totalAmount = -50.25;
      const params = buildQrUrlParams(invoice);

      expect(params.importe).toBe('-50.25');
    });
  });

  describe('buildQrUrl', () => {
    it('should build production URL by default', () => {
      const invoice = createTestInvoice();
      const url = buildQrUrl(invoice, 'production');

      expect(url).toContain('agenciatributaria.gob.es');
      expect(url).toContain('ValidarQR');
      expect(url).toContain('nif=B12345678');
      expect(url).toContain('numserie=A001');
      expect(url).toContain('fecha=15-01-2024');
      expect(url).toContain('importe=121.50');
      expect(url).toContain('huella=testhash123');
    });

    it('should build sandbox URL when specified', () => {
      const invoice = createTestInvoice();
      const url = buildQrUrl(invoice, 'sandbox');

      expect(url).toContain('prewww2.aeat.es');
    });

    it('should URL-encode parameters', () => {
      const invoice = createTestInvoice('hash+with+special=chars');
      const url = buildQrUrl(invoice);

      // URLSearchParams encodes + and =
      expect(url).toContain('huella=hash%2Bwith%2Bspecial%3Dchars');
    });
  });

  describe('buildQrData', () => {
    it('should return same result as buildQrUrl', () => {
      const invoice = createTestInvoice();
      const qrData = buildQrData(invoice, 'production');
      const url = buildQrUrl(invoice, 'production');

      expect(qrData).toBe(url);
    });
  });

  describe('validateQrParams', () => {
    it('should validate correct parameters', () => {
      const result = validateQrParams({
        nif: 'B12345678',
        numserie: 'A001',
        fecha: '15-01-2024',
        importe: '121.50',
        huella: 'hash123456789012345678901234',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject invalid NIF length', () => {
      const result = validateQrParams({
        nif: 'B123',
        numserie: 'A001',
        fecha: '15-01-2024',
        importe: '121.50',
        huella: 'hash123456789012345678901234',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid NIF: must be 9 characters');
    });

    it('should reject empty invoice number', () => {
      const result = validateQrParams({
        nif: 'B12345678',
        numserie: '',
        fecha: '15-01-2024',
        importe: '121.50',
        huella: 'hash123456789012345678901234',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invoice number'))).toBe(true);
    });

    it('should reject invoice number too long', () => {
      const result = validateQrParams({
        nif: 'B12345678',
        numserie: 'A'.repeat(61),
        fecha: '15-01-2024',
        importe: '121.50',
        huella: 'hash123456789012345678901234',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('max 60'))).toBe(true);
    });

    it('should reject invalid date format', () => {
      const result = validateQrParams({
        nif: 'B12345678',
        numserie: 'A001',
        fecha: '2024-01-15', // Wrong format (ISO instead of DD-MM-YYYY)
        importe: '121.50',
        huella: 'hash123456789012345678901234',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('DD-MM-YYYY'))).toBe(true);
    });

    it('should reject invalid amount format', () => {
      const result = validateQrParams({
        nif: 'B12345678',
        numserie: 'A001',
        fecha: '15-01-2024',
        importe: '121', // Missing decimals
        huella: 'hash123456789012345678901234',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('decimal'))).toBe(true);
    });

    it('should reject short hash', () => {
      const result = validateQrParams({
        nif: 'B12345678',
        numserie: 'A001',
        fecha: '15-01-2024',
        importe: '121.50',
        huella: 'short',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('hash'))).toBe(true);
    });

    it('should collect multiple errors', () => {
      const result = validateQrParams({
        nif: 'B',
        numserie: '',
        fecha: 'invalid',
        importe: 'invalid',
        huella: 'x',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
