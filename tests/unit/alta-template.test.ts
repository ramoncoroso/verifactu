/**
 * Tests for Alta (Invoice Registration) XML Template
 */

import { describe, it, expect } from 'vitest';
import {
  buildIssuerXml,
  buildRecipientXml,
  buildSoftwareInfoXml,
  buildVatBreakdownXml,
  buildExemptBreakdownXml,
  buildNonSubjectBreakdownXml,
  buildTaxBreakdownXml,
  buildChainReferenceXml,
  buildFirstRecordChainXml,
  buildAltaRecordXml,
  buildAltaSoapEnvelope,
} from '../../src/xml/templates/alta.js';
import type { Invoice } from '../../src/models/invoice.js';
import type { Issuer, Recipient, SoftwareInfo } from '../../src/models/party.js';
import type { TaxBreakdown, VatBreakdown, ExemptBreakdown, NonSubjectBreakdown } from '../../src/models/tax.js';
import { serializeElement } from '../../src/xml/builder.js';

describe('Alta XML Template', () => {
  const createSoftwareInfo = (): SoftwareInfo => ({
    name: 'TestApp',
    developerTaxId: 'B99999999',
    version: '1.0.0',
    installationNumber: '001',
    systemType: 'S',
  });

  describe('buildIssuerXml', () => {
    it('should build issuer with NIF', () => {
      const issuer: Issuer = {
        taxId: { type: 'NIF', value: 'B12345678' },
        name: 'Test Company SL',
      };

      const xml = buildIssuerXml(issuer);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<IDEmisorFactura>');
      expect(serialized).toContain('<NIF>B12345678</NIF>');
    });
  });

  describe('buildRecipientXml', () => {
    it('should build recipient with NIF', () => {
      const recipient: Recipient = {
        taxId: { type: 'NIF', value: 'A87654321' },
        name: 'Client SA',
      };

      const xml = buildRecipientXml(recipient);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<Destinatario>');
      expect(serialized).toContain('<NIF>A87654321</NIF>');
      expect(serialized).toContain('<NombreRazon>Client SA</NombreRazon>');
    });

    it('should build recipient with foreign ID', () => {
      const recipient: Recipient = {
        taxId: { type: 'PASSPORT', value: 'AB123456', country: 'FR' },
        name: 'Foreign Client',
      };

      const xml = buildRecipientXml(recipient);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<IDOtro>');
      expect(serialized).toContain('<CodigoPais>FR</CodigoPais>');
      expect(serialized).toContain('<IDType>PASSPORT</IDType>');
      expect(serialized).toContain('<ID>AB123456</ID>');
    });

    it('should default country to ES for foreign IDs', () => {
      const recipient: Recipient = {
        taxId: { type: 'VAT', value: 'EU123456789' },
        name: 'EU Client',
      };

      const xml = buildRecipientXml(recipient);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<CodigoPais>ES</CodigoPais>');
    });
  });

  describe('buildSoftwareInfoXml', () => {
    it('should build software info', () => {
      const info: SoftwareInfo = {
        name: 'TestApp',
        developerTaxId: 'B99999999',
        version: '1.0.0',
        installationNumber: '001',
        systemType: 'S',
      };

      const xml = buildSoftwareInfoXml(info);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<SistemaInformatico>');
      expect(serialized).toContain('<NombreRazon>TestApp</NombreRazon>');
      expect(serialized).toContain('<NIF>B99999999</NIF>');
      expect(serialized).toContain('<Version>1.0.0</Version>');
      expect(serialized).toContain('<NumeroInstalacion>001</NumeroInstalacion>');
      expect(serialized).toContain('<TipoUsoPosibleSoloVerifactu>S</TipoUsoPosibleSoloVerifactu>');
    });
  });

  describe('buildVatBreakdownXml', () => {
    it('should build VAT breakdown', () => {
      const breakdown: VatBreakdown = {
        vatRate: 21,
        taxBase: 100,
        vatAmount: 21,
      };

      const xml = buildVatBreakdownXml(breakdown);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<DetalleDesglose>');
      expect(serialized).toContain('<TipoImpositivo>21.00</TipoImpositivo>');
      expect(serialized).toContain('<BaseImponibleOImporteNoSujeto>100.00</BaseImponibleOImporteNoSujeto>');
      expect(serialized).toContain('<CuotaRepercutida>21.00</CuotaRepercutida>');
    });

    it('should include equivalence surcharge if present', () => {
      const breakdown: VatBreakdown = {
        vatRate: 21,
        taxBase: 100,
        vatAmount: 21,
        equivalenceSurchargeRate: 5.2,
        equivalenceSurchargeAmount: 5.2,
      };

      const xml = buildVatBreakdownXml(breakdown);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<TipoRecargoEquivalencia>5.20</TipoRecargoEquivalencia>');
      expect(serialized).toContain('<CuotaRecargoEquivalencia>5.20</CuotaRecargoEquivalencia>');
    });
  });

  describe('buildExemptBreakdownXml', () => {
    it('should build exempt breakdown', () => {
      const breakdown: ExemptBreakdown = {
        exemptionType: 'E1',
        taxBase: 500,
      };

      const xml = buildExemptBreakdownXml(breakdown);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<DetalleDesglose>');
      expect(serialized).toContain('<CalificacionOperacion>E</CalificacionOperacion>');
      expect(serialized).toContain('<BaseImponibleOImporteNoSujeto>500.00</BaseImponibleOImporteNoSujeto>');
    });
  });

  describe('buildNonSubjectBreakdownXml', () => {
    it('should build non-subject breakdown', () => {
      const breakdown: NonSubjectBreakdown = {
        cause: 'OT',
        amount: 1000,
      };

      const xml = buildNonSubjectBreakdownXml(breakdown);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<DetalleDesglose>');
      expect(serialized).toContain('<CalificacionOperacion>N</CalificacionOperacion>');
      expect(serialized).toContain('<OperacionNoSujeta>OT</OperacionNoSujeta>');
      expect(serialized).toContain('<BaseImponibleOImporteNoSujeto>1000.00</BaseImponibleOImporteNoSujeto>');
    });
  });

  describe('buildTaxBreakdownXml', () => {
    it('should build tax breakdown with VAT', () => {
      const breakdown: TaxBreakdown = {
        vatBreakdowns: [
          { vatRate: 21, taxBase: 100, vatAmount: 21 },
        ],
      };

      const xml = buildTaxBreakdownXml(breakdown);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<Desglose>');
      expect(serialized).toContain('<DetalleDesglose>');
      expect(serialized).toContain('<TipoImpositivo>21.00</TipoImpositivo>');
    });

    it('should build tax breakdown with exempt', () => {
      const breakdown: TaxBreakdown = {
        exemptBreakdowns: [
          { exemptionType: 'E1', taxBase: 500 },
        ],
      };

      const xml = buildTaxBreakdownXml(breakdown);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<Desglose>');
      expect(serialized).toContain('<DetalleDesglose>');
      expect(serialized).toContain('<CalificacionOperacion>E</CalificacionOperacion>');
    });

    it('should build tax breakdown with non-subject', () => {
      const breakdown: TaxBreakdown = {
        nonSubjectBreakdowns: [
          { cause: 'OT', amount: 1000 },
        ],
      };

      const xml = buildTaxBreakdownXml(breakdown);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<Desglose>');
      expect(serialized).toContain('<DetalleDesglose>');
      expect(serialized).toContain('<OperacionNoSujeta>OT</OperacionNoSujeta>');
    });

    it('should combine multiple breakdown types', () => {
      const breakdown: TaxBreakdown = {
        vatBreakdowns: [
          { vatRate: 21, taxBase: 100, vatAmount: 21 },
        ],
        exemptBreakdowns: [
          { exemptionType: 'E1', taxBase: 50 },
        ],
      };

      const xml = buildTaxBreakdownXml(breakdown);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<TipoImpositivo>21.00</TipoImpositivo>');
      expect(serialized).toContain('<CalificacionOperacion>E</CalificacionOperacion>');
    });
  });

  describe('buildChainReferenceXml', () => {
    it('should build chain reference', () => {
      const xml = buildChainReferenceXml(
        'abc123hash',
        new Date('2024-01-14'),
        'A',
        '000'
      );
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<Encadenamiento>');
      expect(serialized).toContain('<PrimerRegistro>N</PrimerRegistro>');
      expect(serialized).toContain('<RegistroAnterior>');
      expect(serialized).toContain('<Huella>abc123hash</Huella>');
    });

    it('should work without series', () => {
      const xml = buildChainReferenceXml(
        'abc123hash',
        new Date('2024-01-14'),
        undefined,
        '000'
      );
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<NumFactura>000</NumFactura>');
    });
  });

  describe('buildFirstRecordChainXml', () => {
    it('should build first record indicator', () => {
      const xml = buildFirstRecordChainXml();
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<PrimerRegistro>S</PrimerRegistro>');
    });
  });

  describe('buildAltaRecordXml', () => {
    const createTestInvoice = (): Invoice => ({
      operationType: 'A',
      invoiceType: 'F1',
      id: {
        series: 'A',
        number: '001',
        issueDate: new Date('2024-01-15'),
      },
      issuer: {
        taxId: { type: 'NIF', value: 'B12345678' },
        name: 'Test Company SL',
      },
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

    it('should build alta record XML', () => {
      const invoice = createTestInvoice();
      const softwareInfo = createSoftwareInfo();
      const xml = buildAltaRecordXml(invoice, softwareInfo, 'testhash123', true);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<RegistroFactura>');
      expect(serialized).toContain('<IDFactura>');
      expect(serialized).toContain('<NumSerieFactura>A001</NumSerieFactura>');
      expect(serialized).toContain('<TipoFactura>F1</TipoFactura>');
      expect(serialized).toContain('<CuotaTotal>21.00</CuotaTotal>');
      expect(serialized).toContain('<ImporteTotal>121.00</ImporteTotal>');
      expect(serialized).toContain('<Huella>testhash123</Huella>');
    });

    it('should include recipients if present', () => {
      const invoice = createTestInvoice();
      invoice.recipients = [{
        taxId: { type: 'NIF', value: 'A87654321' },
        name: 'Client SA',
      }];
      const softwareInfo = createSoftwareInfo();

      const xml = buildAltaRecordXml(invoice, softwareInfo, 'hash', true);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<Destinatarios>');
      expect(serialized).toContain('<NIF>A87654321</NIF>');
    });

    it('should include chain reference if present', () => {
      const invoice = createTestInvoice();
      invoice.chainReference = {
        previousHash: 'prevhash',
        previousDate: new Date('2024-01-14'),
        previousSeries: 'A',
        previousNumber: '000',
      };
      const softwareInfo = createSoftwareInfo();

      const xml = buildAltaRecordXml(invoice, softwareInfo, 'hash', false);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<Encadenamiento>');
      expect(serialized).toContain('<RegistroAnterior>');
      expect(serialized).toContain('<Huella>prevhash</Huella>');
    });

    it('should build first record chain if isFirstRecord is true', () => {
      const invoice = createTestInvoice();
      invoice.chainReference = undefined;
      const softwareInfo = createSoftwareInfo();

      const xml = buildAltaRecordXml(invoice, softwareInfo, 'hash', true);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<Encadenamiento>');
      expect(serialized).toContain('<PrimerRegistro>S</PrimerRegistro>');
    });

    it('should handle rectifying invoices', () => {
      const invoice = createTestInvoice();
      invoice.invoiceType = 'F3';
      invoice.rectifiedInvoiceType = 'S';
      invoice.rectifiedInvoices = [{
        issuerTaxId: 'B12345678',
        invoiceId: { number: '000', issueDate: new Date('2024-01-10'), series: 'A' },
      }];
      const softwareInfo = createSoftwareInfo();

      const xml = buildAltaRecordXml(invoice, softwareInfo, 'hash', true);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<TipoRectificativa>S</TipoRectificativa>');
      expect(serialized).toContain('<FacturasRectificadas>');
    });
  });

  describe('buildAltaSoapEnvelope', () => {
    const createTestInvoice = (): Invoice => ({
      operationType: 'A',
      invoiceType: 'F1',
      id: {
        series: 'A',
        number: '001',
        issueDate: new Date('2024-01-15'),
      },
      issuer: {
        taxId: { type: 'NIF', value: 'B12345678' },
        name: 'Test Company SL',
      },
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

    it('should build SOAP envelope', () => {
      const invoice = createTestInvoice();
      const softwareInfo = createSoftwareInfo();
      const xml = buildAltaSoapEnvelope(invoice, softwareInfo, 'testhash123', true);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('soapenv:Envelope');
      expect(xml).toContain('soapenv:Body');
      expect(xml).toContain('RegistroFactura');
    });

    it('should include namespaces', () => {
      const invoice = createTestInvoice();
      const softwareInfo = createSoftwareInfo();
      const xml = buildAltaSoapEnvelope(invoice, softwareInfo, 'hash', true);

      expect(xml).toContain('xmlns:soapenv');
      expect(xml).toContain('xmlns:sum');
    });
  });
});
