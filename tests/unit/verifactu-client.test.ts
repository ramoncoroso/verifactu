/**
 * Tests for Verifactu Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildRespuestaConsulta,
  buildRespuestaSuministro,
  wrapSoapResponse,
} from '../fixtures/aeat-respuesta.js';
import {
  VerifactuClient,
  createVerifactuClient,
  type VerifactuClientConfig,
} from '../../src/client/verifactu-client.js';
import type { Invoice, InvoiceId } from '../../src/models/invoice.js';
import type { Issuer, SoftwareInfo } from '../../src/models/party.js';
import type { SoapResponse } from '../../src/client/soap-client.js';
import { AeatError } from '../../src/errors/network-errors.js';
import { parseXml } from '../../src/xml/parser.js';

// Mock the modules
vi.mock('../../src/crypto/certificate.js', () => ({
  createCertificateManager: vi.fn(() => ({
    getTlsOptions: vi.fn(() => ({
      pfx: Buffer.from('mock-pfx'),
      passphrase: 'password',
    })),
  })),
}));

vi.mock('../../src/client/soap-client.js', () => ({
  createSoapClient: vi.fn(() => ({
    send: vi.fn(),
  })),
}));

// Import mocked modules
import { createCertificateManager } from '../../src/crypto/certificate.js';
import { createSoapClient } from '../../src/client/soap-client.js';

describe('VerifactuClient', () => {
  const mockSoapClient = {
    send: vi.fn(),
  };

  const softwareInfo: SoftwareInfo = {
    name: 'Test Software',
    developerTaxId: 'B12345678',
    version: '1.0.0',
    installationNumber: '001',
    systemType: 'S',
  };

  const createConfig = (): VerifactuClientConfig => ({
    environment: 'sandbox',
    certificate: {
      type: 'pfx',
      path: '/path/to/cert.pfx',
      password: 'password',
    },
    software: softwareInfo,
  });

  const createValidInvoice = (): Invoice => ({
    operationType: 'A',
    invoiceType: 'F1',
    // Obligatoria en el XSD: sin ella el documento no valida.
    description: 'Servicios de prueba',
    id: {
      series: 'A',
      number: '001',
      issueDate: new Date('2024-01-15'),
    },
    issuer: {
      taxId: { type: 'NIF', value: 'B12345674' },
      name: 'Test Company SL',
    },
    recipients: [
      {
        taxId: { type: 'NIF', value: 'A12345674' },
        name: 'Client SA',
      },
    ],
    operationRegimes: ['01'],
    taxBreakdown: {
      vatBreakdowns: [
        {
          vatRate: 21,
          taxBase: 100,
          vatAmount: 21,
        },
      ],
    },
    totalAmount: 121,
  });

  // Las respuestas de este fichero usaban un formato inventado
  // (<RespuestaRegFactura>, <EstadoRegistro> colgando de la raíz) que no existe
  // en ningún XSD de la AEAT. Por eso los 28 tests pasaban mientras el parser era
  // incapaz de leer una respuesta real. Ahora salen del generador de
  // tests/fixtures/aeat-respuesta.ts, que se valida contra RespuestaSuministro.xsd
  // en tests/conformance/respuesta.test.ts.
  const createSuccessResponse = (type: 'alta' | 'anulacion' | 'consulta'): SoapResponse => {
    const body =
      type === 'consulta'
        ? wrapSoapResponse(buildRespuestaConsulta())
        : wrapSoapResponse(
            buildRespuestaSuministro({
              csv: type === 'alta' ? 'ABC123' : 'DEF456',
              lineas: [{ estadoRegistro: 'Correcto', tipoOperacion: type === 'alta' ? 'Alta' : 'Anulacion' }],
            })
          );

    return {
      statusCode: 200,
      body,
      xml: parseXml(body),
      headers: {},
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createCertificateManager as ReturnType<typeof vi.fn>).mockReturnValue({
      getTlsOptions: vi.fn(() => ({
        pfx: Buffer.from('mock-pfx'),
        passphrase: 'password',
      })),
    });
    (createSoapClient as ReturnType<typeof vi.fn>).mockReturnValue(mockSoapClient);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      const config = createConfig();
      const client = new VerifactuClient(config);

      expect(client).toBeInstanceOf(VerifactuClient);
      expect(createCertificateManager).toHaveBeenCalledWith(config.certificate);
      expect(createSoapClient).toHaveBeenCalled();
    });

    it('should create client with production environment', () => {
      const config = createConfig();
      config.environment = 'production';
      const client = new VerifactuClient(config);

      expect(client).toBeInstanceOf(VerifactuClient);
    });

    it('should create client with custom timeout', () => {
      const config = createConfig();
      config.timeout = 60000;
      new VerifactuClient(config);

      expect(createSoapClient).toHaveBeenCalledWith(expect.anything(), 60000);
    });

    it('should create client with initial chain state', () => {
      const config = createConfig();
      config.chainState = {
        lastHash: 'abc123',
        lastNumber: '001',
        lastDate: new Date('2024-01-10'),
        lastSeries: 'A',
        recordCount: 1,
      };
      const client = new VerifactuClient(config);

      expect(client).toBeInstanceOf(VerifactuClient);
      const state = client.getChainState();
      expect(state.recordCount).toBe(1);
    });
  });

  describe('submitInvoice', () => {
    it('should submit invoice successfully', async () => {
      mockSoapClient.send.mockResolvedValue(createSuccessResponse('alta'));

      const client = new VerifactuClient(createConfig());
      const invoice = createValidInvoice();
      const response = await client.submitInvoice(invoice);

      expect(response.accepted).toBe(true);
      expect(response.state).toBe('Correcto');
      expect(response.csv).toBe('ABC123');
      expect(response.invoice.hash).toBeDefined();
      expect(mockSoapClient.send).toHaveBeenCalledTimes(1);
    });

    it('should handle invoice without series', async () => {
      mockSoapClient.send.mockResolvedValue(createSuccessResponse('alta'));

      const client = new VerifactuClient(createConfig());
      const invoice = createValidInvoice();
      invoice.id.series = undefined;
      const response = await client.submitInvoice(invoice);

      expect(response.accepted).toBe(true);
    });

    it('should handle invoice with description', async () => {
      mockSoapClient.send.mockResolvedValue(createSuccessResponse('alta'));

      const client = new VerifactuClient(createConfig());
      const invoice = createValidInvoice();
      invoice.description = 'Test description';
      const response = await client.submitInvoice(invoice);

      expect(response.accepted).toBe(true);
    });

    it('should handle invoice without recipients', async () => {
      mockSoapClient.send.mockResolvedValue(createSuccessResponse('alta'));

      const client = new VerifactuClient(createConfig());
      const invoice = createValidInvoice();
      invoice.recipients = undefined;
      const response = await client.submitInvoice(invoice);

      expect(response.accepted).toBe(true);
    });

    it('should handle invoice with foreign recipient', async () => {
      mockSoapClient.send.mockResolvedValue(createSuccessResponse('alta'));

      const client = new VerifactuClient(createConfig());
      const invoice = createValidInvoice();
      invoice.recipients = [{
        taxId: { type: 'VAT', value: 'FR12345678901', country: 'FR' },
        name: 'French Client SARL',
      }];
      const response = await client.submitInvoice(invoice);

      expect(response.accepted).toBe(true);
    });

    it('should handle rejected response', async () => {
      const rejectedBody = wrapSoapResponse(buildRespuestaSuministro({ lineas: [{ estadoRegistro: 'Incorrecto', codigoError: 1234, descripcionError: 'Error de validación' }] }));
      mockSoapClient.send.mockResolvedValue({
        statusCode: 200,
        body: rejectedBody,
        xml: parseXml(rejectedBody),
        headers: {},
      });

      const client = new VerifactuClient(createConfig());
      const response = await client.submitInvoice(createValidInvoice());

      expect(response.accepted).toBe(false);
      expect(response.state).toBe('Incorrecto');
      expect(response.errorCode).toBe('1234');
      expect(response.errorDescription).toBe('Error de validación');
    });

    it('should handle AceptadoConErrores response', async () => {
      const acceptedWithErrorsBody = wrapSoapResponse(buildRespuestaSuministro({ lineas: [{ estadoRegistro: 'AceptadoConErrores' }] }));
      mockSoapClient.send.mockResolvedValue({
        statusCode: 200,
        body: acceptedWithErrorsBody,
        xml: parseXml(acceptedWithErrorsBody),
        headers: {},
      });

      const client = new VerifactuClient(createConfig());
      const response = await client.submitInvoice(createValidInvoice());

      expect(response.accepted).toBe(true);
      expect(response.state).toBe('AceptadoConErrores');
    });

    it('lanza AeatError si la respuesta no es una respuesta de la AEAT', async () => {
      // El caso real: una página de error HTTP. El parser no lanza al leerla
      // (issue #37), así que el error tiene que emerger aquí con un mensaje que
      // apunte a la causa y no a un problema del registro.
      const invalidBody = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body><html><body>403 Forbidden</body></html></soap:Body>
</soap:Envelope>`;
      mockSoapClient.send.mockResolvedValue({
        statusCode: 200,
        body: invalidBody,
        xml: parseXml(invalidBody),
        headers: {},
      });

      const client = new VerifactuClient(createConfig());
      await expect(client.submitInvoice(createValidInvoice())).rejects.toThrow(
        /RespuestaRegFactuSistemaFacturacion/
      );
    });

    it('should throw AeatError on invalid cancellation response', async () => {
      const invalidBody = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <UnknownElement/>
  </soap:Body>
</soap:Envelope>`;
      mockSoapClient.send.mockResolvedValue({
        statusCode: 200,
        body: invalidBody,
        xml: parseXml(invalidBody),
        headers: {},
      });

      const client = new VerifactuClient(createConfig());

      await expect(
        client.cancelInvoice(
          { number: '001', issueDate: new Date() },
          { taxId: { type: 'NIF', value: 'B12345674' }, name: 'Test' }
        )
      ).rejects.toThrow(AeatError);
    });
  });

  describe('checkInvoiceStatus', () => {
    it('should check invoice status successfully', async () => {
      mockSoapClient.send.mockResolvedValue(createSuccessResponse('consulta'));

      const client = new VerifactuClient(createConfig());
      const invoiceId: InvoiceId = {
        series: 'A',
        number: '001',
        issueDate: new Date('2024-01-15'),
      };

      const response = await client.checkInvoiceStatus(invoiceId, 'B12345674');

      expect(response.found).toBe(true);
      expect(response.state).toBe('Correcto');
      expect(response.registrationTimestamp).toBeInstanceOf(Date);
    });

    it('should handle invoice not found', async () => {
      const notFoundBody = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <sfLRRC:RespuestaConsultaFactuSistemaFacturacion/>
  </soap:Body>
</soap:Envelope>`;
      mockSoapClient.send.mockResolvedValue({
        statusCode: 200,
        body: notFoundBody,
        xml: parseXml(notFoundBody),
        headers: {},
      });

      const client = new VerifactuClient(createConfig());
      const response = await client.checkInvoiceStatus(
        { number: '999', issueDate: new Date() },
        'B12345674'
      );

      expect(response.found).toBe(false);
    });

    it('should handle missing Respuesta element', async () => {
      const emptyBody = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <UnknownElement/>
  </soap:Body>
</soap:Envelope>`;
      mockSoapClient.send.mockResolvedValue({
        statusCode: 200,
        body: emptyBody,
        xml: parseXml(emptyBody),
        headers: {},
      });

      const client = new VerifactuClient(createConfig());
      const response = await client.checkInvoiceStatus(
        { number: '001', issueDate: new Date() },
        'B12345674'
      );

      expect(response.found).toBe(false);
    });

    it('should handle query without series', async () => {
      mockSoapClient.send.mockResolvedValue(createSuccessResponse('consulta'));

      const client = new VerifactuClient(createConfig());
      const invoiceId: InvoiceId = {
        number: '001',
        issueDate: new Date('2024-01-15'),
      };

      const response = await client.checkInvoiceStatus(invoiceId, 'B12345674');

      expect(response.found).toBe(true);
    });
  });

  describe('getChainState', () => {
    it('should return initial chain state', () => {
      const client = new VerifactuClient(createConfig());
      const state = client.getChainState();

      expect(state.recordCount).toBe(0);
    });

    it('should return updated chain state after submission', async () => {
      mockSoapClient.send.mockResolvedValue(createSuccessResponse('alta'));

      const client = new VerifactuClient(createConfig());
      await client.submitInvoice(createValidInvoice());
      const state = client.getChainState();

      expect(state.recordCount).toBe(1);
      expect(state.lastHash).toBeDefined();
      expect(state.lastHash.length).toBeGreaterThan(0);
    });
  });

  describe('getSoftwareInfo', () => {
    it('should return software info', () => {
      const config = createConfig();
      const client = new VerifactuClient(config);
      const info = client.getSoftwareInfo();

      expect(info).toEqual(softwareInfo);
    });
  });

  describe('createVerifactuClient', () => {
    it('should create VerifactuClient instance', () => {
      const client = createVerifactuClient(createConfig());

      expect(client).toBeInstanceOf(VerifactuClient);
    });
  });

  describe('chain state persistence', () => {
    it('should resume from saved chain state', async () => {
      mockSoapClient.send.mockResolvedValue(createSuccessResponse('alta'));

      // First client - submit invoice
      const client1 = new VerifactuClient(createConfig());
      await client1.submitInvoice(createValidInvoice());
      const savedState = client1.getChainState();

      // Second client - resume from saved state
      const config2 = createConfig();
      config2.chainState = savedState;
      const client2 = new VerifactuClient(config2);
      const resumedState = client2.getChainState();

      expect(resumedState.recordCount).toBe(savedState.recordCount);
      expect(resumedState.lastHash).toBe(savedState.lastHash);
    });
  });
});
