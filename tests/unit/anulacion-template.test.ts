/**
 * Tests for Anulación (Invoice Cancellation) XML Template
 */

import { describe, it, expect } from 'vitest';
import {
  buildAnulacionRecordXml,
  buildAnulacionSoapEnvelope,
} from '../../src/xml/templates/anulacion.js';
import type { InvoiceCancellation } from '../../src/models/invoice.js';
import type { SoftwareInfo } from '../../src/models/party.js';
import { serializeElement } from '../../src/xml/builder.js';

describe('Anulación XML Template', () => {
  const createTestCancellation = (): InvoiceCancellation => ({
    operationType: 'AN',
    invoiceId: {
      series: 'A',
      number: '001',
      issueDate: new Date('2024-01-15'),
    },
    issuer: {
      taxId: { type: 'NIF', value: 'B12345678' },
      name: 'Test Company SL',
    },
  });

  const createSoftwareInfo = (): SoftwareInfo => ({
    name: 'TestApp',
    developerTaxId: 'B99999999',
    version: '1.0.0',
    installationNumber: '001',
    systemType: 'S',
  });

  describe('buildAnulacionRecordXml', () => {
    it('should build cancellation record XML', () => {
      const cancellation = createTestCancellation();
      const softwareInfo = createSoftwareInfo();

      const xml = buildAnulacionRecordXml(cancellation, softwareInfo, 'testhash123', true);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<RegistroAnulacion>');
      expect(serialized).toContain('<IDFactura>');
      expect(serialized).toContain('<NumSerieFactura>A001</NumSerieFactura>');
      expect(serialized).toContain('<Huella>testhash123</Huella>');
    });

    it('should include first record marker', () => {
      const cancellation = createTestCancellation();
      const softwareInfo = createSoftwareInfo();

      const xml = buildAnulacionRecordXml(cancellation, softwareInfo, 'hash', true);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<PrimerRegistro>S</PrimerRegistro>');
    });

    it('should include chain reference when not first record', () => {
      const cancellation = createTestCancellation();
      cancellation.chainReference = {
        previousHash: 'prevhash',
        previousDate: new Date('2024-01-14'),
        previousSeries: 'A',
        previousNumber: '000',
      };
      const softwareInfo = createSoftwareInfo();

      const xml = buildAnulacionRecordXml(cancellation, softwareInfo, 'hash', false);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<Encadenamiento>');
      expect(serialized).toContain('<RegistroAnterior>');
      expect(serialized).toContain('<Huella>prevhash</Huella>');
    });

    it('should handle invoice without series', () => {
      const cancellation = createTestCancellation();
      cancellation.invoiceId.series = undefined;
      const softwareInfo = createSoftwareInfo();

      const xml = buildAnulacionRecordXml(cancellation, softwareInfo, 'hash', true);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<NumSerieFactura>001</NumSerieFactura>');
    });

    it('should include software info', () => {
      const cancellation = createTestCancellation();
      const softwareInfo = createSoftwareInfo();

      const xml = buildAnulacionRecordXml(cancellation, softwareInfo, 'hash', true);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<SistemaInformatico>');
      expect(serialized).toContain('<NombreRazon>TestApp</NombreRazon>');
    });

    it('should include generation timestamp', () => {
      const cancellation = createTestCancellation();
      const softwareInfo = createSoftwareInfo();

      const xml = buildAnulacionRecordXml(cancellation, softwareInfo, 'hash', true);
      const serialized = serializeElement(xml);

      expect(serialized).toContain('<FechaHoraHusoGenRegistro>');
    });
  });

  describe('buildAnulacionSoapEnvelope', () => {
    it('should build SOAP envelope', () => {
      const cancellation = createTestCancellation();
      const softwareInfo = createSoftwareInfo();

      const xml = buildAnulacionSoapEnvelope(cancellation, softwareInfo, 'testhash123', true);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('soapenv:Envelope');
      expect(xml).toContain('soapenv:Body');
      expect(xml).toContain('BajaLRFacturasEmitidas');
    });

    it('should include issuer info in header', () => {
      const cancellation = createTestCancellation();
      const softwareInfo = createSoftwareInfo();

      const xml = buildAnulacionSoapEnvelope(cancellation, softwareInfo, 'hash', true);

      expect(xml).toContain('<sum:NombreRazon>Test Company SL</sum:NombreRazon>');
      expect(xml).toContain('<sum:NIF>B12345678</sum:NIF>');
    });

    it('should include namespaces', () => {
      const cancellation = createTestCancellation();
      const softwareInfo = createSoftwareInfo();

      const xml = buildAnulacionSoapEnvelope(cancellation, softwareInfo, 'hash', true);

      expect(xml).toContain('xmlns:soapenv');
      expect(xml).toContain('xmlns:sum');
    });

    it('should include cancellation record', () => {
      const cancellation = createTestCancellation();
      const softwareInfo = createSoftwareInfo();

      const xml = buildAnulacionSoapEnvelope(cancellation, softwareInfo, 'testhash123', true);

      expect(xml).toContain('<RegistroAnulacion>');
      expect(xml).toContain('<Huella>testhash123</Huella>');
    });
  });
});
