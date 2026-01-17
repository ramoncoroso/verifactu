/**
 * Tests for Party Models
 */

import { describe, it, expect } from 'vitest';
import {
  createIssuer,
  createSpanishRecipient,
  createForeignRecipient,
} from '../../src/models/party.js';

describe('Party Models', () => {
  describe('createIssuer', () => {
    it('should create issuer with NIF and name', () => {
      const issuer = createIssuer('B12345674', 'Test Company SL');

      expect(issuer.taxId.type).toBe('NIF');
      expect(issuer.taxId.value).toBe('B12345674');
      expect(issuer.name).toBe('Test Company SL');
      expect(issuer.address).toBeUndefined();
    });

    it('should create issuer with address', () => {
      const issuer = createIssuer('B12345674', 'Test Company SL', {
        street: 'Calle Mayor 1',
        postalCode: '28001',
        city: 'Madrid',
        province: 'Madrid',
      });

      expect(issuer.address).toBeDefined();
      expect(issuer.address?.street).toBe('Calle Mayor 1');
      expect(issuer.address?.postalCode).toBe('28001');
      expect(issuer.address?.city).toBe('Madrid');
      expect(issuer.address?.province).toBe('Madrid');
      expect(issuer.address?.country).toBe('ES');
    });
  });

  describe('createSpanishRecipient', () => {
    it('should create recipient with NIF and name', () => {
      const recipient = createSpanishRecipient('A12345674', 'Client SA');

      expect(recipient.taxId.type).toBe('NIF');
      expect(recipient.taxId.value).toBe('A12345674');
      expect(recipient.name).toBe('Client SA');
      expect(recipient.address).toBeUndefined();
    });

    it('should create recipient with address', () => {
      const recipient = createSpanishRecipient('A12345674', 'Client SA', {
        street: 'Avenida Central 5',
        postalCode: '08001',
        city: 'Barcelona',
        province: 'Barcelona',
      });

      expect(recipient.address).toBeDefined();
      expect(recipient.address?.country).toBe('ES');
      expect(recipient.address?.city).toBe('Barcelona');
    });
  });

  describe('createForeignRecipient', () => {
    it('should create foreign recipient with VAT number', () => {
      const recipient = createForeignRecipient(
        'VAT',
        'FR12345678901',
        'FR',
        'French Company SARL'
      );

      expect(recipient.taxId.type).toBe('VAT');
      expect(recipient.taxId.value).toBe('FR12345678901');
      expect(recipient.taxId.country).toBe('FR');
      expect(recipient.name).toBe('French Company SARL');
      expect(recipient.address).toBeUndefined();
    });

    it('should create foreign recipient with passport', () => {
      const recipient = createForeignRecipient(
        'PASSPORT',
        'AB123456',
        'US',
        'John Doe'
      );

      expect(recipient.taxId.type).toBe('PASSPORT');
      expect(recipient.taxId.value).toBe('AB123456');
      expect(recipient.taxId.country).toBe('US');
    });

    it('should create foreign recipient with address', () => {
      const recipient = createForeignRecipient(
        'VAT',
        'DE123456789',
        'DE',
        'German GmbH',
        {
          street: 'Hauptstraße 1',
          postalCode: '10115',
          city: 'Berlin',
        }
      );

      expect(recipient.address).toBeDefined();
      expect(recipient.address?.country).toBe('DE');
      expect(recipient.address?.city).toBe('Berlin');
    });
  });
});
