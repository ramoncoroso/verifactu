/**
 * Record Chain Management for Verifactu
 *
 * Manages the chain of invoice records where each record's hash
 * depends on the previous record's hash.
 */

import type { Invoice, InvoiceCancellation, ChainReference, VerifactuRecord } from '../models/invoice.js';
import { calculateInvoiceHash, calculateCancellationHash } from './hash.js';

/**
 * Chain state representing the last processed record
 */
export interface ChainState {
  /** Hash of the last record (Huella) */
  lastHash: string;
  /**
   * NIF del emisor del último registro.
   *
   * `EncadenamientoFacturaAnteriorType` declara `IDEmisorFactura` como
   * obligatorio dentro de `RegistroAnterior`, así que hay que conservarlo para
   * poder encadenar tras rehidratar el estado desde almacenamiento.
   */
  lastIssuerNif?: string;
  /** Instante de generación del último registro. */
  lastGenerationTimestamp?: Date;
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
 * Cadena de registros de facturación.
 *
 * Es un **registro de solo anexado**. No hay —ni debe haber— ninguna forma
 * pública de retroceder:
 *
 *  - La cadena es local: se genera al expedir la factura, no al enviarla. La
 *    comprobación de encadenamiento que exige el art. 7.i del RRSIF solo mira
 *    registros del propio SIF; la AEAT no aparece en ella.
 *  - Un registro **rechazado por la AEAT permanece en la cadena**. Su huella ya
 *    va impresa en el QR de una factura probablemente entregada, y suprimir un RF
 *    generado es lo que prohíben los arts. 7 y 10. El remedio ante un rechazo es
 *    un alta de **subsanación** con `Subsanacion="S"` y `RechazoPrevio="X"`, que
 *    ocupa una posición **nueva**: ver {@link datosSubsanacionTrasRechazo}.
 *  - Y la facturación «NUNCA debe interrumpirse», dice la FAQ de desarrolladores.
 *
 * `fromState` existe para **rehidratar desde almacenamiento persistente**, no
 * para deshacer. Usarla para retroceder produce una bifurcación de la cadena.
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
      ...(this.state.lastIssuerNif === undefined
        ? {}
        : { previousIssuerNif: this.state.lastIssuerNif }),
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
      issuerNif: invoice.issuer.taxId.value,
      generationTimestamp,
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
      issuerNif: cancellation.issuer.taxId.value,
      generationTimestamp,
    });

    // Return cancellation with hash and chain reference
    return {
      ...cancellation,
      hash,
      chainReference,
    };
  }

  /**
   * Avanza el estado. Privado y sin contrapartida: no existe `revert`.
   */
  private updateState(record: {
    hash: string;
    date: Date;
    series?: string;
    number: string;
    issuerNif?: string;
    generationTimestamp?: Date;
  }): void {
    this.state = {
      lastHash: record.hash,
      lastDate: record.date,
      lastSeries: record.series,
      lastNumber: record.number,
      recordCount: this.state.recordCount + 1,
      isFirst: false,
      ...(record.issuerNif === undefined ? {} : { lastIssuerNif: record.issuerNif }),
      ...(record.generationTimestamp === undefined
        ? {}
        : { lastGenerationTimestamp: record.generationTimestamp }),
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

/** Marcas de subsanación de un alta. */
export interface DatosSubsanacion {
  /** Siempre `'S'`: el registro subsana a otro anterior. */
  readonly subsanacion: 'S';
  /**
   * `'X'` si el registro subsanado **no consta en la AEAT** (fue rechazado),
   * `'N'` si sí consta.
   */
  readonly rechazoPrevio: 'X' | 'N';
}

/**
 * Marcas para subsanar un registro que la AEAT **rechazó**.
 *
 * El rechazado no se rehace ni se retira de la cadena: se le añade un sucesor.
 * Como no consta en la AEAT, el nuevo lleva `RechazoPrevio="X"`, que el propio
 * XSD documenta como «el registro de facturación no existe en la AEAT».
 */
export function datosSubsanacionTrasRechazo(): DatosSubsanacion {
  return { subsanacion: 'S', rechazoPrevio: 'X' };
}

/**
 * Marcas para subsanar un registro que la AEAT **sí aceptó**, típicamente uno
 * devuelto como «Aceptado con errores».
 */
export function datosSubsanacionTrasAceptacion(): DatosSubsanacion {
  return { subsanacion: 'S', rechazoPrevio: 'N' };
}
