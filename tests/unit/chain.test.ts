/**
 * Tests for Record Chain Management
 */

import { describe, it, expect } from 'vitest';
import {
  RecordChain,
  INITIAL_CHAIN_STATE,
  validateChain,
} from '../../src/crypto/chain.js';
import type { Invoice, InvoiceCancellation } from '../../src/models/invoice.js';

describe('RecordChain', () => {
  const createTestInvoice = (number: string = '001', series?: string): Invoice => ({
    operationType: 'A',
    invoiceType: 'F1',
    id: {
      series,
      number,
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

  const createTestCancellation = (number: string = '001'): InvoiceCancellation => ({
    operationType: 'AN',
    invoiceId: {
      number,
      issueDate: new Date('2024-01-15'),
    },
    issuer: {
      taxId: { type: 'NIF', value: 'B12345678' },
      name: 'Test Company SL',
    },
  });

  describe('INITIAL_CHAIN_STATE', () => {
    it('should have correct initial values', () => {
      expect(INITIAL_CHAIN_STATE.lastHash).toBe('');
      expect(INITIAL_CHAIN_STATE.lastNumber).toBe('');
      expect(INITIAL_CHAIN_STATE.recordCount).toBe(0);
      expect(INITIAL_CHAIN_STATE.isFirst).toBe(true);
    });
  });

  describe('constructor', () => {
    it('should create chain with initial state', () => {
      const chain = new RecordChain();
      const state = chain.getState();

      expect(state.isFirst).toBe(true);
      expect(state.recordCount).toBe(0);
      expect(state.lastHash).toBe('');
    });

    it('should accept custom initial state', () => {
      const customState = {
        lastHash: 'abc123',
        lastDate: new Date('2024-01-10'),
        lastSeries: 'A',
        lastNumber: '010',
        recordCount: 10,
        isFirst: false,
      };

      const chain = new RecordChain(customState);
      const state = chain.getState();

      expect(state.lastHash).toBe('abc123');
      expect(state.recordCount).toBe(10);
      expect(state.isFirst).toBe(false);
    });
  });

  describe('getState', () => {
    it('should return a copy of state', () => {
      const chain = new RecordChain();
      const state1 = chain.getState();
      const state2 = chain.getState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });
  });

  describe('isFirstRecord', () => {
    it('should return true for new chain', () => {
      const chain = new RecordChain();
      expect(chain.isFirstRecord()).toBe(true);
    });

    it('should return false after processing a record', () => {
      const chain = new RecordChain();
      const invoice = createTestInvoice();
      chain.processInvoice(invoice);

      expect(chain.isFirstRecord()).toBe(false);
    });
  });

  describe('getPreviousHash', () => {
    it('should return empty string for new chain', () => {
      const chain = new RecordChain();
      expect(chain.getPreviousHash()).toBe('');
    });

    it('should return last hash after processing', () => {
      const chain = new RecordChain();
      const invoice = createTestInvoice();
      const processed = chain.processInvoice(invoice);

      expect(chain.getPreviousHash()).toBe(processed.hash);
    });
  });

  describe('getChainReference', () => {
    it('should return undefined for first record', () => {
      const chain = new RecordChain();
      expect(chain.getChainReference()).toBeUndefined();
    });

    it('should return reference after first record', () => {
      const chain = new RecordChain();
      const invoice = createTestInvoice('001', 'A');
      const processed = chain.processInvoice(invoice);

      const ref = chain.getChainReference();
      expect(ref).toBeDefined();
      expect(ref?.previousHash).toBe(processed.hash);
      expect(ref?.previousNumber).toBe('001');
      expect(ref?.previousSeries).toBe('A');
    });
  });

  describe('processInvoice', () => {
    it('should add hash to invoice', () => {
      const chain = new RecordChain();
      const invoice = createTestInvoice();
      const processed = chain.processInvoice(invoice);

      expect(processed.hash).toBeDefined();
      expect(typeof processed.hash).toBe('string');
      expect(processed.hash.length).toBeGreaterThan(0);
    });

    it('should include chain reference on second record', () => {
      const chain = new RecordChain();
      const invoice1 = createTestInvoice('001');
      const invoice2 = createTestInvoice('002');

      const processed1 = chain.processInvoice(invoice1);
      const processed2 = chain.processInvoice(invoice2);

      expect(processed1.chainReference).toBeUndefined();
      expect(processed2.chainReference).toBeDefined();
      expect(processed2.chainReference?.previousHash).toBe(processed1.hash);
    });

    it('should update state after processing', () => {
      const chain = new RecordChain();
      const invoice = createTestInvoice('001', 'A');
      const processed = chain.processInvoice(invoice);

      const state = chain.getState();
      expect(state.lastHash).toBe(processed.hash);
      expect(state.lastNumber).toBe('001');
      expect(state.lastSeries).toBe('A');
      expect(state.recordCount).toBe(1);
      expect(state.isFirst).toBe(false);
    });

    it('should use provided timestamp', () => {
      const chain1 = new RecordChain();
      const chain2 = new RecordChain();
      const invoice = createTestInvoice();
      const timestamp1 = new Date('2024-01-15T10:00:00Z');
      const timestamp2 = new Date('2024-01-15T11:00:00Z');

      const processed1 = chain1.processInvoice(invoice, timestamp1);
      const processed2 = chain2.processInvoice(invoice, timestamp2);

      // Different timestamps should produce different hashes
      expect(processed1.hash).not.toBe(processed2.hash);
    });
  });

  describe('processCancellation', () => {
    it('should add hash to cancellation', () => {
      const chain = new RecordChain();
      const cancellation = createTestCancellation();
      const processed = chain.processCancellation(cancellation);

      expect(processed.hash).toBeDefined();
      expect(typeof processed.hash).toBe('string');
      expect(processed.hash.length).toBeGreaterThan(0);
    });

    it('should update state after processing', () => {
      const chain = new RecordChain();
      const cancellation = createTestCancellation('001');
      const processed = chain.processCancellation(cancellation);

      const state = chain.getState();
      expect(state.lastHash).toBe(processed.hash);
      expect(state.lastNumber).toBe('001');
      expect(state.recordCount).toBe(1);
    });
  });

  describe('verifyRecordHash', () => {
    it('should verify valid invoice hash', () => {
      const chain = new RecordChain();
      const invoice = createTestInvoice();
      const timestamp = new Date('2024-01-15T10:00:00Z');
      const processed = chain.processInvoice(invoice, timestamp);

      const chain2 = new RecordChain();
      const isValid = chain2.verifyRecordHash(invoice, processed.hash, '', timestamp);

      expect(isValid).toBe(true);
    });

    it('should reject invalid hash', () => {
      const chain = new RecordChain();
      const invoice = createTestInvoice();
      const timestamp = new Date('2024-01-15T10:00:00Z');

      const isValid = chain.verifyRecordHash(invoice, 'invalid-hash', '', timestamp);

      expect(isValid).toBe(false);
    });

    it('should verify cancellation hash', () => {
      const chain = new RecordChain();
      const cancellation = createTestCancellation();
      const timestamp = new Date('2024-01-15T10:00:00Z');
      const processed = chain.processCancellation(cancellation, timestamp);

      const chain2 = new RecordChain();
      const isValid = chain2.verifyRecordHash(cancellation, processed.hash, '', timestamp);

      expect(isValid).toBe(true);
    });
  });

  describe('toJSON / fromJSON', () => {
    it('should serialize chain state', () => {
      const chain = new RecordChain();
      const invoice = createTestInvoice('001', 'A');
      chain.processInvoice(invoice);

      const json = chain.toJSON();

      expect(json).toHaveProperty('lastHash');
      expect(json).toHaveProperty('lastDate');
      expect(json).toHaveProperty('recordCount', 1);
      expect(json).toHaveProperty('isFirst', false);
    });

    it('should deserialize chain state', () => {
      const originalChain = new RecordChain();
      const invoice = createTestInvoice('001', 'A');
      originalChain.processInvoice(invoice);

      const json = originalChain.toJSON() as {
        lastHash: string;
        lastDate: string;
        lastSeries?: string;
        lastNumber: string;
        recordCount: number;
        isFirst: boolean;
      };
      const restoredChain = RecordChain.fromJSON(json);

      expect(restoredChain.getState().lastHash).toBe(originalChain.getState().lastHash);
      expect(restoredChain.getState().recordCount).toBe(1);
      expect(restoredChain.isFirstRecord()).toBe(false);
    });
  });

  describe('static methods', () => {
    it('should create chain with create()', () => {
      const chain = RecordChain.create();
      expect(chain.isFirstRecord()).toBe(true);
    });

    it('should create chain from state with fromState()', () => {
      const state = {
        lastHash: 'xyz',
        lastDate: new Date('2024-01-01'),
        lastSeries: 'B',
        lastNumber: '005',
        recordCount: 5,
        isFirst: false,
      };

      const chain = RecordChain.fromState(state);
      expect(chain.getState().lastHash).toBe('xyz');
      expect(chain.getState().recordCount).toBe(5);
    });
  });
});

describe('validateChain', () => {
  const createTestInvoice = (number: string): Invoice => ({
    operationType: 'A',
    invoiceType: 'F1',
    id: {
      number,
      issueDate: new Date('2024-01-15'),
    },
    issuer: {
      taxId: { type: 'NIF', value: 'B12345678' },
      name: 'Test Company SL',
    },
    operationRegimes: ['01'],
    taxBreakdown: {},
    totalAmount: 100,
  });

  it('should validate correct chain', () => {
    const chain = new RecordChain();
    const timestamp = new Date('2024-01-15T10:00:00Z');
    const invoice1 = createTestInvoice('001');
    const invoice2 = createTestInvoice('002');

    const processed1 = chain.processInvoice(invoice1, timestamp);
    const processed2 = chain.processInvoice(invoice2, timestamp);

    const records = [
      { ...processed1, generationTimestamp: timestamp },
      { ...processed2, generationTimestamp: timestamp },
    ];

    const result = validateChain(records);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect invalid hash in chain', () => {
    const chain = new RecordChain();
    const timestamp = new Date('2024-01-15T10:00:00Z');
    const invoice1 = createTestInvoice('001');

    const processed1 = chain.processInvoice(invoice1, timestamp);

    const records = [
      { ...processed1, hash: 'tampered-hash', generationTimestamp: timestamp },
    ];

    const result = validateChain(records);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('hash mismatch');
  });

  it('should validate empty chain', () => {
    const result = validateChain([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate chain with cancellation records', () => {
    const chain = new RecordChain();
    const timestamp = new Date('2024-01-15T10:00:00Z');

    const cancellation: InvoiceCancellation = {
      operationType: 'AN',
      invoiceId: {
        number: '001',
        issueDate: new Date('2024-01-15'),
      },
      issuer: {
        taxId: { type: 'NIF', value: 'B12345678' },
        name: 'Test Company SL',
      },
    };

    const processed = chain.processCancellation(cancellation, timestamp);

    const records = [
      { ...processed, generationTimestamp: timestamp },
    ];

    const result = validateChain(records);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect invalid hash in cancellation record', () => {
    const chain = new RecordChain();
    const timestamp = new Date('2024-01-15T10:00:00Z');

    const cancellation: InvoiceCancellation = {
      operationType: 'AN',
      invoiceId: {
        number: '001',
        issueDate: new Date('2024-01-15'),
      },
      issuer: {
        taxId: { type: 'NIF', value: 'B12345678' },
        name: 'Test Company SL',
      },
    };

    const processed = chain.processCancellation(cancellation, timestamp);

    const records = [
      { ...processed, hash: 'invalid-hash', generationTimestamp: timestamp },
    ];

    const result = validateChain(records);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('hash mismatch');
  });
});
