/**
 * Tests for SOAP Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import * as https from 'node:https';
import {
  sendSoapRequest,
  SoapClient,
  createSoapClient,
  type SoapRequestOptions,
} from '../../src/client/soap-client.js';
import {
  NetworkError,
  ConnectionError,
  TimeoutError,
  SoapError,
} from '../../src/errors/network-errors.js';
import type { TlsOptions } from '../../src/crypto/certificate.js';

// Mock https module
vi.mock('node:https', () => ({
  request: vi.fn(),
}));

describe('SoapClient', () => {
  const mockRequest = https.request as ReturnType<typeof vi.fn>;
  let mockReq: EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  let mockRes: EventEmitter & { statusCode: number; headers: Record<string, string> };

  const tlsOptions: TlsOptions = {
    pfx: Buffer.from('mock-pfx'),
    passphrase: 'password',
  };

  const createSoapRequestOptions = (): SoapRequestOptions => ({
    url: 'https://example.com/soap',
    soapAction: 'http://example.com/action',
    body: '<soap:Envelope><soap:Body></soap:Body></soap:Envelope>',
    tls: tlsOptions,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = Object.assign(new EventEmitter(), {
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    });

    mockRes = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headers: { 'content-type': 'text/xml' },
    });

    mockRequest.mockImplementation((_options: unknown, callback: (res: typeof mockRes) => void) => {
      // Defer callback to allow test to set up response
      process.nextTick(() => callback(mockRes));
      return mockReq;
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('sendSoapRequest', () => {
    it('should send SOAP request successfully', async () => {
      const responseXml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Response>OK</Response>
  </soap:Body>
</soap:Envelope>`;

      mockRequest.mockImplementation((_options: unknown, callback: (res: typeof mockRes) => void) => {
        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(responseXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      const options = createSoapRequestOptions();
      const response = await sendSoapRequest(options);

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Response');
      expect(response.xml).toBeDefined();
      expect(mockReq.write).toHaveBeenCalledWith(options.body);
      expect(mockReq.end).toHaveBeenCalled();
    });

    it('should use correct request options', async () => {
      const responseXml = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body></soap:Body></soap:Envelope>`;

      mockRequest.mockImplementation((requestOptions: Record<string, unknown>, callback: (res: typeof mockRes) => void) => {
        // Verify request options
        expect(requestOptions.hostname).toBe('example.com');
        expect(requestOptions.method).toBe('POST');
        expect((requestOptions.headers as Record<string, string>)['Content-Type']).toBe('text/xml; charset=utf-8');
        expect((requestOptions.headers as Record<string, string>)['SOAPAction']).toBe('http://example.com/action');
        expect(requestOptions.pfx).toEqual(tlsOptions.pfx);
        expect(requestOptions.passphrase).toBe(tlsOptions.passphrase);

        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(responseXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      await sendSoapRequest(createSoapRequestOptions());
    });

    it('should handle URL with custom port', async () => {
      const responseXml = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body></soap:Body></soap:Envelope>`;

      mockRequest.mockImplementation((requestOptions: Record<string, unknown>, callback: (res: typeof mockRes) => void) => {
        expect(requestOptions.port).toBe('8443');

        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(responseXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      const options = createSoapRequestOptions();
      options.url = 'https://example.com:8443/soap';
      await sendSoapRequest(options);
    });

    it('should handle URL with query string', async () => {
      const responseXml = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body></soap:Body></soap:Envelope>`;

      mockRequest.mockImplementation((requestOptions: Record<string, unknown>, callback: (res: typeof mockRes) => void) => {
        expect(requestOptions.path).toBe('/soap?param=value');

        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(responseXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      const options = createSoapRequestOptions();
      options.url = 'https://example.com/soap?param=value';
      await sendSoapRequest(options);
    });

    it('should use custom timeout', async () => {
      const responseXml = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body></soap:Body></soap:Envelope>`;

      mockRequest.mockImplementation((requestOptions: Record<string, unknown>, callback: (res: typeof mockRes) => void) => {
        expect(requestOptions.timeout).toBe(60000);

        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(responseXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      const options = createSoapRequestOptions();
      options.timeout = 60000;
      await sendSoapRequest(options);
    });

    it('should use default timeout when not specified', async () => {
      const responseXml = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body></soap:Body></soap:Envelope>`;

      mockRequest.mockImplementation((requestOptions: Record<string, unknown>, callback: (res: typeof mockRes) => void) => {
        expect(requestOptions.timeout).toBe(30000); // Default

        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(responseXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      await sendSoapRequest(createSoapRequestOptions());
    });

    it('should handle SOAP fault response', async () => {
      const faultXml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Client</faultcode>
      <faultstring>Invalid request</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

      mockRequest.mockImplementation((_options: unknown, callback: (res: typeof mockRes) => void) => {
        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(faultXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      await expect(sendSoapRequest(createSoapRequestOptions())).rejects.toThrow(SoapError);
    });

    it('should handle SOAP fault with missing faultcode', async () => {
      const faultXml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultstring>Some error</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

      mockRequest.mockImplementation((_options: unknown, callback: (res: typeof mockRes) => void) => {
        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(faultXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      await expect(sendSoapRequest(createSoapRequestOptions())).rejects.toThrow(SoapError);
    });

    it('should handle XML parse error', async () => {
      const invalidXml = 'not valid xml <<<<';

      mockRequest.mockImplementation((_options: unknown, callback: (res: typeof mockRes) => void) => {
        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(invalidXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      await expect(sendSoapRequest(createSoapRequestOptions())).rejects.toThrow(SoapError);
      await expect(sendSoapRequest(createSoapRequestOptions())).rejects.toThrow(/Failed to parse SOAP response/);
    });

    it('should handle response error', async () => {
      mockRequest.mockImplementation((_options: unknown, callback: (res: typeof mockRes) => void) => {
        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('error', new Error('Response stream error'));
          });
        });
        return mockReq;
      });

      await expect(sendSoapRequest(createSoapRequestOptions())).rejects.toThrow(NetworkError);
      await expect(sendSoapRequest(createSoapRequestOptions())).rejects.toThrow(/Response error/);
    });

    it('should handle connection refused error', async () => {
      mockRequest.mockImplementation(() => {
        process.nextTick(() => {
          mockReq.emit('error', new Error('connect ECONNREFUSED'));
        });
        return mockReq;
      });

      await expect(sendSoapRequest(createSoapRequestOptions())).rejects.toThrow(ConnectionError);
    });

    it('should handle DNS resolution error', async () => {
      mockRequest.mockImplementation(() => {
        process.nextTick(() => {
          mockReq.emit('error', new Error('getaddrinfo ENOTFOUND'));
        });
        return mockReq;
      });

      await expect(sendSoapRequest(createSoapRequestOptions())).rejects.toThrow(ConnectionError);
    });

    it('should handle generic request error', async () => {
      mockRequest.mockImplementation(() => {
        process.nextTick(() => {
          mockReq.emit('error', new Error('Unknown error'));
        });
        return mockReq;
      });

      await expect(sendSoapRequest(createSoapRequestOptions())).rejects.toThrow(NetworkError);
      await expect(sendSoapRequest(createSoapRequestOptions())).rejects.toThrow(/Request error/);
    });

    it('should handle timeout', async () => {
      mockRequest.mockImplementation(() => {
        process.nextTick(() => {
          mockReq.emit('timeout');
        });
        return mockReq;
      });

      await expect(sendSoapRequest(createSoapRequestOptions())).rejects.toThrow(TimeoutError);
      expect(mockReq.destroy).toHaveBeenCalled();
    });

    it('should handle multiple data chunks', async () => {
      const part1 = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">`;
      const part2 = `<soap:Body><Data>Test</Data></soap:Body></soap:Envelope>`;

      mockRequest.mockImplementation((_options: unknown, callback: (res: typeof mockRes) => void) => {
        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(part1));
            mockRes.emit('data', Buffer.from(part2));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      const response = await sendSoapRequest(createSoapRequestOptions());

      expect(response.body).toContain('Data');
      expect(response.body).toContain('Test');
    });

    it('should return response headers', async () => {
      const responseXml = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body></soap:Body></soap:Envelope>`;
      mockRes.headers = { 'x-custom-header': 'value' };

      mockRequest.mockImplementation((_options: unknown, callback: (res: typeof mockRes) => void) => {
        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(responseXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      const response = await sendSoapRequest(createSoapRequestOptions());

      expect(response.headers['x-custom-header']).toBe('value');
    });

    it('should handle missing status code', async () => {
      const responseXml = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body></soap:Body></soap:Envelope>`;
      mockRes.statusCode = undefined as unknown as number;

      mockRequest.mockImplementation((_options: unknown, callback: (res: typeof mockRes) => void) => {
        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(responseXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      const response = await sendSoapRequest(createSoapRequestOptions());

      expect(response.statusCode).toBe(0);
    });
  });

  describe('SoapClient class', () => {
    it('should create client with TLS options', () => {
      const client = new SoapClient(tlsOptions);

      expect(client).toBeInstanceOf(SoapClient);
    });

    it('should create client with custom timeout', () => {
      const client = new SoapClient(tlsOptions, 60000);

      expect(client).toBeInstanceOf(SoapClient);
    });

    it('should send request through client', async () => {
      const responseXml = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body></soap:Body></soap:Envelope>`;

      mockRequest.mockImplementation((_options: unknown, callback: (res: typeof mockRes) => void) => {
        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(responseXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      const client = new SoapClient(tlsOptions);
      const response = await client.send(
        'https://example.com/soap',
        'http://example.com/action',
        '<soap:Envelope><soap:Body></soap:Body></soap:Envelope>'
      );

      expect(response.statusCode).toBe(200);
    });

    it('should update TLS options', async () => {
      const responseXml = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body></soap:Body></soap:Envelope>`;
      const newTls: TlsOptions = {
        pfx: Buffer.from('new-pfx'),
        passphrase: 'new-password',
      };

      mockRequest.mockImplementation((requestOptions: Record<string, unknown>, callback: (res: typeof mockRes) => void) => {
        // Verify new TLS options are used
        expect(requestOptions.pfx).toEqual(newTls.pfx);

        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(responseXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      const client = new SoapClient(tlsOptions);
      client.updateTls(newTls);
      await client.send('https://example.com/soap', 'action', '<body/>');
    });

    it('should update timeout', async () => {
      const responseXml = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body></soap:Body></soap:Envelope>`;

      mockRequest.mockImplementation((requestOptions: Record<string, unknown>, callback: (res: typeof mockRes) => void) => {
        expect(requestOptions.timeout).toBe(120000);

        process.nextTick(() => {
          callback(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', Buffer.from(responseXml));
            mockRes.emit('end');
          });
        });
        return mockReq;
      });

      const client = new SoapClient(tlsOptions);
      client.setTimeout(120000);
      await client.send('https://example.com/soap', 'action', '<body/>');
    });
  });

  describe('createSoapClient', () => {
    it('should create SoapClient instance', () => {
      const client = createSoapClient(tlsOptions);

      expect(client).toBeInstanceOf(SoapClient);
    });

    it('should create SoapClient with custom timeout', () => {
      const client = createSoapClient(tlsOptions, 45000);

      expect(client).toBeInstanceOf(SoapClient);
    });
  });
});
