/**
 * Modelo de dominio → entrada del generador de XML.
 *
 * Va aparte de `xml/verifactu/registro.ts` a propósito: aquello es una
 * transcripción mecánica del XSD, revisable línea a línea contra el esquema;
 * esto es donde vive la lógica opinable. Mezclarlos fue la razón de que nadie
 * detectara que faltaban `IDVersion` y `TipoHuella`.
 */

import {
  buildAltaHashFields,
  buildAnulacionHashFields,
  type HashFieldOptions,
} from '../../crypto/hash.js';
import {
  buildNumSerieFactura,
  formatAeatAmount,
  formatAeatDate,
  formatAeatRate,
  normalizeAeatText,
} from '../../format/aeat.js';
import { ErrorCode } from '../../errors/base-error.js';
import { ValidationError } from '../../errors/validation-errors.js';
import type { Invoice, InvoiceCancellation } from '../../models/invoice.js';
import type { SoftwareInfo, Party } from '../../models/party.js';
import { calculateCuotaTotal } from '../../models/tax.js';
import type {
  CabeceraInput,
  DetalleDesgloseInput,
  EncadenamientoInput,
  PersonaInput,
  RegistroAltaInput,
  RegistroAnulacionInput,
  SistemaInformaticoInput,
} from '../verifactu/registro.js';

/** Umbral de `Macrodato`: importe total superior a 100 millones de euros. */
const MACRODATO_UMBRAL = 100_000_000;

function persona(p: Party): PersonaInput {
  const base = { nombreRazon: normalizeAeatText(p.name) };
  return p.taxId.type === 'NIF'
    ? { ...base, nif: normalizeAeatText(p.taxId.value) }
    : {
        ...base,
        idOtro: {
          ...(p.taxId.country === undefined ? {} : { codigoPais: p.taxId.country }),
          idType: p.taxId.type,
          id: normalizeAeatText(p.taxId.value),
        },
      };
}

/** Datos del sistema informático. */
export function mapSistemaInformatico(s: SoftwareInfo): SistemaInformaticoInput {
  return {
    nombreRazon: normalizeAeatText(s.name),
    nif: normalizeAeatText(s.developerTaxId),
    nombreSistemaInformatico: normalizeAeatText(s.name),
    // `IdSistemaInformatico` es `maxLength 2`; el número de instalación puede
    // llegar a 100 caracteres, así que usarlo aquí producía un documento inválido.
    idSistemaInformatico: normalizeAeatText(s.installationNumber).slice(0, 2) || '01',
    version: normalizeAeatText(s.version),
    numeroInstalacion: normalizeAeatText(s.installationNumber),
    tipoUsoPosibleSoloVerifactu: s.systemType,
    tipoUsoPosibleMultiOT: 'N',
    indicadorMultiplesOT: 'N',
  };
}

/**
 * Desglose completo: IVA, exentas y no sujetas.
 *
 * Las dos últimas se descartaban en silencio, de modo que el `ImporteTotal` no
 * cuadraba con lo declarado.
 */
export function mapDesglose(invoice: Invoice): DetalleDesgloseInput[] {
  const lineas: DetalleDesgloseInput[] = [];
  const regimen = invoice.operationRegimes?.[0] ?? '01';

  for (const v of invoice.taxBreakdown.vatBreakdowns ?? []) {
    const linea: DetalleDesgloseInput = {
      impuesto: '01',
      claveRegimen: regimen,
      calificacionOperacion: 'S1',
      tipoImpositivo: formatAeatRate(v.vatRate),
      baseImponibleOimporteNoSujeto: formatAeatAmount(v.taxBase),
      cuotaRepercutida: formatAeatAmount(v.vatAmount),
      ...(v.equivalenceSurchargeRate !== undefined && v.equivalenceSurchargeAmount !== undefined
        ? {
            tipoRecargoEquivalencia: formatAeatRate(v.equivalenceSurchargeRate),
            cuotaRecargoEquivalencia: formatAeatAmount(v.equivalenceSurchargeAmount),
          }
        : {}),
    };
    lineas.push(linea);
  }

  for (const e of invoice.taxBreakdown.exemptBreakdowns ?? []) {
    // `CalificacionOperacion` y `OperacionExenta` son un `<choice>`: emitir los
    // dos era inválido. Y en una línea exenta no se emite `CuotaRepercutida`.
    lineas.push({
      impuesto: '01',
      claveRegimen: regimen,
      operacionExenta: e.cause,
      baseImponibleOimporteNoSujeto: formatAeatAmount(e.taxBase),
    });
  }

  for (const n of invoice.taxBreakdown.nonSubjectBreakdowns ?? []) {
    // No existe ningún elemento `OperacionNoSujeta`: la no sujeción se expresa
    // con `CalificacionOperacion` N1 o N2.
    lineas.push({
      impuesto: '01',
      claveRegimen: regimen,
      calificacionOperacion: n.cause === 'N2' ? 'N2' : 'N1',
      baseImponibleOimporteNoSujeto: formatAeatAmount(n.amount),
    });
  }

  return lineas;
}

/**
 * `DescripcionOperacion` es obligatorio en el XSD y el modelo lo tiene opcional.
 *
 * Se lanza en lugar de inventar un valor por defecto: es un registro con valor
 * probatorio, y poner palabras que el obligado tributario no ha escrito es peor
 * que un error claro. La corrección de fondo es hacer el campo obligatorio en
 * `Invoice`, que es un cambio incompatible.
 */
function descripcionObligatoria(invoice: Invoice): string {
  const d = normalizeAeatText(invoice.description);
  if (!d) {
    throw new ValidationError(
      'DescripcionOperacion es obligatoria: el XSD la exige y no admite valor vacío',
      ErrorCode.VALIDATION_ERROR,
      { field: 'description' }
    );
  }
  return d.slice(0, 500);
}

function encadenamiento(invoice: Invoice, isFirst: boolean): EncadenamientoInput {
  const ref = invoice.chainReference;
  if (isFirst || !ref) return { primerRegistro: true };
  return {
    registroAnterior: {
      // `IDEmisorFactura` es obligatorio en `RegistroAnterior` y no se emitía.
      idEmisorFactura: normalizeAeatText(
        ref.previousIssuerNif ?? invoice.issuer.taxId.value
      ),
      numSerieFactura: buildNumSerieFactura({
        ...(ref.previousSeries === undefined ? {} : { series: ref.previousSeries }),
        number: ref.previousNumber,
      }),
      fechaExpedicionFactura: formatAeatDate(ref.previousDate),
      huella: ref.previousHash,
    },
  };
}

/** Cabecera del mensaje a partir del emisor. */
export function mapCabecera(issuer: Party): CabeceraInput {
  return {
    obligadoEmision: {
      nombreRazon: normalizeAeatText(issuer.name),
      nif: normalizeAeatText(issuer.taxId.value),
    },
  };
}

export interface MapAltaOptions extends HashFieldOptions {
  /** Si es el primer registro de la cadena. */
  readonly isFirstRecord?: boolean;
}

/**
 * Convierte una factura en la entrada del generador.
 *
 * Los campos que también entran en la huella se toman de `buildAltaHashFields`,
 * de modo que el XML y la huella **no pueden** divergir.
 */
export function mapInvoiceToRegistroAlta(
  invoice: Invoice,
  software: SoftwareInfo,
  previousHash: string,
  generationTimestamp: Date,
  huella: string,
  options: MapAltaOptions = {}
): RegistroAltaInput {
  const { isFirstRecord = false, ...hashOptions } = options;
  const campos = buildAltaHashFields(invoice, previousHash, generationTimestamp, hashOptions);
  const desglose = mapDesglose(invoice);

  return {
    idFactura: {
      idEmisorFactura: campos.IDEmisorFactura,
      numSerieFactura: campos.NumSerieFactura,
      fechaExpedicionFactura: campos.FechaExpedicionFactura,
    },
    nombreRazonEmisor: normalizeAeatText(invoice.issuer.name),
    tipoFactura: campos.TipoFactura,
    ...(invoice.rectifiedInvoiceType === undefined
      ? {}
      : { tipoRectificativa: invoice.rectifiedInvoiceType as 'S' | 'I' }),
    ...(invoice.rectifiedInvoices?.length
      ? {
          facturasRectificadas: invoice.rectifiedInvoices.map((r) => ({
            idEmisorFactura: normalizeAeatText(r.issuerTaxId),
            numSerieFactura: buildNumSerieFactura(r.invoiceId),
            fechaExpedicionFactura: formatAeatDate(r.invoiceId.issueDate),
          })),
        }
      : {}),
    descripcionOperacion: descripcionObligatoria(invoice),
    ...(invoice.totalAmount > MACRODATO_UMBRAL ? { macrodato: 'S' as const } : {}),
    ...(invoice.recipients?.length ? { destinatarios: invoice.recipients.map(persona) } : {}),
    desglose,
    cuotaTotal: campos.CuotaTotal,
    importeTotal: campos.ImporteTotal,
    encadenamiento: encadenamiento(invoice, isFirstRecord),
    sistemaInformatico: mapSistemaInformatico(software),
    fechaHoraHusoGenRegistro: campos.FechaHoraHusoGenRegistro,
    huella,
  };
}

/** Convierte una anulación en la entrada del generador. */
export function mapCancellationToRegistroAnulacion(
  cancellation: InvoiceCancellation,
  software: SoftwareInfo,
  previousHash: string,
  generationTimestamp: Date,
  huella: string,
  options: MapAltaOptions = {}
): RegistroAnulacionInput {
  const { isFirstRecord = false, ...hashOptions } = options;
  const campos = buildAnulacionHashFields(
    cancellation,
    previousHash,
    generationTimestamp,
    hashOptions
  );
  const ref = cancellation.chainReference;
  return {
    idFactura: {
      idEmisorFacturaAnulada: campos.IDEmisorFacturaAnulada,
      numSerieFacturaAnulada: campos.NumSerieFacturaAnulada,
      fechaExpedicionFacturaAnulada: campos.FechaExpedicionFacturaAnulada,
    },
    encadenamiento:
      isFirstRecord || !ref
        ? { primerRegistro: true }
        : {
            registroAnterior: {
              idEmisorFactura: normalizeAeatText(
                ref.previousIssuerNif ?? cancellation.issuer.taxId.value
              ),
              numSerieFactura: buildNumSerieFactura({
                ...(ref.previousSeries === undefined ? {} : { series: ref.previousSeries }),
                number: ref.previousNumber,
              }),
              fechaExpedicionFactura: formatAeatDate(ref.previousDate),
              huella: ref.previousHash,
            },
          },
    sistemaInformatico: mapSistemaInformatico(software),
    fechaHoraHusoGenRegistro: campos.FechaHoraHusoGenRegistro,
    huella,
  };
}

/** Reexporta para quien construya el total por su cuenta. */
export { calculateCuotaTotal };
