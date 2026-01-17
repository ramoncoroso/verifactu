/**
 * Record Chain Management for Verifactu
 *
 * Manages the chain of invoice records where each record's hash
 * depends on the previous record's hash.
 */

import { ChainError } from '../errors/crypto-errors.js';
import type { Invoice, InvoiceCancellation, ChainReference, VerifactuRecord } from '../models/invoice.js';
import { calculateInvoiceHash, calculateCancellationHash } from './hash.js';

/**
 * Chain state representing the last processed record
 */
export interface ChainState {
  /** Hash of the last record (Huella) */
  lastHash: string;
  /** Date of the last record */
  lastDate: Date;
  /** Series of the last record (if any) */
  lastSeries?: string;
  /** Number of the last record */
  lastNumber: string;
  /** Total records in the chain */
  recordCount: number;
  /** Whether this is the first record */
  isFirst: boolean;
}

/**
 * Initial chain state (for first record)
 */
export const INITIAL_CHAIN_STATE: ChainState = {
  lastHash: '',
  lastDate: new Date(0),
  lastSeries: undefined,
  lastNumber: '',
  recordCount: 0,
  isFirst: true,
};

/**
 * Record Chain Manager
 *
 * Maintains the chain state and calculates hashes for new records.
 */
export class RecordChain {
  private state: ChainState;

  constructor(initialState?: ChainState) {
    this.state = initialState ?? { ...INITIAL_CHAIN_STATE };
  }

  /**
   * Get the current chain state
   */
  getState(): Readonly<ChainState> {
    return { ...this.state };
  }

  /**
   * Check if this would be the first record
   */
  isFirstRecord(): boolean {
    return this.state.isFirst;
  }

  /**
   * Get the previous hash for the next record
   */
  getPreviousHash(): string {
    return this.state.lastHash;
  }

  /**
   * Get the chain reference for a new record
   */
  getChainReference(): ChainReference | undefined {
    if (this.state.isFirst) {
      return undefined;
    }

    return {
      previousHash: this.state.lastHash,
      previousDate: this.state.lastDate,
      previousSeries: this.state.lastSeries,
      previousNumber: this.state.lastNumber,
    };
  }

  /**
   * Process an invoice and add it to the chain
   * Returns the processed invoice with hash and chain reference
   */
  processInvoice(invoice: Invoice, timestamp?: Date): Invoice & { hash: string } {
    const generationTimestamp = timestamp ?? new Date();
    const previousHash = this.state.isFirst ? '' : this.state.lastHash;

    // Calculate hash
    const hash = calculateInvoiceHash(invoice, previousHash, generationTimestamp);

    // Create chain reference
    const chainReference = this.getChainReference();

    // Update state
    this.updateState({
      hash,
      date: invoice.id.issueDate,
      series: invoice.id.series,
      number: invoice.id.number,
    });

    // Return invoice with hash and chain reference
    return {
      ...invoice,
      hash,
      chainReference,
    };
  }

  /**
   * Process a cancellation and add it to the chain
   * Returns the processed cancellation with hash and chain reference
   */
  processCancellation(
    cancellation: InvoiceCancellation,
    timestamp?: Date
  ): InvoiceCancellation & { hash: string } {
    const generationTimestamp = timestamp ?? new Date();
    const previousHash = this.state.isFirst ? '' : this.state.lastHash;

    // Calculate hash
    const hash = calculateCancellationHash(cancellation, previousHash, generationTimestamp);

    // Create chain reference
    const chainReference = this.getChainReference();

    // Update state
    this.updateState({
      hash,
      date: cancellation.invoiceId.issueDate,
      series: cancellation.invoiceId.series,
      number: cancellation.invoiceId.number,
    });

    // Return cancellation with hash and chain reference
    return {
      ...cancellation,
      hash,
      chainReference,
    };
  }

  /**
   * Update the chain state after processing a record
   */
  private updateState(record: {
    hash: string;
    date: Date;
    series?: string;
    number: string;
  }): void {
    this.state = {
      lastHash: record.hash,
      lastDate: record.date,
      lastSeries: record.series,
      lastNumber: record.number,
      recordCount: this.state.recordCount + 1,
      isFirst: false,
    };
  }

  /**
   * Verify a record's hash matches its expected value
   */
  verifyRecordHash(
    record: VerifactuRecord,
    expectedHash: string,
    previousHash: string,
    timestamp: Date
  ): boolean {
    let calculatedHash: string;

    if (record.operationType === 'A') {
      calculatedHash = calculateInvoiceHash(record, previousHash, timestamp);
    } else {
      calculatedHash = calculateCancellationHash(record, previousHash, timestamp);
    }

    return calculatedHash === expectedHash;
  }

  /**
   * Serialize chain state to JSON-compatible object
   */
  toJSON(): object {
    return {
      lastHash: this.state.lastHash,
      lastDate: this.state.lastDate.toISOString(),
      lastSeries: this.state.lastSeries,
      lastNumber: this.state.lastNumber,
      recordCount: this.state.recordCount,
      isFirst: this.state.isFirst,
    };
  }

  /**
   * Create a RecordChain from a serialized state
   */
  static fromJSON(json: {
    lastHash: string;
    lastDate: string;
    lastSeries?: string;
    lastNumber: string;
    recordCount: number;
    isFirst: boolean;
  }): RecordChain {
    return new RecordChain({
      lastHash: json.lastHash,
      lastDate: new Date(json.lastDate),
      lastSeries: json.lastSeries,
      lastNumber: json.lastNumber,
      recordCount: json.recordCount,
      isFirst: json.isFirst,
    });
  }

  /**
   * Create a new chain starting from a known state
   */
  static fromState(state: ChainState): RecordChain {
    return new RecordChain({ ...state });
  }

  /**
   * Create a new empty chain (for first record)
   */
  static create(): RecordChain {
    return new RecordChain();
  }
}

/**
 * Validate a chain of records
 */
export function validateChain(
  records: ReadonlyArray<VerifactuRecord & { hash: string; generationTimestamp: Date }>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let previousHash = '';

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;

    let expectedHash: string;

    if (record.operationType === 'A') {
      expectedHash = calculateInvoiceHash(record, previousHash, record.generationTimestamp);
    } else {
      expectedHash = calculateCancellationHash(record, previousHash, record.generationTimestamp);
    }

    if (record.hash !== expectedHash) {
      errors.push(`Record ${i}: hash mismatch (expected ${expectedHash}, got ${record.hash})`);
    }

    previousHash = record.hash;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
