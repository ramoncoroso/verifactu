/**
 * Generación del mensaje `RegFactuSistemaFacturacion`.
 *
 * Transcripción del XSD oficial, no de un ejemplo. Cada elemento y cada orden
 * sale de `schemas/SuministroInformacion.xsd` y `schemas/SuministroLR.xsd`, y
 * `tests/conformance/xsd.test.ts` valida el resultado contra ellos.
 *
 * El orden **no depende del orden de las llamadas**: cada tipo declara su
 * secuencia y el emisor la recorre. Así, un campo colocado en el sitio
 * equivocado deja de ser posible.
 */

import { Namespaces, NsPrefix } from '../namespaces.js';
import { elem, leaf, optional, serialize, type NsKey, type XmlNode } from '../serializer.js';

/** Versión del diseño de registro. `VersionType` tiene un único valor. */
export const ID_VERSION = '1.0';

/** Tipo de huella. `TipoHuellaType` tiene un único valor: SHA-256. */
export const TIPO_HUELLA = '01';

const LR: NsKey = 'LR';
const SF: NsKey = 'SF';

/** Identificación de una persona física o jurídica. */
export interface PersonaInput {
  /** `NombreRazon`. Va **primero**: así lo declara `PersonaFisicaJuridicaType`. */
  readonly nombreRazon: string;
  /** NIF español. Excluyente con `idOtro`. */
  readonly nif?: string;
  /** Identificación no española. Excluyente con `nif`. */
  readonly idOtro?: {
    readonly codigoPais?: string;
    readonly idType: string;
    readonly id: string;
  };
}

/** Línea del desglose. */
export type DetalleDesgloseInput = {
  readonly impuesto?: string;
  readonly claveRegimen?: string;
  readonly tipoImpositivo?: string;
  readonly baseImponibleOimporteNoSujeto: string;
  readonly baseImponibleACoste?: string;
  readonly cuotaRepercutida?: string;
  readonly tipoRecargoEquivalencia?: string;
  readonly cuotaRecargoEquivalencia?: string;
} & (
  | { readonly calificacionOperacion: 'S1' | 'S2' | 'N1' | 'N2'; readonly operacionExenta?: never }
  // El XSD los declara en un `<choice>`: emitir los dos es inválido, y era uno de
  // los defectos del generador anterior.
  | { readonly operacionExenta: string; readonly calificacionOperacion?: never }
);

/** Encadenamiento. Unión discriminada porque el XSD lo declara como `<choice>`. */
export type EncadenamientoInput =
  | { readonly primerRegistro: true; readonly registroAnterior?: never }
  | {
      readonly primerRegistro?: never;
      readonly registroAnterior: {
        readonly idEmisorFactura: string;
        readonly numSerieFactura: string;
        readonly fechaExpedicionFactura: string;
        readonly huella: string;
      };
    };

/** Sistema informático de facturación. Todos sus campos son obligatorios. */
export interface SistemaInformaticoInput {
  readonly nombreRazon: string;
  readonly nif?: string;
  readonly idOtro?: PersonaInput['idOtro'];
  readonly nombreSistemaInformatico: string;
  /** `maxLength 2`. */
  readonly idSistemaInformatico: string;
  readonly version: string;
  readonly numeroInstalacion: string;
  readonly tipoUsoPosibleSoloVerifactu: 'S' | 'N';
  readonly tipoUsoPosibleMultiOT: 'S' | 'N';
  readonly indicadorMultiplesOT: 'S' | 'N';
}

/** Registro de alta. Los campos obligatorios del XSD **no son opcionales aquí**. */
export interface RegistroAltaInput {
  readonly idFactura: {
    readonly idEmisorFactura: string;
    readonly numSerieFactura: string;
    readonly fechaExpedicionFactura: string;
  };
  readonly refExterna?: string;
  readonly nombreRazonEmisor: string;
  readonly subsanacion?: 'S' | 'N';
  readonly rechazoPrevio?: 'N' | 'S' | 'X';
  readonly tipoFactura: string;
  readonly tipoRectificativa?: 'S' | 'I';
  readonly facturasRectificadas?: readonly RegistroAltaInput['idFactura'][];
  readonly facturasSustituidas?: readonly RegistroAltaInput['idFactura'][];
  readonly importeRectificacion?: {
    readonly baseRectificada: string;
    readonly cuotaRectificada: string;
    readonly cuotaRecargoRectificado?: string;
  };
  readonly fechaOperacion?: string;
  /** Obligatorio en el XSD. */
  readonly descripcionOperacion: string;
  readonly facturaSimplificadaArt7273?: 'S' | 'N';
  readonly facturaSinIdentifDestinatarioArt61d?: 'S' | 'N';
  readonly macrodato?: 'S' | 'N';
  readonly emitidaPorTerceroODestinatario?: 'D' | 'T';
  readonly tercero?: PersonaInput;
  readonly destinatarios?: readonly PersonaInput[];
  readonly cupon?: 'S' | 'N';
  /** Entre 1 y 12 líneas. */
  readonly desglose: readonly DetalleDesgloseInput[];
  readonly cuotaTotal: string;
  readonly importeTotal: string;
  readonly encadenamiento: EncadenamientoInput;
  readonly sistemaInformatico: SistemaInformaticoInput;
  readonly fechaHoraHusoGenRegistro: string;
  readonly numRegistroAcuerdoFacturacion?: string;
  readonly idAcuerdoSistemaInformatico?: string;
  readonly huella: string;
}

/** Registro de anulación. */
export interface RegistroAnulacionInput {
  readonly idFactura: {
    readonly idEmisorFacturaAnulada: string;
    readonly numSerieFacturaAnulada: string;
    readonly fechaExpedicionFacturaAnulada: string;
  };
  readonly refExterna?: string;
  readonly sinRegistroPrevio?: 'S' | 'N';
  readonly rechazoPrevio?: 'S' | 'N';
  readonly generadoPor?: 'E' | 'D' | 'T';
  readonly generador?: PersonaInput;
  readonly encadenamiento: EncadenamientoInput;
  readonly sistemaInformatico: SistemaInformaticoInput;
  readonly fechaHoraHusoGenRegistro: string;
  readonly huella: string;
}

/** Cabecera del mensaje. */
export interface CabeceraInput {
  readonly obligadoEmision: { readonly nombreRazon: string; readonly nif: string };
}

/** Un registro del envío: alta o anulación. */
export type RegistroInput =
  | { readonly alta: RegistroAltaInput; readonly anulacion?: never }
  | { readonly anulacion: RegistroAnulacionInput; readonly alta?: never };

/** Máximo de registros por mensaje (`maxOccurs="1000"`). */
export const MAX_REGISTROS = 1000;

/** Máximo de líneas de desglose (`maxOccurs="12"`). */
export const MAX_DETALLE_DESGLOSE = 12;

function persona(nombre: string, p: PersonaInput): XmlNode {
  const hijos: XmlNode[] = [leaf(SF, 'NombreRazon', p.nombreRazon)];
  if (p.nif !== undefined) {
    hijos.push(leaf(SF, 'NIF', p.nif));
  } else if (p.idOtro) {
    hijos.push(
      elem(SF, 'IDOtro', [
        ...optional(SF, 'CodigoPais', p.idOtro.codigoPais),
        leaf(SF, 'IDType', p.idOtro.idType),
        leaf(SF, 'ID', p.idOtro.id),
      ])
    );
  }
  return elem(SF, nombre, hijos);
}

function sistemaInformatico(s: SistemaInformaticoInput): XmlNode {
  const identificacion: XmlNode[] =
    s.nif !== undefined
      ? [leaf(SF, 'NIF', s.nif)]
      : s.idOtro
        ? [
            elem(SF, 'IDOtro', [
              ...optional(SF, 'CodigoPais', s.idOtro.codigoPais),
              leaf(SF, 'IDType', s.idOtro.idType),
              leaf(SF, 'ID', s.idOtro.id),
            ]),
          ]
        : [];
  return elem(SF, 'SistemaInformatico', [
    leaf(SF, 'NombreRazon', s.nombreRazon),
    ...identificacion,
    leaf(SF, 'NombreSistemaInformatico', s.nombreSistemaInformatico),
    leaf(SF, 'IdSistemaInformatico', s.idSistemaInformatico),
    leaf(SF, 'Version', s.version),
    leaf(SF, 'NumeroInstalacion', s.numeroInstalacion),
    leaf(SF, 'TipoUsoPosibleSoloVerifactu', s.tipoUsoPosibleSoloVerifactu),
    leaf(SF, 'TipoUsoPosibleMultiOT', s.tipoUsoPosibleMultiOT),
    leaf(SF, 'IndicadorMultiplesOT', s.indicadorMultiplesOT),
  ]);
}

function encadenamiento(e: EncadenamientoInput): XmlNode {
  // `PrimerRegistroCadenaType` es una enumeración de un solo valor, «S», y
  // `Encadenamiento` es un `<choice>`: cuando no es el primero se emite
  // ÚNICAMENTE `RegistroAnterior`, sin `PrimerRegistro`.
  if (e.primerRegistro) {
    return elem(SF, 'Encadenamiento', [leaf(SF, 'PrimerRegistro', 'S')]);
  }
  const a = e.registroAnterior;
  return elem(SF, 'Encadenamiento', [
    elem(SF, 'RegistroAnterior', [
      leaf(SF, 'IDEmisorFactura', a.idEmisorFactura),
      leaf(SF, 'NumSerieFactura', a.numSerieFactura),
      leaf(SF, 'FechaExpedicionFactura', a.fechaExpedicionFactura),
      leaf(SF, 'Huella', a.huella),
    ]),
  ]);
}

function detalleDesglose(d: DetalleDesgloseInput): XmlNode {
  return elem(SF, 'DetalleDesglose', [
    ...optional(SF, 'Impuesto', d.impuesto),
    ...optional(SF, 'ClaveRegimen', d.claveRegimen),
    ...(d.calificacionOperacion !== undefined
      ? [leaf(SF, 'CalificacionOperacion', d.calificacionOperacion)]
      : [leaf(SF, 'OperacionExenta', d.operacionExenta)]),
    ...optional(SF, 'TipoImpositivo', d.tipoImpositivo),
    // Ojo con la «i» minúscula de «Oimporte»: así lo declara el XSD.
    leaf(SF, 'BaseImponibleOimporteNoSujeto', d.baseImponibleOimporteNoSujeto),
    ...optional(SF, 'BaseImponibleACoste', d.baseImponibleACoste),
    ...optional(SF, 'CuotaRepercutida', d.cuotaRepercutida),
    ...optional(SF, 'TipoRecargoEquivalencia', d.tipoRecargoEquivalencia),
    ...optional(SF, 'CuotaRecargoEquivalencia', d.cuotaRecargoEquivalencia),
  ]);
}

function idFacturaRef(nombre: string, f: RegistroAltaInput['idFactura']): XmlNode {
  return elem(SF, nombre, [
    leaf(SF, 'IDEmisorFactura', f.idEmisorFactura),
    leaf(SF, 'NumSerieFactura', f.numSerieFactura),
    leaf(SF, 'FechaExpedicionFactura', f.fechaExpedicionFactura),
  ]);
}

/** Construye el elemento `RegistroAlta`. */
export function buildRegistroAlta(r: RegistroAltaInput): XmlNode {
  if (r.desglose.length < 1 || r.desglose.length > MAX_DETALLE_DESGLOSE) {
    throw new RangeError(
      `El desglose debe tener entre 1 y ${MAX_DETALLE_DESGLOSE} líneas (tiene ${r.desglose.length})`
    );
  }
  return elem(SF, 'RegistroAlta', [
    leaf(SF, 'IDVersion', ID_VERSION),
    elem(SF, 'IDFactura', [
      leaf(SF, 'IDEmisorFactura', r.idFactura.idEmisorFactura),
      leaf(SF, 'NumSerieFactura', r.idFactura.numSerieFactura),
      leaf(SF, 'FechaExpedicionFactura', r.idFactura.fechaExpedicionFactura),
    ]),
    ...optional(SF, 'RefExterna', r.refExterna),
    leaf(SF, 'NombreRazonEmisor', r.nombreRazonEmisor),
    ...optional(SF, 'Subsanacion', r.subsanacion),
    ...optional(SF, 'RechazoPrevio', r.rechazoPrevio),
    leaf(SF, 'TipoFactura', r.tipoFactura),
    ...optional(SF, 'TipoRectificativa', r.tipoRectificativa),
    ...(r.facturasRectificadas?.length
      ? [
          elem(
            SF,
            'FacturasRectificadas',
            r.facturasRectificadas.map((f) => idFacturaRef('IDFacturaRectificada', f))
          ),
        ]
      : []),
    ...(r.facturasSustituidas?.length
      ? [
          elem(
            SF,
            'FacturasSustituidas',
            r.facturasSustituidas.map((f) => idFacturaRef('IDFacturaSustituida', f))
          ),
        ]
      : []),
    ...(r.importeRectificacion
      ? [
          elem(SF, 'ImporteRectificacion', [
            leaf(SF, 'BaseRectificada', r.importeRectificacion.baseRectificada),
            leaf(SF, 'CuotaRectificada', r.importeRectificacion.cuotaRectificada),
            ...optional(
              SF,
              'CuotaRecargoRectificado',
              r.importeRectificacion.cuotaRecargoRectificado
            ),
          ]),
        ]
      : []),
    ...optional(SF, 'FechaOperacion', r.fechaOperacion),
    leaf(SF, 'DescripcionOperacion', r.descripcionOperacion),
    ...optional(SF, 'FacturaSimplificadaArt7273', r.facturaSimplificadaArt7273),
    ...optional(SF, 'FacturaSinIdentifDestinatarioArt61d', r.facturaSinIdentifDestinatarioArt61d),
    ...optional(SF, 'Macrodato', r.macrodato),
    ...optional(SF, 'EmitidaPorTerceroODestinatario', r.emitidaPorTerceroODestinatario),
    ...(r.tercero ? [persona('Tercero', r.tercero)] : []),
    ...(r.destinatarios?.length
      ? [
          elem(
            SF,
            'Destinatarios',
            r.destinatarios.map((d) => persona('IDDestinatario', d))
          ),
        ]
      : []),
    ...optional(SF, 'Cupon', r.cupon),
    elem(SF, 'Desglose', r.desglose.map(detalleDesglose)),
    leaf(SF, 'CuotaTotal', r.cuotaTotal),
    leaf(SF, 'ImporteTotal', r.importeTotal),
    encadenamiento(r.encadenamiento),
    sistemaInformatico(r.sistemaInformatico),
    leaf(SF, 'FechaHoraHusoGenRegistro', r.fechaHoraHusoGenRegistro),
    ...optional(SF, 'NumRegistroAcuerdoFacturacion', r.numRegistroAcuerdoFacturacion),
    ...optional(SF, 'IdAcuerdoSistemaInformatico', r.idAcuerdoSistemaInformatico),
    leaf(SF, 'TipoHuella', TIPO_HUELLA),
    leaf(SF, 'Huella', r.huella),
  ]);
}

/** Construye el elemento `RegistroAnulacion`. */
export function buildRegistroAnulacion(r: RegistroAnulacionInput): XmlNode {
  return elem(SF, 'RegistroAnulacion', [
    leaf(SF, 'IDVersion', ID_VERSION),
    elem(SF, 'IDFactura', [
      leaf(SF, 'IDEmisorFacturaAnulada', r.idFactura.idEmisorFacturaAnulada),
      leaf(SF, 'NumSerieFacturaAnulada', r.idFactura.numSerieFacturaAnulada),
      leaf(SF, 'FechaExpedicionFacturaAnulada', r.idFactura.fechaExpedicionFacturaAnulada),
    ]),
    ...optional(SF, 'RefExterna', r.refExterna),
    ...optional(SF, 'SinRegistroPrevio', r.sinRegistroPrevio),
    ...optional(SF, 'RechazoPrevio', r.rechazoPrevio),
    ...optional(SF, 'GeneradoPor', r.generadoPor),
    ...(r.generador ? [persona('Generador', r.generador)] : []),
    encadenamiento(r.encadenamiento),
    sistemaInformatico(r.sistemaInformatico),
    leaf(SF, 'FechaHoraHusoGenRegistro', r.fechaHoraHusoGenRegistro),
    leaf(SF, 'TipoHuella', TIPO_HUELLA),
    leaf(SF, 'Huella', r.huella),
  ]);
}

/**
 * Construye el mensaje completo.
 *
 * Altas y anulaciones viajan en el **mismo** mensaje: `RegistroFactura` es un
 * envoltorio con un `<choice>` entre `RegistroAlta` y `RegistroAnulacion`. No
 * existe ninguna raíz `AnulaFactuSistemaFacturacion`.
 */
export function buildRegFactuSistemaFacturacion(
  cabecera: CabeceraInput,
  registros: readonly RegistroInput[]
): XmlNode {
  if (registros.length < 1 || registros.length > MAX_REGISTROS) {
    throw new RangeError(
      `Un envío admite entre 1 y ${MAX_REGISTROS} registros (tiene ${registros.length})`
    );
  }
  return elem(LR, 'RegFactuSistemaFacturacion', [
    // `Cabecera` y `RegistroFactura` son de SuministroLR; su CONTENIDO es de
    // SuministroInformacion. Confundirlo produce un documento inválido.
    elem(LR, 'Cabecera', [
      elem(SF, 'ObligadoEmision', [
        leaf(SF, 'NombreRazon', cabecera.obligadoEmision.nombreRazon),
        leaf(SF, 'NIF', cabecera.obligadoEmision.nif),
      ]),
    ]),
    ...registros.map((r) =>
      elem(LR, 'RegistroFactura', [
        r.alta ? buildRegistroAlta(r.alta) : buildRegistroAnulacion(r.anulacion),
      ])
    ),
  ]);
}

/** Serializa un mensaje ya construido. */
export function serializeMensaje(mensaje: XmlNode, pretty = false): string {
  return serialize(mensaje, {
    prefixes: { LR: NsPrefix.SUM, SF: NsPrefix.SUM_INFO, SOAP: 'soapenv' },
    uris: { LR: Namespaces.SUM, SF: Namespaces.SUM_INFO, SOAP: Namespaces.SOAP_ENV },
    declare: ['LR', 'SF'],
    pretty,
  });
}

/** Envuelve el mensaje en un sobre SOAP 1.1. */
export function wrapSoapEnvelope(mensaje: XmlNode, pretty = false): string {
  const cuerpo = serializeMensaje(mensaje, pretty);
  const nl = pretty ? '\n' : '';
  return (
    `<?xml version="1.0" encoding="UTF-8"?>${nl}` +
    `<soapenv:Envelope xmlns:soapenv="${Namespaces.SOAP_ENV}">${nl}` +
    `<soapenv:Body>${nl}${cuerpo}${nl}</soapenv:Body>${nl}` +
    `</soapenv:Envelope>`
  );
}
