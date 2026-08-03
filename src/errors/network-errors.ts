/**
 * Network and SOAP-related errors
 */

import { VerifactuError, ErrorCode, type RetryInfo } from './base-error.js';

/**
 * Reintentabilidad por defecto de los errores de red.
 *
 * **Sin `retryAfterMs`.** Llevaba 1000 ms fijos, y como `withRetry` prioriza ese
 * valor sobre el cálculo exponencial, el backoff nunca llegaba a ejecutarse para
 * ningún error que lanzara el cliente SOAP: los reintentos salían a 1000, 1001,
 * 1001 ms. `retryAfterMs` queda reservado para cuando la AEAT indique una espera
 * concreta.
 */
const DEFAULT_RETRY_INFO: RetryInfo = {
  retryable: true,
  maxRetries: 3,
};

/**
 * Si un SOAPFault procede del servidor y por tanto debe reenviarse.
 *
 * La AEAT lo instruye expresamente en el §5.1 de «Descripción del servicio web»:
 * ante un `faultcode` de tipo `soapenv:Server`, «Reenviar mensaje»; ante uno de
 * tipo `soapenv:Client`, corregir antes. Todos los faults se marcaban como no
 * reintentables, en contra de esa instrucción.
 */
export function esFaultDeServidor(faultCode: string | undefined): boolean {
  return /server/i.test(faultCode ?? '');
}

/**
 * Extrae el código de error de la AEAT embebido en el `faultstring`, que llega
 * con el formato `Codigo[4104].texto`.
 */
export function extraerCodigoAeat(faultString: string | undefined): string | undefined {
  return /Codigo\[(\d+)\]/.exec(faultString ?? '')?.[1];
}

/**
 * Base class for network errors
 */
export class NetworkError extends VerifactuError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.NETWORK_ERROR,
    options?: {
      cause?: Error;
      retry?: RetryInfo;
    }
  ) {
    super(message, code, {
      retry: options?.retry ?? DEFAULT_RETRY_INFO,
      cause: options?.cause,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Connection error
 */
export class ConnectionError extends NetworkError {
  constructor(host: string, cause?: Error) {
    super(`Failed to connect to ${host}`, ErrorCode.CONNECTION_ERROR, {
      cause,
      retry: DEFAULT_RETRY_INFO,
    });
    this.name = 'ConnectionError';
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends NetworkError {
  readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, ErrorCode.TIMEOUT_ERROR, {
      retry: {
        retryable: true,
        retryAfterMs: Math.min(timeoutMs, 5000),
        maxRetries: 2,
      },
    });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * SSL/TLS error
 */
export class SslError extends NetworkError {
  constructor(reason: string, cause?: Error) {
    super(`SSL/TLS error: ${reason}`, ErrorCode.SSL_ERROR, {
      cause,
      retry: { retryable: false },
    });
    this.name = 'SslError';
  }
}

/**
 * Códigos de estado que merecen un reenvío.
 *
 * Un 5xx o un 429 son condiciones transitorias del servicio; un 4xx describe una
 * petición que reenviada tal cual volverá a fallar igual. El 408 y el 425 son las
 * dos excepciones dentro del rango 4xx.
 */
/**
 * Si el 3xx es el que devuelve la AEAT cuando falta el certificado de cliente.
 *
 * Medido contra `prewww1.aeat.es`: sin certificado —o con uno que no reconoce—
 * responde `302` con `Location` a su página de error 403.
 */
export function esRedireccionDeCertificado(statusCode: number, location?: string): boolean {
  return statusCode >= 300 && statusCode < 400 && /erro403|errores/i.test(location ?? '');
}

function estadoReintentable(statusCode: number): boolean {
  return statusCode >= 500 || statusCode === 408 || statusCode === 425 || statusCode === 429;
}

/**
 * Traduce una cabecera `Retry-After` —segundos o fecha HTTP— a milisegundos.
 */
export function parseRetryAfter(valor: string | string[] | undefined, ahora = Date.now()): number | undefined {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  if (bruto === undefined || bruto.trim() === '') return undefined;
  const segundos = Number(bruto.trim());
  if (Number.isFinite(segundos)) return segundos >= 0 ? Math.round(segundos * 1000) : undefined;
  const fecha = Date.parse(bruto);
  if (Number.isNaN(fecha)) return undefined;
  return Math.max(0, fecha - ahora);
}

/**
 * Respuesta HTTP con un código de error, sin `SOAPFault` que la explique.
 *
 * Antes se ignoraba el código de estado por completo: un 403 del balanceador de
 * la AEAT —el que sale cuando el certificado no está autorizado para ese NIF—
 * llega con una página HTML, se parseaba sin más, y el fallo emergía tres capas
 * más arriba como «missing RespuestaRegFactuSistemaFacturacion». Un problema de
 * credenciales disfrazado de error de negocio. Y un 503, que sí hay que
 * reintentar, tampoco se distinguía de un éxito.
 */
export class HttpStatusError extends NetworkError {
  readonly statusCode: number;
  /** Cuerpo devuelto por el servidor, íntegro, para poder diagnosticar. */
  readonly responseBody: string;
  /** Destino de la redirección, si el servidor devolvió un 3xx. */
  readonly location?: string;

  constructor(
    statusCode: number,
    responseBody: string,
    options?: { retryAfterMs?: number; url?: string; location?: string }
  ) {
    const reintentable = estadoReintentable(statusCode);
    const extracto = responseBody.replace(/\s+/g, ' ').trim().slice(0, 300);
    super(
      `La AEAT respondió HTTP ${statusCode}${options?.url === undefined ? '' : ` a ${options.url}`}` +
        (options?.location === undefined ? '' : `, redirigiendo a ${options.location}`) +
        (esRedireccionDeCertificado(statusCode, options?.location)
          ? '. Eso significa que el servicio no ha recibido un certificado de cliente válido: ' +
            'su propia página lo explica como «403 Error de identificación. No se detecta ' +
            'certificado electrónico o no se ha seleccionado correctamente». Comprueba que el ' +
            'certificado sea de representante o de sello de entidad, esté emitido por una ' +
            'autoridad reconocida y que su NIF conste en el censo de la AEAT'
          : '') +
        (extracto === '' ? '' : `: ${extracto}${responseBody.length > 300 ? '…' : ''}`),
      ErrorCode.NETWORK_ERROR,
      {
        retry: reintentable
          ? {
              retryable: true,
              maxRetries: 3,
              ...(options?.retryAfterMs === undefined ? {} : { retryAfterMs: options.retryAfterMs }),
            }
          : { retryable: false },
      }
    );
    this.name = 'HttpStatusError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    if (options?.location !== undefined) this.location = options.location;
  }
}

/**
 * SOAP protocol error
 */
export class SoapError extends NetworkError {
  readonly soapFaultCode?: string;
  readonly soapFaultString?: string;
  /** Código de la AEAT embebido en el `faultstring`, si lo trae. */
  readonly aeatCode?: string;

  constructor(
    message: string,
    options?: {
      faultCode?: string;
      faultString?: string;
      cause?: Error;
    }
  ) {
    // La reintentabilidad se deriva del `faultcode`: la AEAT instruye reenviar
    // ante `soapenv:Server` y corregir ante `soapenv:Client`. Marcarlos todos
    // como no reintentables contradecía esa instrucción.
    const reintentable = esFaultDeServidor(options?.faultCode);
    super(message, ErrorCode.SOAP_ERROR, {
      cause: options?.cause,
      retry: reintentable ? { retryable: true, maxRetries: 3 } : { retryable: false },
    });
    this.name = 'SoapError';
    this.soapFaultCode = options?.faultCode;
    this.soapFaultString = options?.faultString;
    const codigo = extraerCodigoAeat(options?.faultString);
    if (codigo !== undefined) this.aeatCode = codigo;
  }

  static fromFault(faultCode: string, faultString: string): SoapError {
    return new SoapError(`SOAP Fault: [${faultCode}] ${faultString}`, {
      faultCode,
      faultString,
    });
  }
}

/**
 * AEAT service error
 */
export class AeatError extends VerifactuError {
  readonly aeatCode?: string;
  readonly aeatDescription?: string;
  readonly registryState?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.AEAT_ERROR,
    options?: {
      aeatCode?: string;
      aeatDescription?: string;
      registryState?: string;
      retry?: RetryInfo;
    }
  ) {
    super(message, code, {
      context: {
        details: {
          aeatCode: options?.aeatCode,
          aeatDescription: options?.aeatDescription,
          registryState: options?.registryState,
        },
      },
      retry: options?.retry,
    });
    this.name = 'AeatError';
    this.aeatCode = options?.aeatCode;
    this.aeatDescription = options?.aeatDescription;
    this.registryState = options?.registryState;
  }
}

/**
 * AEAT rejected record error
 */
export class AeatRejectedError extends AeatError {
  constructor(
    aeatCode: string,
    aeatDescription: string,
    _details?: {
      registryId?: string;
      invoiceNumber?: string;
    }
  ) {
    super(
      `Record rejected by AEAT: [${aeatCode}] ${aeatDescription}`,
      ErrorCode.AEAT_REJECTED,
      {
        aeatCode,
        aeatDescription,
        registryState: 'Rechazado',
        retry: { retryable: false },
      }
    );
    this.name = 'AeatRejectedError';
  }
}

/**
 * AEAT service unavailable error
 */
export class AeatServiceUnavailableError extends AeatError {
  constructor(_cause?: Error) {
    super('AEAT service is temporarily unavailable', ErrorCode.AEAT_SERVICE_UNAVAILABLE, {
      retry: {
        retryable: true,
        retryAfterMs: 30000,
        maxRetries: 5,
      },
    });
    this.name = 'AeatServiceUnavailableError';
  }
}

/**
 * AEAT authentication error
 */
export class AeatAuthenticationError extends AeatError {
  constructor(reason: string) {
    super(`AEAT authentication failed: ${reason}`, ErrorCode.AEAT_AUTHENTICATION_ERROR, {
      retry: { retryable: false },
    });
    this.name = 'AeatAuthenticationError';
  }
}
