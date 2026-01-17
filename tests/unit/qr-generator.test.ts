/**
 * Tests for QR Code Generator
 */

import { describe, it, expect } from 'vitest';
import {
  generateQrCode,
  generateQrCodeFromUrl,
  QrGenerator,
  createQrGenerator,
} from '../../src/qr/generator.js';
import type { Invoice } from '../../src/models/invoice.js';

describe('QR Generator', () => {
  const createTestInvoice = (hash: string = 'testhash123456789012345678'): Invoice & { hash: string } => ({
    operationType: 'A',
    invoiceType: 'F1',
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

  describe('generateQrCode', () => {
    it('should generate QR code for invoice', () => {
      const invoice = createTestInvoice();
      const result = generateQrCode(invoice);

      expect(result.data).toBeDefined();
      expect(result.data).toContain('<svg');
      expect(result.format).toBe('svg');
      expect(result.url).toContain('B12345678');
      expect(result.size).toBe(200);
    });

    it('should use production environment by default', () => {
      const invoice = createTestInvoice();
      const result = generateQrCode(invoice);

      expect(result.url).toContain('agenciatributaria.gob.es');
    });

    it('should use sandbox environment when specified', () => {
      const invoice = createTestInvoice();
      const result = generateQrCode(invoice, 'sandbox');

      expect(result.url).toContain('prewww2.aeat.es');
    });

    it('should respect custom size', () => {
      const invoice = createTestInvoice();
      const result = generateQrCode(invoice, 'production', { size: 300 });

      expect(result.size).toBe(300);
      expect(result.data).toContain('300');
    });

    it('should generate svg-data-uri format', () => {
      const invoice = createTestInvoice();
      const result = generateQrCode(invoice, 'production', { format: 'svg-data-uri' });

      expect(result.format).toBe('svg-data-uri');
      expect(result.data).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should support custom colors', () => {
      const invoice = createTestInvoice();
      const result = generateQrCode(invoice, 'production', {
        foreground: '#FF0000',
        background: '#00FF00',
      });

      expect(result.data).toContain('#FF0000');
      expect(result.data).toContain('#00FF00');
    });

    it('should support different error correction levels', () => {
      const invoice = createTestInvoice();

      const resultL = generateQrCode(invoice, 'production', { errorCorrection: 'L' });
      const resultH = generateQrCode(invoice, 'production', { errorCorrection: 'H' });

      // Both should generate valid SVGs
      expect(resultL.data).toContain('<svg');
      expect(resultH.data).toContain('<svg');
    });

    it('should include margin in output', () => {
      const invoice = createTestInvoice();
      const result = generateQrCode(invoice, 'production', { margin: 2 });

      expect(result.data).toContain('<svg');
    });
  });

  describe('generateQrCodeFromUrl', () => {
    it('should generate QR from URL string', () => {
      const url = 'https://example.com/verify?id=123';
      const result = generateQrCodeFromUrl(url);

      expect(result.data).toContain('<svg');
      expect(result.url).toBe(url);
    });

    it('should respect options', () => {
      const url = 'https://example.com/verify';
      const result = generateQrCodeFromUrl(url, {
        size: 150,
        format: 'svg',
      });

      expect(result.size).toBe(150);
      expect(result.format).toBe('svg');
    });

    it('should generate data URI format', () => {
      const url = 'https://example.com';
      const result = generateQrCodeFromUrl(url, { format: 'svg-data-uri' });

      expect(result.data).toMatch(/^data:image\/svg\+xml;base64,/);
    });
  });

  describe('QrGenerator class', () => {
    it('should create generator with defaults', () => {
      const generator = new QrGenerator();
      const invoice = createTestInvoice();
      const result = generator.generate(invoice);

      expect(result.url).toContain('agenciatributaria.gob.es');
    });

    it('should use environment in constructor', () => {
      const generator = new QrGenerator('sandbox');
      const invoice = createTestInvoice();
      const result = generator.generate(invoice);

      expect(result.url).toContain('prewww2.aeat.es');
    });

    it('should use default options from constructor', () => {
      const generator = new QrGenerator('production', { size: 400 });
      const invoice = createTestInvoice();
      const result = generator.generate(invoice);

      expect(result.size).toBe(400);
    });

    it('should override default options with generate options', () => {
      const generator = new QrGenerator('production', { size: 400 });
      const invoice = createTestInvoice();
      const result = generator.generate(invoice, { size: 100 });

      expect(result.size).toBe(100);
    });

    it('should generate from URL', () => {
      const generator = new QrGenerator();
      const result = generator.generateFromUrl('https://test.com');

      expect(result.data).toContain('<svg');
    });

    it('should get URL for invoice', () => {
      const generator = new QrGenerator('production');
      const invoice = createTestInvoice();
      const url = generator.getUrl(invoice);

      expect(url).toContain('agenciatributaria.gob.es');
      expect(url).toContain('B12345678');
    });
  });

  describe('createQrGenerator', () => {
    it('should create generator with defaults', () => {
      const generator = createQrGenerator();
      expect(generator).toBeInstanceOf(QrGenerator);
    });

    it('should create generator with environment', () => {
      const generator = createQrGenerator('sandbox');
      const invoice = createTestInvoice();
      const url = generator.getUrl(invoice);

      expect(url).toContain('prewww2.aeat.es');
    });

    it('should create generator with options', () => {
      const generator = createQrGenerator('production', { size: 250 });
      const invoice = createTestInvoice();
      const result = generator.generate(invoice);

      expect(result.size).toBe(250);
    });
  });

  describe('SVG output', () => {
    it('should generate valid SVG structure', () => {
      const invoice = createTestInvoice();
      const result = generateQrCode(invoice);

      expect(result.data).toContain('<svg');
      expect(result.data).toContain('</svg>');
      expect(result.data).toContain('viewBox');
      expect(result.data).toContain('xmlns');
    });

    it('should include rect elements for modules', () => {
      const invoice = createTestInvoice();
      const result = generateQrCode(invoice);

      // QR codes are made of rectangles
      expect(result.data).toContain('<rect');
    });
  });
});
