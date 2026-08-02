/**
 * SOAP Client for Verifactu
 *
 * Low-level SOAP client for communicating with AEAT services.
 * Uses native Node.js fetch with TLS client certificates.
 */

import { request } from 'node:https';
import type { RequestOptions } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { brotliDecompressSync, gunzipSync, inflateRawSync, inflateSync } from 'node:zlib';
import type { TlsOptions } from '../crypto/certificate.js';
import {
  NetworkError,
  ConnectionError,
  HttpStatusError,
  TimeoutError,
  SoapError,
  parseRetryAfter,
} from '../errors/network-errors.js';
import { certificateErrorFor, esPkcs12Heredado } from '../crypto/certificate.js';
import { parseXml, findNode, getChildText } from '../xml/parser.js';
import type { XmlNode } from '../xml/parser.js';

/**
 * SOAP request options
 */
export interface SoapRequestOptions {
  /** Service URL */
  url: string;
  /** SOAP action header */
  soapAction: string;
  /** Request body (XML) */
  body: string;
  /** TLS certificate options */
  tls: TlsOptions;
  /** Request timeout in milliseconds */
  timeout?: number;
  /**
   * Tamaño máximo de la respuesta, en bytes. Por defecto {@link MAX_RESPONSE_BYTES}.
   *
   * Sin este tope, un servidor que responda un flujo interminable —o un proxy
   * mal configurado— hace crecer el búfer hasta agotar la memoria del proceso.
   */
  maxResponseBytes?: number;
}

/**
 * SOAP response
 */
export interface SoapResponse {
  /** HTTP status code */
  statusCode: number;
  /** Response body (XML) */
  body: string;
  /** Parsed XML response */
  xml: XmlNode;
  /** Response headers */
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Default timeout in milliseconds
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Tope por defecto del cuerpo de la respuesta: 64 MiB.
 *
 * Una página de `ConsultaFactuSistemaFacturacion` trae hasta 10.000 registros y
 * puede rondar los pocos MB, así que el margen es amplio; lo que corta es un
 * flujo patológico.
 */
export const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

/**
 * Codificaciones que se anuncian en `Accept-Encoding`.
 *
 * No se pedía ninguna, de modo que cada página de una consulta viajaba sin
 * comprimir. El XML de la AEAT es extremadamente repetitivo y gzip lo reduce un
 * orden de magnitud.
 */
const ACCEPT_ENCODING = 'gzip, deflate';

/** Descomprime el cuerpo según la cabecera `Content-Encoding`. */
function descomprimir(datos: Buffer, contentEncoding: string | string[] | undefined): Buffer {
  const codificacion = (Array.isArray(contentEncoding) ? contentEncoding[0] : contentEncoding)
    ?.trim()
    .toLowerCase();

  if (codificacion === undefined || codificacion === '' || codificacion === 'identity') {
    return datos;
  }

  try {
    switch (codificacion) {
      case 'gzip':
      case 'x-gzip':
        return gunzipSync(datos);
      case 'deflate':
        // Hay servidores que mandan deflate crudo, sin la cabecera zlib.
        try {
          return inflateSync(datos);
        } catch {
          return inflateRawSync(datos);
        }
      case 'br':
        return brotliDecompressSync(datos);
      default:
        throw new Error(`codificación desconocida «${codificacion}»`);
    }
  } catch (causa) {
    throw new NetworkError(
      `No se pudo descomprimir la respuesta (Content-Encoding: ${codificacion}): ${(causa as Error).message}`,
      undefined,
      { cause: causa as Error }
    );
  }
}

/**
 * Send a SOAP request
 */
export async function sendSoapRequest(options: SoapRequestOptions): Promise<SoapResponse> {
  const url = new URL(options.url);
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;

  const requestOptions: RequestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': options.soapAction,
      'Content-Length': Buffer.byteLength(options.body, 'utf8'),
      'Accept-Encoding': ACCEPT_ENCODING,
    },
    // TLS options
    ...options.tls,
    timeout,
  };

  return new Promise((resolve, reject) => {
    try {
    const req = request(requestOptions, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      let recibidos = 0;
      let abortado = false;

      res.on('data', (chunk: Buffer) => {
        if (abortado) return;
        recibidos += chunk.length;
        if (recibidos > maxResponseBytes) {
          abortado = true;
          // Cortar la conexión: seguir acumulando un cuerpo que ya se ha
          // descartado es justo lo que agota la memoria.
          req.destroy();
          reject(
            new NetworkError(
              `Respuesta demasiado grande: supera el máximo de ${maxResponseBytes} bytes`
            )
          );
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        if (abortado) return;

        let body: string;
        try {
          // Concatenar los búferes ANTES de decodificar: un carácter multibyte
          // partido entre dos paquetes TCP se corrompe si se decodifica trozo a
          // trozo, y los nombres fiscales llevan eñes y acentos.
          body = descomprimir(
            Buffer.concat(chunks),
            res.headers['content-encoding']
          ).toString('utf8');
        } catch (error) {
          reject(error);
          return;
        }

        const statusCode = res.statusCode ?? 0;
        const headers = res.headers as Record<string, string | string[] | undefined>;

        let xml: XmlNode | undefined;
        let errorDeParseo: Error | undefined;
        try {
          xml = parseXml(body);
        } catch (error) {
          errorDeParseo = error as Error;
        }

        // El fault se busca ANTES de mirar el estado: SOAP 1.1 §6.2 exige que un
        // SOAPFault viaje con HTTP 500, y convertirlo en un error HTTP opaco
        // perdería el código de la AEAT que va dentro del `faultstring`.
        if (xml) {
          const fault = findNode(xml, 'Fault');
          if (fault) {
            const faultCode = getChildText(fault, 'faultcode') ?? 'Unknown';
            const faultString = getChildText(fault, 'faultstring') ?? 'Unknown error';
            reject(SoapError.fromFault(faultCode, faultString));
            return;
          }
        }

        if (statusCode >= 400) {
          const retryAfterMs = parseRetryAfter(headers['retry-after']);
          reject(
            new HttpStatusError(statusCode, body, {
              url: options.url,
              ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
            })
          );
          return;
        }

        if (!xml) {
          reject(
            new SoapError(`Failed to parse SOAP response: ${errorDeParseo?.message ?? ''}`, {
              ...(errorDeParseo === undefined ? {} : { cause: errorDeParseo }),
            })
          );
          return;
        }

        resolve({ statusCode, body, xml, headers });
      });

      res.on('error', (error: Error) => {
        reject(new NetworkError(`Response error: ${error.message}`, undefined, { cause: error }));
      });
    });

    req.on('error', (error: Error) => {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
        reject(new ConnectionError(url.hostname, error));
      } else {
        reject(new NetworkError(`Request error: ${error.message}`, undefined, { cause: error }));
      }
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new TimeoutError('SOAP request', timeout));
    });

    // Send request body
    req.write(options.body);
    req.end();
    } catch (error) {
      // `request()` construye el contexto TLS de forma SÍNCRONA, así que un
      // PKCS#12 que OpenSSL 3 no sabe descifrar revienta aquí, antes de tocar
      // la red. Sin traducirlo llegaba como «Request error: Unsupported PKCS12
      // PFX data» —un error de red por un problema de certificado— y todo el
      // diagnóstico de `certificateErrorFor` quedaba inalcanzable, porque
      // `validateCertificate` no se invoca en el camino real.
      reject(esPkcs12Heredado(error) ? certificateErrorFor(error) : error);
    }
  });
}

/**
 * SOAP client class
 */
export class SoapClient {
  private tls: TlsOptions;
  private timeout: number;

  constructor(tls: TlsOptions, timeout: number = DEFAULT_TIMEOUT) {
    this.tls = tls;
    this.timeout = timeout;
  }

  /**
   * Send a SOAP request
   */
  async send(url: string, soapAction: string, body: string): Promise<SoapResponse> {
    return sendSoapRequest({
      url,
      soapAction,
      body,
      tls: this.tls,
      timeout: this.timeout,
    });
  }

  /**
   * Update TLS options (e.g., after certificate reload)
   */
  updateTls(tls: TlsOptions): void {
    this.tls = tls;
  }

  /**
   * Update timeout
   */
  setTimeout(timeout: number): void {
    this.timeout = timeout;
  }
}

/**
 * Create a SOAP client
 */
export function createSoapClient(tls: TlsOptions, timeout?: number): SoapClient {
  return new SoapClient(tls, timeout);
}
