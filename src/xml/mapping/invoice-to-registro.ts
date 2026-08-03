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

/** Valores de `ClaveRegimen` que declara el XSD. No existen 12, 13 ni 16. */
const CLAVES_REGIMEN = new Set([
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '14', '15', '17', '18', '19', '20', '21',
]);

/**
 * Impuestos para los que la AEAT exige `ClaveRegimen`, y solo esos.
 *
 * Error 1245: «Si el campo Impuesto está vacío o tiene valor IVA(01) o IPSI(02)
 * o IGIC(03) el campo ClaveRegimen debe de estar cumplimentado». Error 1260, su
 * recíproco: «El campo ClaveRegimen solo debe de estar cumplimentado si…».
 */
const IMPUESTOS_CON_REGIMEN = new Set(['01', '02', '03']);

function rechaza(mensaje: string, field: string): never {
  throw new ValidationError(mensaje, ErrorCode.VALIDATION_ERROR, { field });
}

/**
 * Coherencia entre `ClaveRegimen`, `CalificacionOperacion`, `OperacionExenta`,
 * `TipoImpositivo` e `Impuesto`.
 *
 * No es interpretación: cada regla es una validación que la AEAT publica en
 * `errores.properties` y que, de incumplirse, provoca el **rechazo del
 * registro**. Comprobarlas aquí convierte un rechazo remoto —con la huella ya
 * impresa en la factura— en un error local antes de generar nada.
 */
function validarLinea(
  invoice: Invoice,
  linea: {
    regimen: string | undefined;
    impuesto: string;
    calificacion?: string;
    exenta?: string;
    tipoImpositivo?: number;
    baseACoste?: number;
  }
): void {
  const { regimen, impuesto, calificacion, exenta } = linea;

  if (regimen !== undefined && !CLAVES_REGIMEN.has(regimen)) {
    // Error 1246.
    rechaza(
      `ClaveRegimen «${regimen}» no existe: el XSD solo declara ${[...CLAVES_REGIMEN].join(', ')}`,
      'taxBreakdown.regime'
    );
  }

  // Error 1245 · el régimen es obligatorio para IVA, IPSI e IGIC.
  if (IMPUESTOS_CON_REGIMEN.has(impuesto) && regimen === undefined) {
    rechaza(`ClaveRegimen es obligatoria con Impuesto ${impuesto}`, 'taxBreakdown.regime');
  }

  // Error 1252 · el 08 es «operaciones sujetas al IPSI/IGIC», no sujetas a IVA
  // por reglas de localización.
  if (regimen === '08' && calificacion !== 'N2') {
    rechaza(
      'Con ClaveRegimen 08 la CalificacionOperacion debe ser N2 (no sujeta por reglas de localización)',
      'taxBreakdown.qualification'
    );
  }

  // Error 1200 · bienes usados, objetos de arte y antigüedades.
  if (regimen === '03' && calificacion !== 'S1') {
    rechaza('Con ClaveRegimen 03 la CalificacionOperacion solo puede ser S1', 'taxBreakdown.qualification');
  }

  // Error 1201 · oro de inversión.
  if (regimen === '04' && exenta === undefined && calificacion !== 'S2') {
    rechaza(
      'Con ClaveRegimen 04 la operación debe ser S2 o exenta',
      'taxBreakdown.qualification'
    );
  }

  // Error 1203 · criterio de caja.
  if (regimen === '07') {
    if (exenta !== undefined && ['E2', 'E3', 'E4', 'E5'].includes(exenta)) {
      rechaza(`Con ClaveRegimen 07 la OperacionExenta no puede ser ${exenta}`, 'taxBreakdown.cause');
    }
    if (calificacion !== undefined && ['S2', 'N1', 'N2'].includes(calificacion)) {
      rechaza(
        `Con ClaveRegimen 07 la CalificacionOperacion no puede ser ${calificacion}`,
        'taxBreakdown.qualification'
      );
    }
  }

  // Error 1205 · cobros por cuenta de terceros de honorarios profesionales.
  if (regimen === '10') {
    if (calificacion !== 'N1') {
      rechaza('Con ClaveRegimen 10 la CalificacionOperacion debe ser N1', 'taxBreakdown.qualification');
    }
    if (invoice.invoiceType !== 'F1') {
      rechaza('Con ClaveRegimen 10 el TipoFactura debe ser F1', 'invoiceType');
    }
    if (!invoice.recipients?.some((r) => r.taxId.type === 'NIF')) {
      rechaza('Con ClaveRegimen 10 el destinatario debe identificarse mediante NIF', 'recipients');
    }
  }

  // Error 1206 · arrendamiento de local de negocio.
  if (regimen === '11' && linea.tipoImpositivo !== 21) {
    rechaza('Con ClaveRegimen 11 el TipoImpositivo ha de ser 21', 'taxBreakdown.vatRate');
  }

  // Error 1199 · en régimen general no caben las exenciones por entregas
  // intracomunitarias (E2) ni por exportación (E3).
  if (
    regimen === '01' &&
    (impuesto === '01' || impuesto === '03') &&
    (exenta === 'E2' || exenta === 'E3')
  ) {
    rechaza(
      `Con ClaveRegimen 01 e Impuesto ${impuesto} la OperacionExenta no puede ser ${exenta}`,
      'taxBreakdown.cause'
    );
  }

  // Errores 1198 y 1207 · con inversión del sujeto pasivo o sin sujeción, la
  // cuota repercutida es cero por definición.
  if (calificacion !== undefined && calificacion !== 'S1' && (linea.tipoImpositivo ?? 0) !== 0) {
    rechaza(
      `Con CalificacionOperacion ${calificacion} el TipoImpositivo y la CuotaRepercutida deben ser 0`,
      'taxBreakdown.vatRate'
    );
  }

  // Error 1202 · grupo de entidades, nivel avanzado.
  if (regimen === '06') {
    if (linea.baseACoste === undefined) {
      rechaza('Con ClaveRegimen 06 la BaseImponibleACoste es obligatoria', 'taxBreakdown.costBase');
    }
    if (['F2', 'F3', 'R5'].includes(invoice.invoiceType)) {
      rechaza(`Con ClaveRegimen 06 el TipoFactura no puede ser ${invoice.invoiceType}`, 'invoiceType');
    }
  }

  // Error 1257 · la base a coste no cabe en ningún otro sitio.
  if (linea.baseACoste !== undefined && regimen !== '06' && impuesto !== '02' && impuesto !== '05') {
    rechaza(
      'BaseImponibleACoste solo se admite con ClaveRegimen 06 o Impuesto 02/05',
      'taxBreakdown.costBase'
    );
  }
}

/**
 * Desglose completo: IVA, exentas y no sujetas.
 *
 * Las dos últimas se descartaban en silencio, de modo que el `ImporteTotal` no
 * cuadraba con lo declarado. Y `ClaveRegimen`, `CalificacionOperacion` e
 * `Impuesto` iban cableados pese a que el XSD los sitúa **por línea**.
 */
export function mapDesglose(invoice: Invoice): DetalleDesgloseInput[] {
  const lineas: DetalleDesgloseInput[] = [];
  const regimenFactura = invoice.operationRegimes?.[0] ?? '01';

  /** Régimen efectivo de la línea, u omitido si el impuesto no lo admite. */
  const claveRegimen = (impuesto: string, propio: string | undefined): string | undefined =>
    IMPUESTOS_CON_REGIMEN.has(impuesto) ? (propio ?? regimenFactura) : undefined;

  for (const v of invoice.taxBreakdown.vatBreakdowns ?? []) {
    const impuesto = v.tax ?? '01';
    const regimen = claveRegimen(impuesto, v.regime);
    const calificacion = v.qualification ?? 'S1';
    validarLinea(invoice, {
      regimen,
      impuesto,
      calificacion,
      tipoImpositivo: v.vatRate,
      ...(v.costBase === undefined ? {} : { baseACoste: v.costBase }),
    });

    lineas.push({
      impuesto,
      ...(regimen === undefined ? {} : { claveRegimen: regimen }),
      calificacionOperacion: calificacion,
      tipoImpositivo: formatAeatRate(v.vatRate),
      baseImponibleOimporteNoSujeto: formatAeatAmount(v.taxBase),
      ...(v.costBase === undefined ? {} : { baseImponibleACoste: formatAeatAmount(v.costBase) }),
      cuotaRepercutida: formatAeatAmount(v.vatAmount),
      ...(v.equivalenceSurchargeRate !== undefined && v.equivalenceSurchargeAmount !== undefined
        ? {
            tipoRecargoEquivalencia: formatAeatRate(v.equivalenceSurchargeRate),
            cuotaRecargoEquivalencia: formatAeatAmount(v.equivalenceSurchargeAmount),
          }
        : {}),
    });
  }

  for (const e of invoice.taxBreakdown.exemptBreakdowns ?? []) {
    const impuesto = e.tax ?? '01';
    const regimen = claveRegimen(impuesto, e.regime);
    validarLinea(invoice, { regimen, impuesto, exenta: e.cause });

    // `CalificacionOperacion` y `OperacionExenta` son un `<choice>`: emitir los
    // dos era inválido. Y en una línea exenta no se emite `CuotaRepercutida`.
    lineas.push({
      impuesto,
      ...(regimen === undefined ? {} : { claveRegimen: regimen }),
      operacionExenta: e.cause,
      baseImponibleOimporteNoSujeto: formatAeatAmount(e.taxBase),
    });
  }

  for (const n of invoice.taxBreakdown.nonSubjectBreakdowns ?? []) {
    const impuesto = n.tax ?? '01';
    const regimen = claveRegimen(impuesto, n.regime);
    const calificacion = n.cause === 'N2' ? 'N2' : 'N1';
    validarLinea(invoice, { regimen, impuesto, calificacion });

    // No existe ningún elemento `OperacionNoSujeta`: la no sujeción se expresa
    // con `CalificacionOperacion` N1 o N2.
    lineas.push({
      impuesto,
      ...(regimen === undefined ? {} : { claveRegimen: regimen }),
      calificacionOperacion: calificacion,
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

/**
 * Comprueba que la factura puede convertirse en un registro de alta válido.
 *
 * Se invoca **antes** de calcular la huella y mover la cadena. Antes se validaba
 * al construir el XML, es decir después: una factura que no se podía serializar
 * dejaba la cadena apuntando a un registro que no llegó a generarse, y la
 * siguiente encadenaba contra un fantasma.
 */
export function assertAltaEmisible(invoice: Invoice): void {
  descripcionObligatoria(invoice);
  mapDesglose(invoice);
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
      : { tipoRectificativa: invoice.rectifiedInvoiceType }),
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
