/**
 * Tests for Hash Functions
 */

import { describe, it, expect } from 'vitest';
import {
  sha256,
  sha256Hex,
  buildAltaHashInput,
  buildAnulacionHashInput,
  calculateAltaHash,
  calculateAnulacionHash,
  calculateInvoiceHash,
  calculateCancellationHash,
} from '../../src/crypto/hash.js';
import type { Invoice, InvoiceCancellation } from '../../src/models/invoice.js';
import { InvoiceType } from '../../src/models/enums.js';

describe('Hash Functions', () => {
  describe('sha256', () => {
    it('should return base64 encoded string', () => {
      const hash = sha256('test');
      expect(typeof hash).toBe('string');
      // Base64 encoded SHA-256 should be 44 characters
      expect(hash.length).toBe(44);
    });

    it('should produce consistent hashes', () => {
      const hash1 = sha256('test');
      const hash2 = sha256('test');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = sha256('test1');
      const hash2 = sha256('test2');
      expect(hash1).not.toBe(hash2);
    });

    it('should be decodable as base64', () => {
      const hash = sha256('test');
      expect(() => Buffer.from(hash, 'base64')).not.toThrow();
    });
  });

  describe('sha256Hex', () => {
    it('should return hex string', () => {
      const hash = sha256Hex('test');
      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce known hash for known input', () => {
      // SHA-256 of empty string
      const hash = sha256Hex('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should produce known hash for "hello"', () => {
      const hash = sha256Hex('hello');
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });
  });

  describe('buildAltaHashInput', () => {
    it('should build hash input with all required fields', () => {
      const input = buildAltaHashInput({
        issuerNif: 'B12345678',
        invoiceNumber: 'A001',
        issueDate: new Date('2024-01-15'),
        invoiceType: 'F1',
        vatTotal: 21,
        totalAmount: 121,
        previousHash: 'previousHash123',
        generationTimestamp: new Date('2024-01-15T10:30:00Z'),
      });

      expect(input).toContain('IDEmisorFactura=B12345678');
      expect(input).toContain('NumSerieFactura=A001');
      expect(input).toContain('FechaExpedicionFactura=2024-01-15');
      expect(input).toContain('TipoFactura=F1');
      expect(input).toContain('CuotaTotal=21.00');
      expect(input).toContain('ImporteTotal=121.00');
      expect(input).toContain('Huella=previousHash123');
    });

    it('should format amounts with 2 decimal places', () => {
      const input = buildAltaHashInput({
        issuerNif: 'B12345678',
        invoiceNumber: '001',
        issueDate: new Date('2024-01-15'),
        invoiceType: 'F1',
        vatTotal: 21.5,
        totalAmount: 121.5,
        previousHash: '',
        generationTimestamp: new Date(),
      });

      expect(input).toContain('CuotaTotal=21.50');
      expect(input).toContain('ImporteTotal=121.50');
    });

    it('should use empty string for first record hash', () => {
      const input = buildAltaHashInput({
        issuerNif: 'B12345678',
        invoiceNumber: '001',
        issueDate: new Date('2024-01-15'),
        invoiceType: 'F1',
        vatTotal: 21,
        totalAmount: 121,
        previousHash: '',
        generationTimestamp: new Date(),
      });

      expect(input).toContain('Huella=&');
    });
  });

  describe('buildAnulacionHashInput', () => {
    it('should build hash input for cancellation', () => {
      const input = buildAnulacionHashInput({
        issuerNif: 'B12345678',
        invoiceNumber: 'A001',
        issueDate: new Date('2024-01-15'),
        previousHash: 'previousHash',
        generationTimestamp: new Date('2024-01-15T10:30:00Z'),
      });

      expect(input).toContain('IDEmisorFactura=B12345678');
      expect(input).toContain('NumSerieFactura=A001');
      expect(input).toContain('FechaExpedicionFactura=2024-01-15');
      expect(input).toContain('Huella=previousHash');
    });

    it('should not include invoice type or amounts', () => {
      const input = buildAnulacionHashInput({
        issuerNif: 'B12345678',
        invoiceNumber: '001',
        issueDate: new Date(),
        previousHash: '',
        generationTimestamp: new Date(),
      });

      expect(input).not.toContain('TipoFactura');
      expect(input).not.toContain('CuotaTotal');
      expect(input).not.toContain('ImporteTotal');
    });
  });

  describe('calculateAltaHash', () => {
    it('should return base64 encoded hash', () => {
      const hash = calculateAltaHash({
        issuerNif: 'B12345678',
        invoiceNumber: 'A001',
        issueDate: new Date('2024-01-15'),
        invoiceType: 'F1',
        vatTotal: 21,
        totalAmount: 121,
        previousHash: '',
        generationTimestamp: new Date('2024-01-15T10:30:00Z'),
      });

      expect(typeof hash).toBe('string');
      expect(() => Buffer.from(hash, 'base64')).not.toThrow();
    });

    it('should produce consistent hashes', () => {
      const input = {
        issuerNif: 'B12345678',
        invoiceNumber: 'A001',
        issueDate: new Date('2024-01-15'),
        invoiceType: 'F1',
        vatTotal: 21,
        totalAmount: 121,
        previousHash: '',
        generationTimestamp: new Date('2024-01-15T10:30:00Z'),
      };

      const hash1 = calculateAltaHash(input);
      const hash2 = calculateAltaHash(input);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const base = {
        issuerNif: 'B12345678',
        invoiceNumber: 'A001',
        issueDate: new Date('2024-01-15'),
        invoiceType: 'F1',
        vatTotal: 21,
        totalAmount: 121,
        previousHash: '',
        generationTimestamp: new Date('2024-01-15T10:30:00Z'),
      };

      const hash1 = calculateAltaHash(base);
      const hash2 = calculateAltaHash({ ...base, totalAmount: 200 });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('calculateInvoiceHash', () => {
    const createTestInvoice = (): Invoice => ({
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
      totalAmount: 121,
    });

    it('should calculate hash for invoice', () => {
      const invoice = createTestInvoice();
      const hash = calculateInvoiceHash(invoice, '', new Date('2024-01-15T10:30:00Z'));

      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should incorporate previous hash', () => {
      const invoice = createTestInvoice();
      const timestamp = new Date('2024-01-15T10:30:00Z');

      const hashWithoutPrev = calculateInvoiceHash(invoice, '', timestamp);
      const hashWithPrev = calculateInvoiceHash(invoice, 'previousHash', timestamp);

      expect(hashWithoutPrev).not.toBe(hashWithPrev);
    });

    it('should handle invoice without series', () => {
      const invoice = createTestInvoice();
      invoice.id.series = undefined;

      const hash = calculateInvoiceHash(invoice, '', new Date());
      expect(typeof hash).toBe('string');
    });
  });

  describe('calculateCancellationHash', () => {
    const createTestCancellation = (): InvoiceCancellation => ({
      operationType: 'AN',
      invoiceId: {
        series: 'A',
        number: '001',
        issueDate: new Date('2024-01-15'),
      },
      issuer: {
        taxId: { type: 'NIF', value: 'B12345678' },
        name: 'Test Company SL',
      },
    });

    it('should calculate hash for cancellation', () => {
      const cancellation = createTestCancellation();
      const hash = calculateCancellationHash(cancellation, '', new Date());

      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should incorporate previous hash', () => {
      const cancellation = createTestCancellation();
      const timestamp = new Date();

      const hashWithoutPrev = calculateCancellationHash(cancellation, '', timestamp);
      const hashWithPrev = calculateCancellationHash(cancellation, 'prev', timestamp);

      expect(hashWithoutPrev).not.toBe(hashWithPrev);
    });
  });
});
