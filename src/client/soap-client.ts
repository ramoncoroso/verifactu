/**
 * SOAP Client for Verifactu
 *
 * Low-level SOAP client for communicating with AEAT services.
 * Uses native Node.js fetch with TLS client certificates.
 */

import { request } from 'node:https';
import type { RequestOptions, IncomingMessage } from 'node:https';
import type { TlsOptions } from '../crypto/certificate.js';
import {
  NetworkError,
  ConnectionError,
  TimeoutError,
  SoapError,
} from '../errors/network-errors.js';
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
 * Send a SOAP request
 */
export async function sendSoapRequest(options: SoapRequestOptions): Promise<SoapResponse> {
  const url = new URL(options.url);
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  const requestOptions: RequestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': options.soapAction,
      'Content-Length': Buffer.byteLength(options.body, 'utf8'),
    },
    // TLS options
    ...options.tls,
    timeout,
  };

  return new Promise((resolve, reject) => {
    const req = request(requestOptions, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');

        try {
          // Parse XML response
          const xml = parseXml(body);

          // Check for SOAP fault
          const fault = findNode(xml, 'Fault');
          if (fault) {
            const faultCode = getChildText(fault, 'faultcode') ?? 'Unknown';
            const faultString = getChildText(fault, 'faultstring') ?? 'Unknown error';
            reject(SoapError.fromFault(faultCode, faultString));
            return;
          }

          resolve({
            statusCode: res.statusCode ?? 0,
            body,
            xml,
            headers: res.headers as Record<string, string | string[] | undefined>,
          });
        } catch (parseError) {
          reject(
            new SoapError(`Failed to parse SOAP response: ${(parseError as Error).message}`, {
              cause: parseError as Error,
            })
          );
        }
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
