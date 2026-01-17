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
import { AeatError } from '../errors/network-errors.js';
import { formatXmlDate, formatXmlDateTime, formatXmlNumber } from '../xml/builder.js';
import { findNode, getChildText } from '../xml/parser.js';
import type { XmlNode } from '../xml/parser.js';

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
}

/**
 * Submit invoice response
 */
export interface SubmitInvoiceResponse {
  /** Whether the submission was accepted */
  accepted: boolean;
  /** Record state from AEAT */
  state: 'Correcto' | 'AceptadoConErrores' | 'Rechazado';
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
 * Submit cancellation response
 */
export interface SubmitCancellationResponse {
  /** Whether the cancellation was accepted */
  accepted: boolean;
  /** Record state from AEAT */
  state: 'Correcto' | 'AceptadoConErrores' | 'Rechazado';
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
  private readonly chain: RecordChain;
  private readonly software: SoftwareInfo;

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
  }

  /**
   * Submit an invoice to AEAT
   */
  async submitInvoice(invoice: Invoice): Promise<SubmitInvoiceResponse> {
    const timestamp = new Date();
    const isFirst = this.chain.isFirstRecord();

    // Process invoice through chain
    const processedInvoice = this.chain.processInvoice(invoice, timestamp);

    // Build SOAP request
    const soapBody = this.buildAltaSoapBody(processedInvoice, timestamp, isFirst);

    // Send request
    const response = await this.soapClient.send(
      this.endpoints.alta,
      SOAP_ACTIONS.ALTA,
      soapBody
    );

    // Parse response
    return this.parseAltaResponse(response.xml, processedInvoice);
  }

  /**
   * Cancel an invoice
   */
  async cancelInvoice(
    invoiceId: InvoiceId,
    issuer: Issuer,
    reason?: string
  ): Promise<SubmitCancellationResponse> {
    const cancellation: InvoiceCancellation = reason !== undefined
      ? { operationType: 'AN', invoiceId, issuer, reason }
      : { operationType: 'AN', invoiceId, issuer };

    const timestamp = new Date();
    const isFirst = this.chain.isFirstRecord();

    // Process cancellation through chain
    const processedCancellation = this.chain.processCancellation(cancellation, timestamp);

    // Build SOAP request
    const soapBody = this.buildAnulacionSoapBody(processedCancellation, timestamp, isFirst);

    // Send request
    const response = await this.soapClient.send(
      this.endpoints.anulacion,
      SOAP_ACTIONS.ANULACION,
      soapBody
    );

    // Parse response
    return this.parseAnulacionResponse(response.xml, processedCancellation);
  }

  /**
   * Check invoice status
   */
  async checkInvoiceStatus(
    invoiceId: InvoiceId,
    issuerNif: string
  ): Promise<InvoiceStatusResponse> {
    // Build query SOAP request
    const soapBody = this.buildConsultaSoapBody(invoiceId, issuerNif);

    // Send request
    const response = await this.soapClient.send(
      this.endpoints.consulta,
      SOAP_ACTIONS.CONSULTA,
      soapBody
    );

    // Parse response
    return this.parseConsultaResponse(response.xml);
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
   * Build SOAP body for Alta request
   */
  private buildAltaSoapBody(
    invoice: Invoice & { hash: string },
    timestamp: Date,
    isFirst: boolean
  ): string {
    const vatTotal = invoice.taxBreakdown.vatBreakdowns?.reduce(
      (sum, v) => sum + v.vatAmount,
      0
    ) ?? 0;

    // Build invoice number
    const numSerieFactura = invoice.id.series
      ? `${invoice.id.series}${invoice.id.number}`
      : invoice.id.number;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <sum:RegFactuSistemaFacturacion>
      <sum:Cabecera>
        <sum:ObligadoEmision>
          <sum:NombreRazon>${invoice.issuer.name}</sum:NombreRazon>
          <sum:NIF>${invoice.issuer.taxId.value}</sum:NIF>
        </sum:ObligadoEmision>
      </sum:Cabecera>
      <sum:RegistroFactura>
        <sum:IDFactura>
          <sum:IDEmisorFactura>${invoice.issuer.taxId.value}</sum:IDEmisorFactura>
          <sum:NumSerieFactura>${numSerieFactura}</sum:NumSerieFactura>
          <sum:FechaExpedicionFactura>${formatXmlDate(invoice.id.issueDate)}</sum:FechaExpedicionFactura>
        </sum:IDFactura>
        <sum:NombreRazonEmisor>${invoice.issuer.name}</sum:NombreRazonEmisor>
        <sum:TipoFactura>${invoice.invoiceType}</sum:TipoFactura>`;

    // Add recipients if present
    if (invoice.recipients && invoice.recipients.length > 0) {
      xml += `\n        <sum:Destinatarios>`;
      for (const recipient of invoice.recipients) {
        xml += `\n          <sum:IDDestinatario>`;
        if (recipient.taxId.type === 'NIF') {
          xml += `\n            <sum:NIF>${recipient.taxId.value}</sum:NIF>`;
        } else {
          xml += `\n            <sum:IDOtro>
              <sum:CodigoPais>${recipient.taxId.country ?? 'ES'}</sum:CodigoPais>
              <sum:IDType>${recipient.taxId.type}</sum:IDType>
              <sum:ID>${recipient.taxId.value}</sum:ID>
            </sum:IDOtro>`;
        }
        xml += `\n            <sum:NombreRazon>${recipient.name}</sum:NombreRazon>`;
        xml += `\n          </sum:IDDestinatario>`;
      }
      xml += `\n        </sum:Destinatarios>`;
    }

    // Add description if present
    if (invoice.description) {
      xml += `\n        <sum:DescripcionOperacion>${invoice.description}</sum:DescripcionOperacion>`;
    }

    // Add tax breakdown
    xml += `\n        <sum:Desglose>`;
    if (invoice.taxBreakdown.vatBreakdowns) {
      for (const vat of invoice.taxBreakdown.vatBreakdowns) {
        xml += `\n          <sum:DetalleDesglose>
            <sum:Impuesto>01</sum:Impuesto>
            <sum:ClaveRegimen>01</sum:ClaveRegimen>
            <sum:CalificacionOperacion>S1</sum:CalificacionOperacion>
            <sum:TipoImpositivo>${formatXmlNumber(vat.vatRate, 2)}</sum:TipoImpositivo>
            <sum:BaseImponibleOImporteNoSujeto>${formatXmlNumber(vat.taxBase, 2)}</sum:BaseImponibleOImporteNoSujeto>
            <sum:CuotaRepercutida>${formatXmlNumber(vat.vatAmount, 2)}</sum:CuotaRepercutida>
          </sum:DetalleDesglose>`;
      }
    }
    xml += `\n        </sum:Desglose>`;

    // Add totals
    xml += `\n        <sum:CuotaTotal>${formatXmlNumber(vatTotal, 2)}</sum:CuotaTotal>`;
    xml += `\n        <sum:ImporteTotal>${formatXmlNumber(invoice.totalAmount, 2)}</sum:ImporteTotal>`;

    // Add chain reference
    if (isFirst) {
      xml += `\n        <sum:Encadenamiento>
          <sum:PrimerRegistro>S</sum:PrimerRegistro>
        </sum:Encadenamiento>`;
    } else if (invoice.chainReference) {
      const prevNum = invoice.chainReference.previousSeries
        ? `${invoice.chainReference.previousSeries}${invoice.chainReference.previousNumber}`
        : invoice.chainReference.previousNumber;
      xml += `\n        <sum:Encadenamiento>
          <sum:PrimerRegistro>N</sum:PrimerRegistro>
          <sum:RegistroAnterior>
            <sum:Huella>${invoice.chainReference.previousHash}</sum:Huella>
            <sum:FechaExpedicionFactura>${formatXmlDate(invoice.chainReference.previousDate)}</sum:FechaExpedicionFactura>
            <sum:NumSerieFactura>${prevNum}</sum:NumSerieFactura>
          </sum:RegistroAnterior>
        </sum:Encadenamiento>`;
    }

    // Add software info
    xml += `\n        <sum:SistemaInformatico>
          <sum:NombreRazon>${this.software.name}</sum:NombreRazon>
          <sum:NIF>${this.software.developerTaxId}</sum:NIF>
          <sum:NombreSistemaInformatico>${this.software.name}</sum:NombreSistemaInformatico>
          <sum:IdSistemaInformatico>${this.software.installationNumber}</sum:IdSistemaInformatico>
          <sum:Version>${this.software.version}</sum:Version>
          <sum:NumeroInstalacion>${this.software.installationNumber}</sum:NumeroInstalacion>
          <sum:TipoUsoPosibleSoloVerifactu>${this.software.systemType}</sum:TipoUsoPosibleSoloVerifactu>
          <sum:TipoUsoPosibleMultiOT>N</sum:TipoUsoPosibleMultiOT>
          <sum:IndicadorMultiplesOT>N</sum:IndicadorMultiplesOT>
        </sum:SistemaInformatico>`;

    // Add timestamp and hash
    xml += `\n        <sum:FechaHoraHusoGenRegistro>${formatXmlDateTime(timestamp)}</sum:FechaHoraHusoGenRegistro>`;
    xml += `\n        <sum:Huella>${invoice.hash}</sum:Huella>`;

    xml += `\n      </sum:RegistroFactura>
    </sum:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;

    return xml;
  }

  /**
   * Build SOAP body for Anulación request
   */
  private buildAnulacionSoapBody(
    cancellation: InvoiceCancellation & { hash: string },
    timestamp: Date,
    isFirst: boolean
  ): string {
    const numSerieFactura = cancellation.invoiceId.series
      ? `${cancellation.invoiceId.series}${cancellation.invoiceId.number}`
      : cancellation.invoiceId.number;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <sum:AnulaFactuSistemaFacturacion>
      <sum:Cabecera>
        <sum:ObligadoEmision>
          <sum:NombreRazon>${cancellation.issuer.name}</sum:NombreRazon>
          <sum:NIF>${cancellation.issuer.taxId.value}</sum:NIF>
        </sum:ObligadoEmision>
      </sum:Cabecera>
      <sum:RegistroAnulacion>
        <sum:IDFactura>
          <sum:IDEmisorFactura>${cancellation.issuer.taxId.value}</sum:IDEmisorFactura>
          <sum:NumSerieFactura>${numSerieFactura}</sum:NumSerieFactura>
          <sum:FechaExpedicionFactura>${formatXmlDate(cancellation.invoiceId.issueDate)}</sum:FechaExpedicionFactura>
        </sum:IDFactura>`;

    // Add chain reference
    if (isFirst) {
      xml += `\n        <sum:Encadenamiento>
          <sum:PrimerRegistro>S</sum:PrimerRegistro>
        </sum:Encadenamiento>`;
    } else if (cancellation.chainReference) {
      const prevNum = cancellation.chainReference.previousSeries
        ? `${cancellation.chainReference.previousSeries}${cancellation.chainReference.previousNumber}`
        : cancellation.chainReference.previousNumber;
      xml += `\n        <sum:Encadenamiento>
          <sum:PrimerRegistro>N</sum:PrimerRegistro>
          <sum:RegistroAnterior>
            <sum:Huella>${cancellation.chainReference.previousHash}</sum:Huella>
            <sum:FechaExpedicionFactura>${formatXmlDate(cancellation.chainReference.previousDate)}</sum:FechaExpedicionFactura>
            <sum:NumSerieFactura>${prevNum}</sum:NumSerieFactura>
          </sum:RegistroAnterior>
        </sum:Encadenamiento>`;
    }

    // Add software info
    xml += `\n        <sum:SistemaInformatico>
          <sum:NombreRazon>${this.software.name}</sum:NombreRazon>
          <sum:NIF>${this.software.developerTaxId}</sum:NIF>
          <sum:NombreSistemaInformatico>${this.software.name}</sum:NombreSistemaInformatico>
          <sum:IdSistemaInformatico>${this.software.installationNumber}</sum:IdSistemaInformatico>
          <sum:Version>${this.software.version}</sum:Version>
          <sum:NumeroInstalacion>${this.software.installationNumber}</sum:NumeroInstalacion>
          <sum:TipoUsoPosibleSoloVerifactu>${this.software.systemType}</sum:TipoUsoPosibleSoloVerifactu>
          <sum:TipoUsoPosibleMultiOT>N</sum:TipoUsoPosibleMultiOT>
          <sum:IndicadorMultiplesOT>N</sum:IndicadorMultiplesOT>
        </sum:SistemaInformatico>`;

    // Add timestamp and hash
    xml += `\n        <sum:FechaHoraHusoGenRegistro>${formatXmlDateTime(timestamp)}</sum:FechaHoraHusoGenRegistro>`;
    xml += `\n        <sum:Huella>${cancellation.hash}</sum:Huella>`;

    xml += `\n      </sum:RegistroAnulacion>
    </sum:AnulaFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;

    return xml;
  }

  /**
   * Build SOAP body for Consulta request
   */
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
          <sum:FechaExpedicionFactura>${formatXmlDate(invoiceId.issueDate)}</sum:FechaExpedicionFactura>
        </sum:IDFactura>
      </sum:FiltroConsulta>
    </sum:ConsultaFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  /**
   * Parse Alta response
   */
  private parseAltaResponse(
    xml: XmlNode,
    invoice: Invoice & { hash: string }
  ): SubmitInvoiceResponse {
    const respuesta = findNode(xml, 'RespuestaRegFactura') ?? findNode(xml, 'Respuesta');
    if (!respuesta) {
      throw new AeatError('Invalid response: missing RespuestaRegFactura');
    }

    const estado = getChildText(respuesta, 'EstadoRegistro') ?? getChildText(respuesta, 'Estado');
    const csv = getChildText(respuesta, 'CSV');
    const codigoError = getChildText(respuesta, 'CodigoErrorRegistro');
    const descripcionError = getChildText(respuesta, 'DescripcionErrorRegistro');

    const state = (estado as 'Correcto' | 'AceptadoConErrores' | 'Rechazado') ?? 'Rechazado';
    const accepted = state === 'Correcto' || state === 'AceptadoConErrores';

    const response: SubmitInvoiceResponse = { accepted, state, invoice };
    if (csv !== undefined) response.csv = csv;
    if (codigoError !== undefined) response.errorCode = codigoError;
    if (descripcionError !== undefined) response.errorDescription = descripcionError;
    return response;
  }

  /**
   * Parse Anulación response
   */
  private parseAnulacionResponse(
    xml: XmlNode,
    cancellation: InvoiceCancellation & { hash: string }
  ): SubmitCancellationResponse {
    const respuesta = findNode(xml, 'RespuestaAnulacion') ?? findNode(xml, 'Respuesta');
    if (!respuesta) {
      throw new AeatError('Invalid response: missing RespuestaAnulacion');
    }

    const estado = getChildText(respuesta, 'EstadoRegistro') ?? getChildText(respuesta, 'Estado');
    const csv = getChildText(respuesta, 'CSV');
    const codigoError = getChildText(respuesta, 'CodigoErrorRegistro');
    const descripcionError = getChildText(respuesta, 'DescripcionErrorRegistro');

    const state = (estado as 'Correcto' | 'AceptadoConErrores' | 'Rechazado') ?? 'Rechazado';
    const accepted = state === 'Correcto' || state === 'AceptadoConErrores';

    const response: SubmitCancellationResponse = { accepted, state, cancellation };
    if (csv !== undefined) response.csv = csv;
    if (codigoError !== undefined) response.errorCode = codigoError;
    if (descripcionError !== undefined) response.errorDescription = descripcionError;
    return response;
  }

  /**
   * Parse Consulta response
   */
  private parseConsultaResponse(xml: XmlNode): InvoiceStatusResponse {
    const respuesta = findNode(xml, 'RespuestaConsulta') ?? findNode(xml, 'Respuesta');
    if (!respuesta) {
      return { found: false };
    }

    const registro = findNode(respuesta, 'RegistroRespuestaConsulta');
    if (!registro) {
      return { found: false };
    }

    const estado = getChildText(registro, 'EstadoRegistro');
    const csv = getChildText(registro, 'CSV');
    const fechaHora = getChildText(registro, 'FechaHoraRegistro');

    const response: InvoiceStatusResponse = { found: true };
    if (estado !== undefined) response.state = estado;
    if (csv !== undefined) response.csv = csv;
    if (fechaHora !== undefined) response.registrationTimestamp = new Date(fechaHora);
    return response;
  }
}

/**
 * Create a Verifactu client
 */
export function createVerifactuClient(config: VerifactuClientConfig): VerifactuClient {
  return new VerifactuClient(config);
}
