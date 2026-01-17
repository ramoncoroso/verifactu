/**
 * XML Template for Anulación (Invoice Cancellation) Record
 *
 * Builds the XML structure for cancelling invoices in Verifactu
 */

import type { InvoiceCancellation } from '../../models/invoice.js';
import type { SoftwareInfo } from '../../models/party.js';
import { element, formatXmlDate, formatXmlDateTime } from '../builder.js';
import type { XmlElement } from '../builder.js';
import { buildIssuerXml, buildSoftwareInfoXml, buildChainReferenceXml, buildFirstRecordChainXml } from './alta.js';

/**
 * Build Anulación (cancellation) record XML
 */
export function buildAnulacionRecordXml(
  cancellation: InvoiceCancellation,
  softwareInfo: SoftwareInfo,
  hash: string,
  isFirstRecord: boolean = false
): XmlElement {
  const recordBuilder = element('RegistroAnulacion');

  // IDFactura
  const idFacturaBuilder = element('IDFactura')
    .child(buildIssuerXml(cancellation.issuer))
    .child(element('NumSerieFactura').text(
      cancellation.invoiceId.series
        ? `${cancellation.invoiceId.series}${cancellation.invoiceId.number}`
        : cancellation.invoiceId.number
    ))
    .child(element('FechaExpedicionFactura').text(formatXmlDate(cancellation.invoiceId.issueDate)));

  recordBuilder.child(idFacturaBuilder);

  // Encadenamiento
  if (isFirstRecord) {
    recordBuilder.child(buildFirstRecordChainXml());
  } else if (cancellation.chainReference) {
    recordBuilder.child(buildChainReferenceXml(
      cancellation.chainReference.previousHash,
      cancellation.chainReference.previousDate,
      cancellation.chainReference.previousSeries,
      cancellation.chainReference.previousNumber
    ));
  }

  // SistemaInformatico
  recordBuilder.child(buildSoftwareInfoXml(softwareInfo));

  // FechaHoraHusoGenRegistro
  recordBuilder.child(element('FechaHoraHusoGenRegistro').text(formatXmlDateTime(new Date())));

  // Huella
  recordBuilder.child(element('Huella').text(hash));

  return recordBuilder.build();
}

/**
 * Build the complete SOAP envelope for Anulación request
 */
export function buildAnulacionSoapEnvelope(
  cancellation: InvoiceCancellation,
  softwareInfo: SoftwareInfo,
  hash: string,
  isFirstRecord: boolean = false
): string {
  const record = buildAnulacionRecordXml(cancellation, softwareInfo, hash, isFirstRecord);

  const envelope = element('soapenv:Envelope')
    .attr('xmlns:soapenv', 'http://schemas.xmlsoap.org/soap/envelope/')
    .attr('xmlns:sum', 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd')
    .child(
      element('soapenv:Header')
    )
    .child(
      element('soapenv:Body')
        .child(
          element('sum:BajaLRFacturasEmitidas')
            .child(
              element('sum:Cabecera')
                .child(element('sum:ObligadoEmision')
                  .child(element('sum:NombreRazon').text(cancellation.issuer.name))
                  .child(element('sum:NIF').text(cancellation.issuer.taxId.value))
                )
            )
            .child(
              element('sum:RegistroLRBajaExpedidas')
                .child(record)
            )
        )
    );

  return `<?xml version="1.0" encoding="UTF-8"?>${envelope.build().children.map(c => '').join('')}`;
}
