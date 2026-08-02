/**
 * Verifactu Client - High-Level API
 *
 * Main client for interacting with AEAT Verifactu services.
 * Provides a simple, type-safe API for submitting invoices and cancellations.
 */

import type { Invoice, InvoiceCancellation, InvoiceId } from '../models/invoice.js';
import type { SoftwareInfo, Issuer } from '../models/party.js';
import type { CertificateConfig, CertificateManager } from '../crypto/certificate.js';
import { createCertificateManager } from '../crypto/certificate.js';
import { RecordChain } from '../crypto/chain.js';
import type { ChainState } from '../crypto/chain.js';
import { SoapClient, createSoapClient } from './soap-client.js';
import { getEndpoints, SOAP_ACTIONS, type Environment, type ServiceEndpoints } from './endpoints.js';
import { MAX_RECORDS_PER_SUBMISSION } from './endpoints.js';
import { SubmissionPacer, type PacerState, type SubmissionPacerOptions } from './pacer.js';
import { buildNumSerieFactura, formatAeatDate } from '../format/aeat.js';
import {
  assertAltaEmisible,
  mapCabecera,
  mapCancellationToRegistroAnulacion,
  mapInvoiceToRegistroAlta,
} from '../xml/mapping/invoice-to-registro.js';
import {
  buildRegFactuSistemaFacturacion,
  wrapSoapEnvelope,
  type RegistroInput,
} from '../xml/verifactu/registro.js';
import { ErrorCode } from '../errors/base-error.js';
import { ValidationError } from '../errors/validation-errors.js';
import {
  fueAceptado,
  parseConsultaResponse as parseConsulta,
  parseSuministroResponse,
  type EstadoEnvio,
  type EstadoRegistro,
  type RegistroDuplicadoInfo,
  type RespuestaLinea,
} from './respuesta.js';
import type { XmlNode } from '../xml/parser.js';
import { withRetry, type RetryOptions } from './retry.js';
import { ConcurrencyLimiter, type ConcurrencyStats } from './concurrency.js';
import { type Logger, noopLogger, sanitizeXmlForLogging } from './logger.js';

/**
 * Client configuration
 */
export interface VerifactuClientConfig {
  /** Environment (production or sandbox) */
  environment: Environment;
  /** Certificate configuration */
  certificate: CertificateConfig;
  /** Software information */
  software: SoftwareInfo;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Initial chain state (for resuming) */
  chainState?: ChainState;
  /** Default retry options for all operations */
  retry?: RetryOptions;
  /** Maximum concurrent requests to AEAT (default: unlimited) */
  maxConcurrency?: number;
  /** Timeout in ms for waiting in queue when at capacity (default: 30000) */
  queueTimeout?: number;
  /** Logger for debugging and monitoring (default: noop) */
  logger?: Logger;
  /**
   * Control de flujo del art. 16.2 de la OM HAC/1177/2024.
   *
   * **Activo por defecto**, con los 60 s que fija la norma: es un «deberán
   * implementar», no una recomendación, y la AEAT dispone de un mecanismo de
   * suspensión temporal del acceso. Se puede desactivar con `false` si la
   * cadencia se gobierna fuera de la librería —una cola compartida entre varios
   * procesos, por ejemplo—, pero entonces la responsabilidad es de quien lo
   * desactiva.
   *
   * Para no perder la cadencia al reiniciar, persiste `getFlowControlState()` y
   * devuélvelo aquí en `state`.
   */
  flowControl?: FlowControlOptions | false;
}

/** Opciones del control de flujo. Ver {@link SubmissionPacer}. */
export type FlowControlOptions = SubmissionPacerOptions;

/**
 * Submit invoice response
 */
export interface SubmitInvoiceResponse {
  /** Whether the submission was accepted */
  accepted: boolean;
  /**
   * Estado del registro.
   *
   * `Incorrecto`, no `Rechazado`: ese valor nunca existió en el enumerado de la
   * AEAT y el tipo anterior lo declaraba.
   */
  state: EstadoRegistro;
  /** Estado global del envío. */
  estadoEnvio?: EstadoEnvio;
  /** Segundos a esperar antes del siguiente envío (art. 16.2). */
  tiempoEsperaEnvioSeconds?: number;
  /** Sello temporal de la AEAT, que acredita la remisión. */
  timestampPresentacion?: Date;
  /** Presente si el registro ya constaba: no es un fallo. */
  alreadyRegistered?: RegistroDuplicadoInfo;
  /** AEAT CSV (secure verification code) */
  csv?: string;
  /** Error code (if rejected) */
  errorCode?: string;
  /** Error description (if rejected) */
  errorDescription?: string;
  /** Processed invoice with hash */
  invoice: Invoice & { hash: string };
}

/**
 * Resultado de un envío por lotes.
 *
 * `estadoEnvio` es global y **no sirve para decidir nada por registro**:
 * `ParcialmenteCorrecto` no implica que haya rechazos —basta un
 * `AceptadoConErrores`—, así que la decisión se toma con el `state` de cada
 * resultado.
 */
export interface SubmitBatchResponse {
  /** Un resultado por factura, en el orden en que se enviaron. */
  readonly results: readonly SubmitInvoiceResponse[];
  /** Estado global del envío. */
  readonly estadoEnvio: EstadoEnvio;
  /** Segundos a esperar antes del siguiente envío (art. 16.2). */
  readonly tiempoEsperaEnvioSeconds: number;
  /** CSV del envío, si se generó. */
  csv?: string;
  /** Sello temporal de la AEAT. */
  timestampPresentacion?: Date;
}

/**
 * Submit cancellation response
 */
export interface SubmitCancellationResponse {
  /** Whether the cancellation was accepted */
  accepted: boolean;
  /** Estado del registro. */
  state: EstadoRegistro;
  /** Estado global del envío. */
  estadoEnvio?: EstadoEnvio;
  /** Segundos a esperar antes del siguiente envío (art. 16.2). */
  tiempoEsperaEnvioSeconds?: number;
  /** Sello temporal de la AEAT. */
  timestampPresentacion?: Date;
  /** Presente si el registro ya constaba. */
  alreadyRegistered?: RegistroDuplicadoInfo;
  /** AEAT CSV (secure verification code) */
  csv?: string;
  /** Error code (if rejected) */
  errorCode?: string;
  /** Error description (if rejected) */
  errorDescription?: string;
  /** Processed cancellation with hash */
  cancellation: InvoiceCancellation & { hash: string };
}

/**
 * Invoice status query response
 */
export interface InvoiceStatusResponse {
  /** Whether the invoice was found */
  found: boolean;
  /** Invoice state */
  state?: string;
  /** AEAT CSV */
  csv?: string;
  /** Registration timestamp */
  registrationTimestamp?: Date;
}

/**
 * Verifactu Client
 *
 * Main entry point for the library. Provides methods for:
 * - Submitting invoices (alta)
 * - Cancelling invoices (anulación)
 * - Querying invoice status
 */
export class VerifactuClient {
  private readonly endpoints: ServiceEndpoints;
  private readonly certificateManager: CertificateManager;
  private readonly soapClient: SoapClient;
  private chain: RecordChain; // Not readonly - needs to be restored on retry
  private readonly software: SoftwareInfo;
  private readonly retryOptions?: RetryOptions;
  private readonly concurrencyLimiter: ConcurrencyLimiter;
  /** `undefined` solo si se ha desactivado explícitamente. */
  private readonly pacer: SubmissionPacer | undefined;
  private readonly logger: Logger;

  constructor(config: VerifactuClientConfig) {
    this.endpoints = getEndpoints(config.environment);
    this.certificateManager = createCertificateManager(config.certificate);
    this.soapClient = createSoapClient(
      this.certificateManager.getTlsOptions(),
      config.timeout
    );
    this.chain = config.chainState
      ? RecordChain.fromState(config.chainState)
      : RecordChain.create();
    this.software = config.software;
    this.retryOptions = config.retry;
    this.concurrencyLimiter = new ConcurrencyLimiter({
      maxConcurrency: config.maxConcurrency,
      queueTimeout: config.queueTimeout,
    });
    this.pacer =
      config.flowControl === false ? undefined : new SubmissionPacer(config.flowControl ?? {});
    this.logger = config.logger ?? noopLogger;
  }

  /**
   * Ejecuta un envío respetando la cadencia del art. 16.2.
   *
   * El hueco se consume **antes** de la petición y no se devuelve si esta
   * falla: la norma cuenta «desde el anterior envío», no desde la respuesta.
   */
  private async enviar<T>(operacion: () => Promise<T>): Promise<T> {
    if (this.pacer) await this.pacer.acquire();
    return this.concurrencyLimiter.execute(operacion);
  }

  /** Estado del control de flujo, para persistirlo entre procesos. */
  getFlowControlState(): PacerState {
    return this.pacer?.getState() ?? { waitSeconds: 0 };
  }

  /**
   * Submit an invoice to AEAT
   */
  /**
   * Genera el registro y su XML. **Se llama una sola vez por factura.**
   *
   * Va aparte del envío a propósito. El defecto anterior era que
   * `submitInvoiceWithRetry` reinvocaba `submitInvoice` entero, que ejecutaba
   * `new Date()` de nuevo; como `FechaHoraHusoGenRegistro` entra en la huella,
   * cada reintento producía **un registro distinto para la misma factura**,
   * justo cuando el primer envío pudo haber llegado a la AEAT.
   */
  private prepareAlta(invoice: Invoice): {
    processed: Invoice & { hash: string };
    body: string;
  } {
    // Antes de nada: si la factura no puede convertirse en un registro válido,
    // se rechaza SIN tocar la cadena. Validar después de `processInvoice`
    // dejaba el estado apuntando a un registro que no llegó a generarse.
    assertAltaEmisible(invoice);

    const timestamp = new Date();
    const isFirst = this.chain.isFirstRecord();
    const processed = this.chain.processInvoice(invoice, timestamp);
    return { processed, body: this.buildAltaSoapBody(processed, timestamp, isFirst) };
  }

  /** Envía un cuerpo ya construido y parsea la respuesta. Es lo único que se reintenta. */
  private async sendAlta(
    body: string,
    processed: Invoice & { hash: string },
    invoiceNum: string,
    startTime: number
  ): Promise<SubmitInvoiceResponse> {
    try {
      const response = await this.enviar(() =>
        this.soapClient.send(this.endpoints.alta, SOAP_ACTIONS.ALTA, body)
      );
      const result = this.parseAltaResponse(response.xml, processed);
      this.pacer?.updateFromResponse(result.tiempoEsperaEnvioSeconds);
      const durationMs = Date.now() - startTime;

      if (result.accepted) {
        this.logger.info('Invoice submitted successfully', {
          operation: 'submitInvoice',
          invoiceId: invoiceNum,
          state: result.state,
          csv: result.csv,
          durationMs,
        });
      } else {
        // El registro NO se retira de la cadena: ya está generado y su huella
        // impresa. El remedio normativo es un alta de subsanación.
        this.logger.warn('Invoice rejected', {
          operation: 'submitInvoice',
          invoiceId: invoiceNum,
          state: result.state,
          errorCode: result.errorCode,
          errorDescription: result.errorDescription,
          durationMs,
        });
      }
      return result;
    } catch (error) {
      this.logger.error('Invoice submission failed', {
        operation: 'submitInvoice',
        invoiceId: invoiceNum,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Registra una factura en la AEAT.
   */
  async submitInvoice(invoice: Invoice): Promise<SubmitInvoiceResponse> {
    const startTime = Date.now();
    const invoiceNum = buildNumSerieFactura(invoice.id);

    this.logger.info('Submitting invoice', {
      operation: 'submitInvoice',
      invoiceId: invoiceNum,
      issuerNif: invoice.issuer.taxId.value.slice(-4),
      invoiceType: invoice.invoiceType,
    });

    const { processed, body } = this.prepareAlta(invoice);

    this.logger.debug('SOAP request built', {
      operation: 'submitInvoice',
      invoiceId: invoiceNum,
      xml: sanitizeXmlForLogging(body),
    });

    return this.sendAlta(body, processed, invoiceNum, startTime);
  }

  /**
   * Registra un lote de facturas en **una sola** petición.
   *
   * Es la otra rama del art. 16.2: «deberá esperar a que transcurran "t"
   * segundos desde el anterior envío **o** deberá esperar a tener acumulados un
   * número de registros igual al límite establecido […], la circunstancia que
   * ocurra primero». Sin API de lote esa rama era inalcanzable y el caudal
   * quedaba en una factura cada «t» segundos.
   *
   * El límite son {@link MAX_RECORDS_PER_SUBMISSION} registros, el
   * `maxOccurs="1000"` del `SuministroLR.xsd`.
   *
   * Las facturas se validan **todas** antes de tocar la cadena: un lote que
   * falla a medias dejaría registros generados sin enviar.
   */
  async submitInvoices(invoices: readonly Invoice[]): Promise<SubmitBatchResponse> {
    const startTime = Date.now();

    if (invoices.length === 0) {
      throw new ValidationError(
        'Un envío debe llevar al menos un registro',
        ErrorCode.VALIDATION_ERROR,
        { field: 'invoices' }
      );
    }
    if (invoices.length > MAX_RECORDS_PER_SUBMISSION) {
      throw new ValidationError(
        `Un envío admite como máximo ${MAX_RECORDS_PER_SUBMISSION} registros (llegaron ${invoices.length})`,
        ErrorCode.VALIDATION_ERROR,
        { field: 'invoices' }
      );
    }

    // Todo o nada: si una factura no es emisible, ninguna entra en la cadena.
    for (const invoice of invoices) assertAltaEmisible(invoice);

    this.logger.info('Submitting invoice batch', {
      operation: 'submitInvoices',
      recordCount: invoices.length,
      issuerNif: invoices[0]!.issuer.taxId.value.slice(-4),
    });

    const timestamp = new Date();
    const registros: RegistroInput[] = [];
    const procesadas: (Invoice & { hash: string })[] = [];

    for (const invoice of invoices) {
      const isFirst = this.chain.isFirstRecord();
      const processed = this.chain.processInvoice(invoice, timestamp);
      procesadas.push(processed);
      registros.push({
        alta: mapInvoiceToRegistroAlta(
          processed,
          this.software,
          processed.chainReference?.previousHash ?? '',
          timestamp,
          processed.hash,
          { isFirstRecord: isFirst }
        ),
      });
    }

    const body = wrapSoapEnvelope(
      buildRegFactuSistemaFacturacion(mapCabecera(invoices[0]!.issuer), registros)
    );

    const response = await this.enviar(() =>
      this.soapClient.send(this.endpoints.alta, SOAP_ACTIONS.ALTA, body)
    );
    const parsed = parseSuministroResponse(response.xml);
    this.pacer?.updateFromResponse(parsed.tiempoEsperaEnvioSeconds);

    const results = procesadas.map((processed, i) => {
      // Se casa por IDFactura, que es lo que devuelve la AEAT; el índice es solo
      // la red de seguridad para una respuesta que no las traiga.
      const numSerie = buildNumSerieFactura(processed.id);
      const linea =
        parsed.lineas.find((l) => l.idFactura?.numSerieFactura === numSerie) ?? parsed.lineas[i];

      const out: SubmitInvoiceResponse = {
        accepted: linea === undefined ? false : fueAceptado(linea),
        state: linea?.estadoRegistro ?? 'Incorrecto',
        estadoEnvio: parsed.estadoEnvio,
        tiempoEsperaEnvioSeconds: parsed.tiempoEsperaEnvioSeconds,
        invoice: processed,
      };
      if (parsed.csv !== undefined) out.csv = parsed.csv;
      if (parsed.timestampPresentacion !== undefined) {
        out.timestampPresentacion = parsed.timestampPresentacion;
      }
      if (linea?.codigoError !== undefined) out.errorCode = linea.codigoError;
      if (linea?.descripcionError !== undefined) out.errorDescription = linea.descripcionError;
      if (linea?.registroDuplicado !== undefined) out.alreadyRegistered = linea.registroDuplicado;
      return out;
    });

    this.logger.info('Invoice batch submitted', {
      operation: 'submitInvoices',
      recordCount: invoices.length,
      state: parsed.estadoEnvio,
      durationMs: Date.now() - startTime,
    });

    const salida: SubmitBatchResponse = {
      results,
      estadoEnvio: parsed.estadoEnvio,
      tiempoEsperaEnvioSeconds: parsed.tiempoEsperaEnvioSeconds,
    };
    if (parsed.csv !== undefined) salida.csv = parsed.csv;
    if (parsed.timestampPresentacion !== undefined) {
      salida.timestampPresentacion = parsed.timestampPresentacion;
    }
    return salida;
  }

  /**
   * Cancel an invoice
   */
  /** Genera el registro de anulación y su XML. Se llama una sola vez. */
  private prepareAnulacion(
    invoiceId: InvoiceId,
    issuer: Issuer,
    reason?: string
  ): { processed: InvoiceCancellation & { hash: string }; body: string } {
    const cancellation: InvoiceCancellation =
      reason !== undefined
        ? { operationType: 'AN', invoiceId, issuer, reason }
        : { operationType: 'AN', invoiceId, issuer };
    const timestamp = new Date();
    const isFirst = this.chain.isFirstRecord();
    const processed = this.chain.processCancellation(cancellation, timestamp);
    return { processed, body: this.buildAnulacionSoapBody(processed, timestamp, isFirst) };
  }

  /** Envía una anulación ya construida. Es lo único que se reintenta. */
  private async sendAnulacion(
    body: string,
    processed: InvoiceCancellation & { hash: string },
    invoiceNum: string,
    startTime: number
  ): Promise<SubmitCancellationResponse> {
    try {
      const response = await this.enviar(() =>
        this.soapClient.send(this.endpoints.anulacion, SOAP_ACTIONS.ANULACION, body)
      );
      const result = this.parseAnulacionResponse(response.xml, processed);
      this.pacer?.updateFromResponse(result.tiempoEsperaEnvioSeconds);
      const durationMs = Date.now() - startTime;

      if (result.accepted) {
        this.logger.info('Invoice cancelled successfully', {
          operation: 'cancelInvoice',
          invoiceId: invoiceNum,
          state: result.state,
          csv: result.csv,
          durationMs,
        });
      } else {
        this.logger.warn('Invoice cancellation rejected', {
          operation: 'cancelInvoice',
          invoiceId: invoiceNum,
          state: result.state,
          errorCode: result.errorCode,
          errorDescription: result.errorDescription,
          durationMs,
        });
      }
      return result;
    } catch (error) {
      this.logger.error('Invoice cancellation failed', {
        operation: 'cancelInvoice',
        invoiceId: invoiceNum,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /** Anula una factura registrada. */
  async cancelInvoice(
    invoiceId: InvoiceId,
    issuer: Issuer,
    reason?: string
  ): Promise<SubmitCancellationResponse> {
    const startTime = Date.now();
    const invoiceNum = buildNumSerieFactura(invoiceId);

    this.logger.info('Cancelling invoice', {
      operation: 'cancelInvoice',
      invoiceId: invoiceNum,
      issuerNif: issuer.taxId.value.slice(-4),
      reason: reason ?? 'not specified',
    });

    const { processed, body } = this.prepareAnulacion(invoiceId, issuer, reason);

    this.logger.debug('SOAP request built', {
      operation: 'cancelInvoice',
      invoiceId: invoiceNum,
      xml: sanitizeXmlForLogging(body),
    });

    return this.sendAnulacion(body, processed, invoiceNum, startTime);
  }

  /**
   * Check invoice status
   */
  async checkInvoiceStatus(
    invoiceId: InvoiceId,
    issuerNif: string
  ): Promise<InvoiceStatusResponse> {
    const startTime = Date.now();
    const invoiceNum = invoiceId.series
      ? `${invoiceId.series}${invoiceId.number}`
      : invoiceId.number;

    this.logger.info('Checking invoice status', {
      operation: 'checkInvoiceStatus',
      invoiceId: invoiceNum,
      issuerNif: issuerNif.slice(-4),
    });

    // Build query SOAP request
    const soapBody = this.buildConsultaSoapBody(invoiceId, issuerNif);

    this.logger.debug('SOAP request built', {
      operation: 'checkInvoiceStatus',
      invoiceId: invoiceNum,
      xml: sanitizeXmlForLogging(soapBody),
    });

    try {
      // Send request with concurrency limiting
      const response = await this.concurrencyLimiter.execute(() =>
        this.soapClient.send(
          this.endpoints.consulta,
          SOAP_ACTIONS.CONSULTA,
          soapBody
        )
      );

      // Parse response
      const result = this.parseConsultaResponse(response.xml);
      const durationMs = Date.now() - startTime;

      this.logger.info('Invoice status retrieved', {
        operation: 'checkInvoiceStatus',
        invoiceId: invoiceNum,
        found: result.found,
        state: result.state,
        durationMs,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error('Invoice status check failed', {
        operation: 'checkInvoiceStatus',
        invoiceId: invoiceNum,
        error: error instanceof Error ? error.message : String(error),
        durationMs,
      });
      throw error;
    }
  }

  /**
   * Submit an invoice to AEAT with automatic retry
   *
   * Uses exponential backoff with jitter for retryable errors.
   * Respects error-specific retry information when available.
   *
   * IMPORTANT: This method safely handles chain state on retry failures.
   * The chain state is restored before each retry attempt to prevent
   * chain corruption from duplicate record entries.
   *
   * @param invoice - The invoice to submit
   * @param options - Optional retry options (overrides client defaults)
   */
  async submitInvoiceWithRetry(
    invoice: Invoice,
    options?: RetryOptions
  ): Promise<SubmitInvoiceResponse> {
    const retryOpts = { ...this.retryOptions, ...options };
    const invoiceNum = buildNumSerieFactura(invoice.id);
    const startTime = Date.now();

    // El registro se genera UNA VEZ, fuera del reintento. Lo que se reintenta es
    // el envío de los mismos bytes. Reintentar es seguro porque la AEAT
    // identifica el registro por IDEmisorFactura + NumSerieFactura +
    // FechaExpedicionFactura —no por la huella— y devuelve el código 3000 con el
    // bloque RegistroDuplicado si ya constaba, que se interpreta como éxito.
    const { processed, body } = this.prepareAlta(invoice);

    return withRetry(() => this.sendAlta(body, processed, invoiceNum, startTime), {
      ...retryOpts,
      onRetry: (attempt, error, delayMs) => {
        this.logger.warn('Retrying invoice submission', {
          operation: 'submitInvoice',
          invoiceId: invoiceNum,
          attempt,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
        // Aquí se restauraba el estado de la cadena. Era el defecto: al
        // reinvocarse `submitInvoice` se regeneraba el registro con otro
        // instante y, por tanto, con otra huella.
        retryOpts.onRetry?.(attempt, error, delayMs);
      },
    });
  }

  /**
   * Cancel an invoice with automatic retry
   *
   * Uses exponential backoff with jitter for retryable errors.
   * Respects error-specific retry information when available.
   *
   * IMPORTANT: This method safely handles chain state on retry failures.
   * The chain state is restored before each retry attempt to prevent
   * chain corruption from duplicate record entries.
   *
   * @param invoiceId - The invoice ID to cancel
   * @param issuer - The invoice issuer
   * @param reason - Optional cancellation reason
   * @param options - Optional retry options (overrides client defaults)
   */
  async cancelInvoiceWithRetry(
    invoiceId: InvoiceId,
    issuer: Issuer,
    reason?: string,
    options?: RetryOptions
  ): Promise<SubmitCancellationResponse> {
    const retryOpts = { ...this.retryOptions, ...options };
    const invoiceNum = buildNumSerieFactura(invoiceId);
    const startTime = Date.now();

    // Igual que en el alta: el registro se genera una vez y el reintento reenvía
    // los mismos bytes.
    const { processed, body } = this.prepareAnulacion(invoiceId, issuer, reason);

    return withRetry(() => this.sendAnulacion(body, processed, invoiceNum, startTime), {
      ...retryOpts,
      onRetry: (attempt, error, delayMs) => {
        this.logger.warn('Retrying invoice cancellation', {
          operation: 'cancelInvoice',
          invoiceId: invoiceNum,
          attempt,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
        retryOpts.onRetry?.(attempt, error, delayMs);
      },
    });
  }

  /**
   * Check invoice status with automatic retry
   *
   * Uses exponential backoff with jitter for retryable errors.
   * Respects error-specific retry information when available.
   *
   * Note: This operation is read-only and does not modify chain state,
   * so it can be safely retried without any state management.
   *
   * @param invoiceId - The invoice ID to check
   * @param issuerNif - The issuer's NIF
   * @param options - Optional retry options (overrides client defaults)
   */
  async checkInvoiceStatusWithRetry(
    invoiceId: InvoiceId,
    issuerNif: string,
    options?: RetryOptions
  ): Promise<InvoiceStatusResponse> {
    const retryOpts = { ...this.retryOptions, ...options };
    const invoiceNum = invoiceId.series
      ? `${invoiceId.series}${invoiceId.number}`
      : invoiceId.number;

    return withRetry(
      () => this.checkInvoiceStatus(invoiceId, issuerNif),
      {
        ...retryOpts,
        onRetry: (attempt, error, delayMs) => {
          // Log retry attempt
          this.logger.warn('Retrying invoice status check', {
            operation: 'checkInvoiceStatus',
            invoiceId: invoiceNum,
            attempt,
            delayMs,
            error: error instanceof Error ? error.message : String(error),
          });

          // Call user's onRetry callback if provided
          retryOpts.onRetry?.(attempt, error, delayMs);
        },
      }
    );
  }

  /**
   * Get current chain state (for persistence)
   */
  getChainState(): ChainState {
    return this.chain.getState();
  }

  /**
   * Get software info
   */
  getSoftwareInfo(): SoftwareInfo {
    return this.software;
  }

  /**
   * Get concurrency statistics
   *
   * Returns information about current concurrency state:
   * - activeCount: Number of currently running operations
   * - queueLength: Number of operations waiting in queue
   * - maxConcurrency: Maximum allowed concurrent operations
   * - isAtCapacity: Whether the limiter is at capacity
   */
  getConcurrencyStats(): ConcurrencyStats {
    return this.concurrencyLimiter.getStats();
  }

  /**
   * Build SOAP body for Alta request
   */
  /**
   * Construye el envío de un alta.
   *
   * Delega en el generador conforme. La versión anterior interpolaba los valores
   * en plantillas de cadena sin escapar nada: una razón social con `&` rompía el
   * documento y una descripción con etiquetas inyectaba elementos.
   */
  private buildAltaSoapBody(
    invoice: Invoice & { hash: string },
    timestamp: Date,
    isFirst: boolean
  ): string {
    const previousHash = invoice.chainReference?.previousHash ?? '';
    const alta = mapInvoiceToRegistroAlta(
      invoice,
      this.software,
      previousHash,
      timestamp,
      invoice.hash,
      { isFirstRecord: isFirst }
    );
    return wrapSoapEnvelope(
      buildRegFactuSistemaFacturacion(mapCabecera(invoice.issuer), [{ alta }])
    );
  }

  /**
   * Construye el envío de una anulación.
   *
   * Va en el **mismo** mensaje `RegFactuSistemaFacturacion` que las altas: no
   * existe ninguna raíz `AnulaFactuSistemaFacturacion`, que era lo que emitía la
   * versión anterior.
   */
  private buildAnulacionSoapBody(
    cancellation: InvoiceCancellation & { hash: string },
    timestamp: Date,
    isFirst: boolean
  ): string {
    const previousHash = cancellation.chainReference?.previousHash ?? '';
    const anulacion = mapCancellationToRegistroAnulacion(
      cancellation,
      this.software,
      previousHash,
      timestamp,
      cancellation.hash,
      { isFirstRecord: isFirst }
    );
    return wrapSoapEnvelope(
      buildRegFactuSistemaFacturacion(mapCabecera(cancellation.issuer), [{ anulacion }])
    );
  }

  private buildConsultaSoapBody(invoiceId: InvoiceId, issuerNif: string): string {
    const numSerieFactura = invoiceId.series
      ? `${invoiceId.series}${invoiceId.number}`
      : invoiceId.number;

    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <sum:ConsultaFactuSistemaFacturacion>
      <sum:Cabecera>
        <sum:ObligadoEmision>
          <sum:NIF>${issuerNif}</sum:NIF>
        </sum:ObligadoEmision>
      </sum:Cabecera>
      <sum:FiltroConsulta>
        <sum:IDFactura>
          <sum:IDEmisorFactura>${issuerNif}</sum:IDEmisorFactura>
          <sum:NumSerieFactura>${numSerieFactura}</sum:NumSerieFactura>
          <sum:FechaExpedicionFactura>${formatAeatDate(invoiceId.issueDate)}</sum:FechaExpedicionFactura>
        </sum:IDFactura>
      </sum:FiltroConsulta>
    </sum:ConsultaFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  /**
   * Parse Alta response
   */
  /** Extrae de la respuesta los campos comunes a alta y anulación. */
  private parseLineaUnica(xml: XmlNode): {
    linea: RespuestaLinea;
    estadoEnvio: EstadoEnvio;
    tiempoEsperaEnvioSeconds: number;
    csv?: string;
    timestampPresentacion?: Date;
  } {
    const r = parseSuministroResponse(xml);
    // El envío que hace hoy el cliente lleva un solo registro. Con lotes habrá
    // que casar cada línea por IDFactura y RefExterna.
    const linea = r.lineas[0] ?? { estadoRegistro: 'Incorrecto' as const };
    const out: {
      linea: RespuestaLinea;
      estadoEnvio: EstadoEnvio;
      tiempoEsperaEnvioSeconds: number;
      csv?: string;
      timestampPresentacion?: Date;
    } = {
      linea,
      estadoEnvio: r.estadoEnvio,
      tiempoEsperaEnvioSeconds: r.tiempoEsperaEnvioSeconds,
    };
    if (r.csv !== undefined) out.csv = r.csv;
    if (r.timestampPresentacion !== undefined) out.timestampPresentacion = r.timestampPresentacion;
    return out;
  }

  private parseAltaResponse(
    xml: XmlNode,
    invoice: Invoice & { hash: string }
  ): SubmitInvoiceResponse {
    const { linea, estadoEnvio, tiempoEsperaEnvioSeconds, csv, timestampPresentacion } =
      this.parseLineaUnica(xml);

    const response: SubmitInvoiceResponse = {
      accepted: fueAceptado(linea),
      state: linea.estadoRegistro,
      estadoEnvio,
      tiempoEsperaEnvioSeconds,
      invoice,
    };
    if (csv !== undefined) response.csv = csv;
    if (timestampPresentacion !== undefined) response.timestampPresentacion = timestampPresentacion;
    if (linea.codigoError !== undefined) response.errorCode = linea.codigoError;
    if (linea.descripcionError !== undefined) response.errorDescription = linea.descripcionError;
    if (linea.registroDuplicado !== undefined) response.alreadyRegistered = linea.registroDuplicado;
    return response;
  }

  private parseAnulacionResponse(
    xml: XmlNode,
    cancellation: InvoiceCancellation & { hash: string }
  ): SubmitCancellationResponse {
    const { linea, estadoEnvio, tiempoEsperaEnvioSeconds, csv, timestampPresentacion } =
      this.parseLineaUnica(xml);

    const response: SubmitCancellationResponse = {
      accepted: fueAceptado(linea),
      state: linea.estadoRegistro,
      estadoEnvio,
      tiempoEsperaEnvioSeconds,
      cancellation,
    };
    if (csv !== undefined) response.csv = csv;
    if (timestampPresentacion !== undefined) response.timestampPresentacion = timestampPresentacion;
    if (linea.codigoError !== undefined) response.errorCode = linea.codigoError;
    if (linea.descripcionError !== undefined) response.errorDescription = linea.descripcionError;
    if (linea.registroDuplicado !== undefined) response.alreadyRegistered = linea.registroDuplicado;
    return response;
  }

  private parseConsultaResponse(xml: XmlNode): InvoiceStatusResponse {
    const r = parseConsulta(xml);
    const out: InvoiceStatusResponse = { found: r.found };
    if (r.estadoRegistro !== undefined) out.state = r.estadoRegistro;
    if (r.timestampUltimaModificacion !== undefined) {
      out.registrationTimestamp = r.timestampUltimaModificacion;
    }
    return out;
  }

}

/**
 * Create a Verifactu client
 */
export function createVerifactuClient(config: VerifactuClientConfig): VerifactuClient {
  return new VerifactuClient(config);
}
