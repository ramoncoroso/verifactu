/**
 * Parseo de las respuestas de la AEAT.
 *
 * Fuente: `schemas/RespuestaSuministro.xsd` y `schemas/RespuestaConsultaLR.xsd`,
 * vendorizados y congelados por sha256.
 *
 * La versión anterior buscaba `RespuestaRegFactura`, `RespuestaAnulacion` y
 * `RespuestaConsulta`, nombres que **no existen en ningún esquema de la AEAT**.
 * El resultado era que toda respuesta real lanzaba `AeatError` aunque el registro
 * hubiera sido aceptado, y que la consulta devolvía `{found: false}` en silencio.
 * Los 28 tests del cliente no lo veían porque se les daba un formato inventado.
 *
 * Regla de implementación: **hijo directo, nunca búsqueda recursiva**.
 * `CodigoErrorRegistro` y `DescripcionErrorRegistro` aparecen dos veces en cada
 * `RespuestaLinea` —una en la línea y otra dentro de `RegistroDuplicado`—, así
 * que un `findNode` global mezclaría el error del registro con el del duplicado.
 */

import { AeatError } from '../errors/network-errors.js';
import { getChild, getChildren, type XmlNode } from '../xml/parser.js';

/** Estado global del envío (lista L18). */
export type EstadoEnvio = 'Correcto' | 'ParcialmenteCorrecto' | 'Incorrecto';

/**
 * Estado de un registro concreto (lista L19).
 *
 * `Incorrecto`, no `Rechazado`: ese valor no existe en el enumerado, y el tipo
 * anterior lo declaraba.
 */
export type EstadoRegistro = 'Correcto' | 'AceptadoConErrores' | 'Incorrecto';

/** Estado del registro que ya constaba, cuando la AEAT rechaza por duplicado. */
export type EstadoRegistroDuplicado = 'Correcta' | 'AceptadaConErrores' | 'Anulada';

/** Identificación de la factura que devuelve la respuesta como eco. */
export interface IdFacturaRespuesta {
  readonly idEmisorFactura: string;
  readonly numSerieFactura: string;
  readonly fechaExpedicionFactura: string;
}

/** Bloque `RegistroDuplicado`. Es lo que hace segura la idempotencia. */
export interface RegistroDuplicadoInfo {
  readonly idPeticion?: string;
  readonly estado?: EstadoRegistroDuplicado;
  readonly codigoError?: string;
  readonly descripcionError?: string;
}

/** Una línea de la respuesta: el resultado de un registro. */
export interface RespuestaLinea {
  readonly idFactura?: IdFacturaRespuesta;
  readonly tipoOperacion?: 'Alta' | 'Anulacion';
  readonly refExterna?: string;
  readonly estadoRegistro: EstadoRegistro;
  readonly codigoError?: string;
  readonly descripcionError?: string;
  /** Presente solo si el rechazo es por duplicado (código 3000). */
  readonly registroDuplicado?: RegistroDuplicadoInfo;
}

/** Respuesta completa a un envío. */
export interface SuministroResponse {
  /** Solo se genera si no hay rechazo del envío. */
  readonly csv?: string;
  readonly nifPresentador?: string;
  /** Sello temporal de la AEAT. Acredita la remisión. */
  readonly timestampPresentacion?: Date;
  readonly obligadoEmision?: { readonly nif?: string; readonly nombreRazon?: string };
  /**
   * Segundos que hay que esperar antes del siguiente envío.
   *
   * Obligatorio en toda respuesta. El art. 16.2 de la OM HAC/1177/2024 obliga a
   * tenerlo en cuenta: no es una recomendación.
   */
  readonly tiempoEsperaEnvioSeconds: number;
  readonly estadoEnvio: EstadoEnvio;
  readonly lineas: readonly RespuestaLinea[];
}

/** Valor por defecto del tiempo de espera, según el art. 16.2. */
const ESPERA_POR_DEFECTO = 60;

function texto(node: XmlNode | undefined, name: string): string | undefined {
  if (!node) return undefined;
  const child = getChild(node, name);
  const t = child?.text?.trim();
  return t === undefined || t === '' ? undefined : t;
}

function parseIdFactura(linea: XmlNode): IdFacturaRespuesta | undefined {
  const id = getChild(linea, 'IDFactura');
  if (!id) return undefined;
  return {
    idEmisorFactura: texto(id, 'IDEmisorFactura') ?? '',
    numSerieFactura: texto(id, 'NumSerieFactura') ?? '',
    fechaExpedicionFactura: texto(id, 'FechaExpedicionFactura') ?? '',
  };
}

function parseDuplicado(linea: XmlNode): RegistroDuplicadoInfo | undefined {
  const dup = getChild(linea, 'RegistroDuplicado');
  if (!dup) return undefined;
  const info: {
    idPeticion?: string;
    estado?: EstadoRegistroDuplicado;
    codigoError?: string;
    descripcionError?: string;
  } = {};
  const id = texto(dup, 'IdPeticionRegistroDuplicado');
  if (id !== undefined) info.idPeticion = id;
  const estado = texto(dup, 'EstadoRegistroDuplicado');
  if (estado !== undefined) info.estado = estado as EstadoRegistroDuplicado;
  const cod = texto(dup, 'CodigoErrorRegistro');
  if (cod !== undefined) info.codigoError = cod;
  const desc = texto(dup, 'DescripcionErrorRegistro');
  if (desc !== undefined) info.descripcionError = desc;
  return info;
}

function parseLinea(linea: XmlNode): RespuestaLinea {
  const operacion = getChild(linea, 'Operacion');
  const out: {
    idFactura?: IdFacturaRespuesta;
    tipoOperacion?: 'Alta' | 'Anulacion';
    refExterna?: string;
    estadoRegistro: EstadoRegistro;
    codigoError?: string;
    descripcionError?: string;
    registroDuplicado?: RegistroDuplicadoInfo;
  } = {
    estadoRegistro: (texto(linea, 'EstadoRegistro') ?? 'Incorrecto') as EstadoRegistro,
  };

  const id = parseIdFactura(linea);
  if (id) out.idFactura = id;
  const tipo = texto(operacion, 'TipoOperacion');
  if (tipo !== undefined) out.tipoOperacion = tipo as 'Alta' | 'Anulacion';
  const ref = texto(linea, 'RefExterna');
  if (ref !== undefined) out.refExterna = ref;
  // Hijo directo: dentro de RegistroDuplicado hay otro CodigoErrorRegistro.
  const cod = texto(linea, 'CodigoErrorRegistro');
  if (cod !== undefined) out.codigoError = cod;
  const desc = texto(linea, 'DescripcionErrorRegistro');
  if (desc !== undefined) out.descripcionError = desc;
  const dup = parseDuplicado(linea);
  if (dup) out.registroDuplicado = dup;

  return out;
}

/** Parsea una respuesta a un envío de registros. */
export function parseSuministroResponse(xml: XmlNode): SuministroResponse {
  const raiz = findRespuesta(xml, 'RespuestaRegFactuSistemaFacturacion');
  if (!raiz) {
    throw new AeatError(
      'Respuesta no reconocida: falta RespuestaRegFactuSistemaFacturacion. ' +
        'Comprueba el código de estado HTTP: una página de error se parsea sin lanzar.'
    );
  }

  const datos = getChild(raiz, 'DatosPresentacion');
  const cabecera = getChild(raiz, 'Cabecera');
  const obligado = cabecera ? getChild(cabecera, 'ObligadoEmision') : undefined;
  const espera = texto(raiz, 'TiempoEsperaEnvio');
  const timestamp = texto(datos, 'TimestampPresentacion');

  const out: {
    csv?: string;
    nifPresentador?: string;
    timestampPresentacion?: Date;
    obligadoEmision?: { nif?: string; nombreRazon?: string };
    tiempoEsperaEnvioSeconds: number;
    estadoEnvio: EstadoEnvio;
    lineas: RespuestaLinea[];
  } = {
    // `Tipo6Type` admite cadena vacía: si no viene, se mantiene el valor inicial
    // que fija la norma.
    tiempoEsperaEnvioSeconds:
      espera !== undefined && Number.isFinite(Number(espera))
        ? Number(espera)
        : ESPERA_POR_DEFECTO,
    estadoEnvio: (texto(raiz, 'EstadoEnvio') ?? 'Incorrecto') as EstadoEnvio,
    lineas: getChildren(raiz, 'RespuestaLinea').map(parseLinea),
  };

  const csv = texto(raiz, 'CSV');
  if (csv !== undefined) out.csv = csv;
  const nifP = texto(datos, 'NIFPresentador');
  if (nifP !== undefined) out.nifPresentador = nifP;
  if (timestamp !== undefined) {
    const d = new Date(timestamp);
    if (!Number.isNaN(d.getTime())) out.timestampPresentacion = d;
  }
  if (obligado) {
    const o: { nif?: string; nombreRazon?: string } = {};
    const nif = texto(obligado, 'NIF');
    if (nif !== undefined) o.nif = nif;
    const nombre = texto(obligado, 'NombreRazon');
    if (nombre !== undefined) o.nombreRazon = nombre;
    out.obligadoEmision = o;
  }

  return out;
}

/** Localiza el elemento de respuesta, ignorando el prefijo de namespace. */
function findRespuesta(node: XmlNode, name: string): XmlNode | undefined {
  if (node.name === name) return node;
  for (const child of node.children) {
    const found = findRespuesta(child, name);
    if (found) return found;
  }
  return undefined;
}

/** Código con el que la AEAT rechaza un registro ya presentado. */
export const CODIGO_REGISTRO_DUPLICADO = '3000';

/**
 * Un registro rechazado por duplicado **no es un fallo**: significa que ya
 * constaba. La AEAT identifica el registro por `IDEmisorFactura` +
 * `NumSerieFactura` + `FechaExpedicionFactura`, no por la huella, así que
 * reenviar los mismos bytes es seguro.
 */
export function esRegistroYaPresentado(linea: RespuestaLinea): boolean {
  return (
    linea.estadoRegistro === 'Incorrecto' &&
    (linea.codigoError === CODIGO_REGISTRO_DUPLICADO || linea.registroDuplicado !== undefined)
  );
}

/**
 * Si el registro quedó anotado en la AEAT.
 *
 * `AceptadoConErrores` **se registra**: tiene errores que no provocan rechazo y
 * que hay que subsanar después. Y un duplicado también estaba ya registrado.
 */
export function fueAceptado(linea: RespuestaLinea): boolean {
  return (
    linea.estadoRegistro === 'Correcto' ||
    linea.estadoRegistro === 'AceptadoConErrores' ||
    esRegistroYaPresentado(linea)
  );
}

/** Resultado de una consulta de registros. */
export interface ConsultaResponse {
  readonly found: boolean;
  readonly resultado?: 'ConDatos' | 'SinDatos';
  readonly estadoRegistro?: string;
  readonly codigoError?: string;
  readonly descripcionError?: string;
  readonly timestampUltimaModificacion?: Date;
}

/**
 * Parsea una respuesta de consulta.
 *
 * `EstadoRegistro` aquí es un **nodo complejo** (`EstadoRegFactuType`), no texto:
 * la versión anterior le aplicaba `getChildText` y obtenía siempre `undefined`.
 */
export function parseConsultaResponse(xml: XmlNode): ConsultaResponse {
  const raiz = findRespuesta(xml, 'RespuestaConsultaFactuSistemaFacturacion');
  if (!raiz) return { found: false };

  const resultado = texto(raiz, 'ResultadoConsulta') as 'ConDatos' | 'SinDatos' | undefined;
  const registro = getChild(raiz, 'RegistroRespuestaConsultaFactuSistemaFacturacion');
  if (!registro) {
    return resultado === undefined ? { found: false } : { found: false, resultado };
  }

  const estado = getChild(registro, 'EstadoRegistro');
  const out: {
    found: boolean;
    resultado?: 'ConDatos' | 'SinDatos';
    estadoRegistro?: string;
    codigoError?: string;
    descripcionError?: string;
    timestampUltimaModificacion?: Date;
  } = { found: true };

  if (resultado !== undefined) out.resultado = resultado;
  if (estado) {
    const e = texto(estado, 'EstadoRegistro');
    if (e !== undefined) out.estadoRegistro = e;
    const cod = texto(estado, 'CodigoErrorRegistro');
    if (cod !== undefined) out.codigoError = cod;
    const desc = texto(estado, 'DescripcionErrorRegistro');
    if (desc !== undefined) out.descripcionError = desc;
    const ts = texto(estado, 'TimestampUltimaModificacion');
    if (ts !== undefined) {
      const d = new Date(ts);
      if (!Number.isNaN(d.getTime())) out.timestampUltimaModificacion = d;
    }
  }
  return out;
}
