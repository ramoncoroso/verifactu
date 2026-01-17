/**
 * Tests for Verifactu Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    systemType: 'V',
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

  const createSuccessResponse = (type: 'alta' | 'anulacion' | 'consulta'): SoapResponse => {
    let body: string;

    if (type === 'alta') {
      body = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RespuestaRegFactura>
      <EstadoRegistro>Correcto</EstadoRegistro>
      <CSV>ABC123</CSV>
    </RespuestaRegFactura>
  </soap:Body>
</soap:Envelope>`;
    } else if (type === 'anulacion') {
      body = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RespuestaAnulacion>
      <EstadoRegistro>Correcto</EstadoRegistro>
      <CSV>DEF456</CSV>
    </RespuestaAnulacion>
  </soap:Body>
</soap:Envelope>`;
    } else {
      body = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RespuestaConsulta>
      <RegistroRespuestaConsulta>
        <EstadoRegistro>Correcto</EstadoRegistro>
        <CSV>GHI789</CSV>
        <FechaHoraRegistro>2024-01-15T10:30:00</FechaHoraRegistro>
      </RegistroRespuestaConsulta>
    </RespuestaConsulta>
  </soap:Body>
</soap:Envelope>`;
    }

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
      const rejectedBody = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RespuestaRegFactura>
      <EstadoRegistro>Rechazado</EstadoRegistro>
      <CodigoErrorRegistro>1234</CodigoErrorRegistro>
      <DescripcionErrorRegistro>Error de validación</DescripcionErrorRegistro>
    </RespuestaRegFactura>
  </soap:Body>
</soap:Envelope>`;
      mockSoapClient.send.mockResolvedValue({
        statusCode: 200,
        body: rejectedBody,
        xml: parseXml(rejectedBody),
        headers: {},
      });

      const client = new VerifactuClient(createConfig());
      const response = await client.submitInvoice(createValidInvoice());

      expect(response.accepted).toBe(false);
      expect(response.state).toBe('Rechazado');
      expect(response.errorCode).toBe('1234');
      expect(response.errorDescription).toBe('Error de validación');
    });

    it('should handle AceptadoConErrores response', async () => {
      const acceptedWithErrorsBody = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RespuestaRegFactura>
      <EstadoRegistro>AceptadoConErrores</EstadoRegistro>
      <CSV>XYZ789</CSV>
    </RespuestaRegFactura>
  </soap:Body>
</soap:Envelope>`;
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

    it('should throw AeatError on invalid response', async () => {
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

      await expect(client.submitInvoice(createValidInvoice())).rejects.toThrow(AeatError);
    });

    it('should handle response with Respuesta element', async () => {
      const respuestaBody = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Respuesta>
      <Estado>Correcto</Estado>
      <CSV>ALT123</CSV>
    </Respuesta>
  </soap:Body>
</soap:Envelope>`;
      mockSoapClient.send.mockResolvedValue({
        statusCode: 200,
        body: respuestaBody,
        xml: parseXml(respuestaBody),
        headers: {},
      });

      const client = new VerifactuClient(createConfig());
      const response = await client.submitInvoice(createValidInvoice());

      expect(response.accepted).toBe(true);
      expect(response.csv).toBe('ALT123');
    });

    it('should maintain chain state across submissions', async () => {
      mockSoapClient.send.mockResolvedValue(createSuccessResponse('alta'));

      const client = new VerifactuClient(createConfig());

      // First invoice
      await client.submitInvoice(createValidInvoice());
      const state1 = client.getChainState();
      expect(state1.recordCount).toBe(1);

      // Second invoice
      const invoice2 = createValidInvoice();
      invoice2.id.number = '002';
      await client.submitInvoice(invoice2);
      const state2 = client.getChainState();
      expect(state2.recordCount).toBe(2);
    });
  });

  describe('cancelInvoice', () => {
    it('should cancel invoice successfully', async () => {
      mockSoapClient.send.mockResolvedValue(createSuccessResponse('anulacion'));

      const client = new VerifactuClient(createConfig());
      const invoiceId: InvoiceId = {
        series: 'A',
        number: '001',
        issueDate: new Date('2024-01-15'),
      };
      const issuer: Issuer = {
        taxId: { type: 'NIF', value: 'B12345674' },
        name: 'Test Company SL',
      };

      const response = await client.cancelInvoice(invoiceId, issuer, 'Error en factura');

      expect(response.accepted).toBe(true);
      expect(response.state).toBe('Correcto');
      expect(response.csv).toBe('DEF456');
      expect(response.cancellation.hash).toBeDefined();
    });

    it('should cancel invoice without reason', async () => {
      mockSoapClient.send.mockResolvedValue(createSuccessResponse('anulacion'));

      const client = new VerifactuClient(createConfig());
      const invoiceId: InvoiceId = {
        series: 'A',
        number: '001',
        issueDate: new Date('2024-01-15'),
      };
      const issuer: Issuer = {
        taxId: { type: 'NIF', value: 'B12345674' },
        name: 'Test Company SL',
      };

      const response = await client.cancelInvoice(invoiceId, issuer);

      expect(response.accepted).toBe(true);
    });

    it('should handle cancelled invoice without series', async () => {
      mockSoapClient.send.mockResolvedValue(createSuccessResponse('anulacion'));

      const client = new VerifactuClient(createConfig());
      const invoiceId: InvoiceId = {
        number: '001',
        issueDate: new Date('2024-01-15'),
      };
      const issuer: Issuer = {
        taxId: { type: 'NIF', value: 'B12345674' },
        name: 'Test Company SL',
      };

      const response = await client.cancelInvoice(invoiceId, issuer);

      expect(response.accepted).toBe(true);
    });

    it('should handle rejected cancellation', async () => {
      const rejectedBody = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RespuestaAnulacion>
      <EstadoRegistro>Rechazado</EstadoRegistro>
      <CodigoErrorRegistro>5678</CodigoErrorRegistro>
      <DescripcionErrorRegistro>Factura no encontrada</DescripcionErrorRegistro>
    </RespuestaAnulacion>
  </soap:Body>
</soap:Envelope>`;
      mockSoapClient.send.mockResolvedValue({
        statusCode: 200,
        body: rejectedBody,
        xml: parseXml(rejectedBody),
        headers: {},
      });

      const client = new VerifactuClient(createConfig());
      const response = await client.cancelInvoice(
        { number: '001', issueDate: new Date() },
        { taxId: { type: 'NIF', value: 'B12345674' }, name: 'Test' }
      );

      expect(response.accepted).toBe(false);
      expect(response.state).toBe('Rechazado');
      expect(response.errorCode).toBe('5678');
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
      expect(response.csv).toBe('GHI789');
      expect(response.registrationTimestamp).toBeInstanceOf(Date);
    });

    it('should handle invoice not found', async () => {
      const notFoundBody = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RespuestaConsulta/>
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
