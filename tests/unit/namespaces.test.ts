/**
 * Tests for XML Namespaces
 */

import { describe, it, expect } from 'vitest';
import {
  Namespaces,
  NsPrefix,
  buildNamespaceDeclarations,
  SOAP_NS_DECLARATIONS,
  VERIFACTU_NS_DECLARATIONS,
} from '../../src/xml/templates/namespaces.js';

describe('XML Namespaces', () => {
  describe('Namespaces', () => {
    it('should have SOAP envelope namespace', () => {
      expect(Namespaces.SOAP_ENV).toBe('http://schemas.xmlsoap.org/soap/envelope/');
    });

    it('should have SOAP encoding namespace', () => {
      expect(Namespaces.SOAP_ENC).toBe('http://schemas.xmlsoap.org/soap/encoding/');
    });

    it('should have XSD namespace', () => {
      expect(Namespaces.XSD).toBe('http://www.w3.org/2001/XMLSchema');
    });

    it('should have XSI namespace', () => {
      expect(Namespaces.XSI).toBe('http://www.w3.org/2001/XMLSchema-instance');
    });

    it('should have SUM (Verifactu) namespace', () => {
      expect(Namespaces.SUM).toContain('agenciatributaria.gob.es');
    });

    it('should have SUM_INFO namespace', () => {
      expect(Namespaces.SUM_INFO).toContain('agenciatributaria.gob.es');
    });

    it('should have DS (digital signature) namespace', () => {
      expect(Namespaces.DS).toBe('http://www.w3.org/2000/09/xmldsig#');
    });
  });

  describe('NsPrefix', () => {
    it('should have SOAP_ENV prefix', () => {
      expect(NsPrefix.SOAP_ENV).toBe('soapenv');
    });

    it('should have SOAP_ENC prefix', () => {
      expect(NsPrefix.SOAP_ENC).toBe('soapenc');
    });

    it('should have XSD prefix', () => {
      expect(NsPrefix.XSD).toBe('xsd');
    });

    it('should have XSI prefix', () => {
      expect(NsPrefix.XSI).toBe('xsi');
    });

    it('should have SUM prefix', () => {
      expect(NsPrefix.SUM).toBe('sum');
    });

    it('should have SUM_INFO prefix', () => {
      expect(NsPrefix.SUM_INFO).toBe('sumi');
    });

    it('should have DS prefix', () => {
      expect(NsPrefix.DS).toBe('ds');
    });
  });

  describe('buildNamespaceDeclarations', () => {
    it('should build namespace declarations for single prefix', () => {
      const declarations = buildNamespaceDeclarations(['SOAP_ENV']);

      expect(declarations['xmlns:soapenv']).toBe(Namespaces.SOAP_ENV);
    });

    it('should build namespace declarations for multiple prefixes', () => {
      const declarations = buildNamespaceDeclarations(['SOAP_ENV', 'XSD', 'XSI']);

      expect(declarations['xmlns:soapenv']).toBe(Namespaces.SOAP_ENV);
      expect(declarations['xmlns:xsd']).toBe(Namespaces.XSD);
      expect(declarations['xmlns:xsi']).toBe(Namespaces.XSI);
    });

    it('should build Verifactu-specific declarations', () => {
      const declarations = buildNamespaceDeclarations(['SUM', 'SUM_INFO']);

      expect(declarations['xmlns:sum']).toBe(Namespaces.SUM);
      expect(declarations['xmlns:sumi']).toBe(Namespaces.SUM_INFO);
    });

    it('should build digital signature declarations', () => {
      const declarations = buildNamespaceDeclarations(['DS']);

      expect(declarations['xmlns:ds']).toBe(Namespaces.DS);
    });

    it('should return empty object for empty array', () => {
      const declarations = buildNamespaceDeclarations([]);

      expect(Object.keys(declarations)).toHaveLength(0);
    });
  });

  describe('Pre-built declarations', () => {
    it('should have SOAP namespace declarations', () => {
      expect(SOAP_NS_DECLARATIONS['xmlns:soapenv']).toBe(Namespaces.SOAP_ENV);
      expect(SOAP_NS_DECLARATIONS['xmlns:xsd']).toBe(Namespaces.XSD);
      expect(SOAP_NS_DECLARATIONS['xmlns:xsi']).toBe(Namespaces.XSI);
    });

    it('should have Verifactu namespace declarations', () => {
      expect(VERIFACTU_NS_DECLARATIONS['xmlns:sum']).toBe(Namespaces.SUM);
      expect(VERIFACTU_NS_DECLARATIONS['xmlns:sumi']).toBe(Namespaces.SUM_INFO);
    });
  });
});
