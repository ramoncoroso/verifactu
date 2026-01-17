/**
 * XML Template for Alta (Invoice Registration) Record
 *
 * Builds the XML structure for registering invoices in Verifactu
 */

import type { Invoice } from '../../models/invoice.js';
import type { Issuer, Recipient, SoftwareInfo } from '../../models/party.js';
import type { TaxBreakdown, VatBreakdown, ExemptBreakdown, NonSubjectBreakdown } from '../../models/tax.js';
import { element, formatXmlDate, formatXmlDateTime, formatXmlNumber } from '../builder.js';
import type { XmlElement } from '../builder.js';

/**
 * Build issuer (Emisor) XML
 */
export function buildIssuerXml(issuer: Issuer): XmlElement {
  return element('IDEmisorFactura')
    .child(element('NIF').text(issuer.taxId.value))
    .build();
}

/**
 * Build recipient (Destinatario) XML
 */
export function buildRecipientXml(recipient: Recipient): XmlElement {
  const recipientBuilder = element('Destinatario');

  if (recipient.taxId.type === 'NIF') {
    recipientBuilder.child(element('NIF').text(recipient.taxId.value));
  } else {
    const idOtroBuilder = element('IDOtro')
      .child(element('CodigoPais').text(recipient.taxId.country ?? 'ES'))
      .child(element('IDType').text(recipient.taxId.type))
      .child(element('ID').text(recipient.taxId.value));
    recipientBuilder.child(idOtroBuilder);
  }

  recipientBuilder.child(element('NombreRazon').text(recipient.name));

  return recipientBuilder.build();
}

/**
 * Build software info XML
 */
export function buildSoftwareInfoXml(info: SoftwareInfo): XmlElement {
  return element('SistemaInformatico')
    .child(element('NombreRazon').text(info.name))
    .child(element('NIF').text(info.developerTaxId))
    .child(element('NombreSistemaInformatico').text(info.name))
    .child(element('IdSistemaInformatico').text(info.installationNumber))
    .child(element('Version').text(info.version))
    .child(element('NumeroInstalacion').text(info.installationNumber))
    .child(element('TipoUsoPosibleSoloVerifactu').text(info.systemType))
    .child(element('TipoUsoPosibleMultiOT').text('N'))
    .child(element('IndicadorMultiplesOT').text('N'))
    .build();
}

/**
 * Build VAT breakdown (DetalleDesglose) XML for subject operations
 */
export function buildVatBreakdownXml(breakdown: VatBreakdown): XmlElement {
  const detailBuilder = element('DetalleDesglose')
    .child(element('Impuesto').text('01')) // 01 = IVA
    .child(element('ClaveRegimen').text('01')) // 01 = General regime
    .child(element('CalificacionOperacion').text('S1')) // S1 = Subject and not exempt
    .child(element('TipoImpositivo').text(formatXmlNumber(breakdown.vatRate, 2)))
    .child(element('BaseImponibleOImporteNoSujeto').text(formatXmlNumber(breakdown.taxBase, 2)))
    .child(element('CuotaRepercutida').text(formatXmlNumber(breakdown.vatAmount, 2)));

  if (breakdown.equivalenceSurchargeRate !== undefined && breakdown.equivalenceSurchargeAmount !== undefined) {
    detailBuilder
      .child(element('TipoRecargoEquivalencia').text(formatXmlNumber(breakdown.equivalenceSurchargeRate, 2)))
      .child(element('CuotaRecargoEquivalencia').text(formatXmlNumber(breakdown.equivalenceSurchargeAmount, 2)));
  }

  return detailBuilder.build();
}

/**
 * Build exempt breakdown XML
 */
export function buildExemptBreakdownXml(breakdown: ExemptBreakdown): XmlElement {
  return element('DetalleDesglose')
    .child(element('Impuesto').text('01'))
    .child(element('ClaveRegimen').text('01'))
    .child(element('CalificacionOperacion').text('E'))
    .child(element('OperacionExenta').text(breakdown.cause))
    .child(element('BaseImponibleOImporteNoSujeto').text(formatXmlNumber(breakdown.taxBase, 2)))
    .build();
}

/**
 * Build non-subject breakdown XML
 */
export function buildNonSubjectBreakdownXml(breakdown: NonSubjectBreakdown): XmlElement {
  return element('DetalleDesglose')
    .child(element('Impuesto').text('01'))
    .child(element('ClaveRegimen').text('01'))
    .child(element('CalificacionOperacion').text('N'))
    .child(element('OperacionNoSujeta').text(breakdown.cause))
    .child(element('BaseImponibleOImporteNoSujeto').text(formatXmlNumber(breakdown.amount, 2)))
    .build();
}

/**
 * Build complete tax breakdown (Desglose) XML
 */
export function buildTaxBreakdownXml(breakdown: TaxBreakdown): XmlElement {
  const desgloseBuilder = element('Desglose');

  // VAT breakdowns
  if (breakdown.vatBreakdowns) {
    for (const vat of breakdown.vatBreakdowns) {
      desgloseBuilder.child(buildVatBreakdownXml(vat));
    }
  }

  // Exempt breakdowns
  if (breakdown.exemptBreakdowns) {
    for (const exempt of breakdown.exemptBreakdowns) {
      desgloseBuilder.child(buildExemptBreakdownXml(exempt));
    }
  }

  // Non-subject breakdowns
  if (breakdown.nonSubjectBreakdowns) {
    for (const nonSubject of breakdown.nonSubjectBreakdowns) {
      desgloseBuilder.child(buildNonSubjectBreakdownXml(nonSubject));
    }
  }

  return desgloseBuilder.build();
}

/**
 * Build chain reference (Encadenamiento) XML
 */
export function buildChainReferenceXml(
  previousHash: string,
  previousDate: Date,
  previousSeries: string | undefined,
  previousNumber: string
): XmlElement {
  const chainBuilder = element('Encadenamiento')
    .child(element('PrimerRegistro').text('N'));

  const refBuilder = element('RegistroAnterior')
    .child(element('Huella').text(previousHash))
    .child(element('FechaExpedicionFactura').text(formatXmlDate(previousDate)));

  if (previousSeries) {
    refBuilder.child(element('SerieFactura').text(previousSeries));
  }
  refBuilder.child(element('NumFactura').text(previousNumber));

  chainBuilder.child(refBuilder);

  return chainBuilder.build();
}

/**
 * Build first record chain reference
 */
export function buildFirstRecordChainXml(): XmlElement {
  return element('Encadenamiento')
    .child(element('PrimerRegistro').text('S'))
    .build();
}

/**
 * Build complete Alta (registration) record XML
 */
export function buildAltaRecordXml(
  invoice: Invoice,
  softwareInfo: SoftwareInfo,
  hash: string,
  isFirstRecord: boolean = false
): XmlElement {
  const recordBuilder = element('RegistroFactura');

  // IDFactura
  const idFacturaBuilder = element('IDFactura')
    .child(buildIssuerXml(invoice.issuer))
    .child(element('NumSerieFactura').text(
      invoice.id.series ? `${invoice.id.series}${invoice.id.number}` : invoice.id.number
    ))
    .child(element('FechaExpedicionFactura').text(formatXmlDate(invoice.id.issueDate)));

  recordBuilder.child(idFacturaBuilder);

  // NombreRazonEmisor
  recordBuilder.child(element('NombreRazonEmisor').text(invoice.issuer.name));

  // TipoFactura
  recordBuilder.child(element('TipoFactura').text(invoice.invoiceType));

  // TipoRectificativa (if applicable)
  if (invoice.rectifiedInvoiceType) {
    recordBuilder.child(element('TipoRectificativa').text(invoice.rectifiedInvoiceType));
  }

  // FacturasRectificadas (if applicable)
  if (invoice.rectifiedInvoices && invoice.rectifiedInvoices.length > 0) {
    const rectifiedBuilder = element('FacturasRectificadas');
    for (const ref of invoice.rectifiedInvoices) {
      const refBuilder = element('IDFacturaRectificada')
        .child(element('IDEmisorFactura').child(element('NIF').text(ref.issuerTaxId)))
        .child(element('NumSerieFactura').text(
          ref.invoiceId.series
            ? `${ref.invoiceId.series}${ref.invoiceId.number}`
            : ref.invoiceId.number
        ))
        .child(element('FechaExpedicionFactura').text(formatXmlDate(ref.invoiceId.issueDate)));
      rectifiedBuilder.child(refBuilder);
    }
    recordBuilder.child(rectifiedBuilder);
  }

  // DescripcionOperacion
  if (invoice.description) {
    recordBuilder.child(element('DescripcionOperacion').text(invoice.description));
  }

  // Destinatarios
  if (invoice.recipients && invoice.recipients.length > 0) {
    const destinatariosBuilder = element('Destinatarios');
    for (const recipient of invoice.recipients) {
      const destBuilder = element('IDDestinatario');
      destBuilder.child(buildRecipientXml(recipient));
      destinatariosBuilder.child(destBuilder);
    }
    recordBuilder.child(destinatariosBuilder);
  }

  // Desglose
  recordBuilder.child(buildTaxBreakdownXml(invoice.taxBreakdown));

  // CuotaTotal
  const vatTotal = invoice.taxBreakdown.vatBreakdowns?.reduce((sum, v) => sum + v.vatAmount, 0) ?? 0;
  recordBuilder.child(element('CuotaTotal').text(formatXmlNumber(vatTotal, 2)));

  // ImporteTotal
  recordBuilder.child(element('ImporteTotal').text(formatXmlNumber(invoice.totalAmount, 2)));

  // Encadenamiento
  if (isFirstRecord) {
    recordBuilder.child(buildFirstRecordChainXml());
  } else if (invoice.chainReference) {
    recordBuilder.child(buildChainReferenceXml(
      invoice.chainReference.previousHash,
      invoice.chainReference.previousDate,
      invoice.chainReference.previousSeries,
      invoice.chainReference.previousNumber
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
 * Build the complete SOAP envelope for Alta request
 */
export function buildAltaSoapEnvelope(
  invoice: Invoice,
  softwareInfo: SoftwareInfo,
  hash: string,
  isFirstRecord: boolean = false
): string {
  const record = buildAltaRecordXml(invoice, softwareInfo, hash, isFirstRecord);

  const envelope = element('soapenv:Envelope')
    .attr('xmlns:soapenv', 'http://schemas.xmlsoap.org/soap/envelope/')
    .attr('xmlns:sum', 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd')
    .child(
      element('soapenv:Header')
    )
    .child(
      element('soapenv:Body')
        .child(
          element('sum:SuministroLRFacturasEmitidas')
            .child(
              element('sum:Cabecera')
                .child(element('sum:ObligadoEmision')
                  .child(element('sum:NombreRazon').text(invoice.issuer.name))
                  .child(element('sum:NIF').text(invoice.issuer.taxId.value))
                )
            )
            .child(
              element('sum:RegistroLRFacturasEmitidas')
                .child(record)
            )
        )
    );

  return `<?xml version="1.0" encoding="UTF-8"?>${envelope.build().children.map(c => '').join('')}`;
}
