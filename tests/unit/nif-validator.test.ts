/**
 * Tests for NIF/CIF/NIE Validator
 */

import { describe, it, expect } from 'vitest';
import {
  validateSpanishTaxId,
  isValidSpanishTaxId,
  normalizeNif,
  assertValidSpanishTaxId,
  getSpanishTaxIdType,
  formatSpanishTaxId,
} from '../../src/validation/nif-validator.js';
import { InvalidNifError } from '../../src/errors/validation-errors.js';

describe('NIF Validator', () => {
  describe('normalizeNif', () => {
    it('should convert to uppercase', () => {
      expect(normalizeNif('12345678z')).toBe('12345678Z');
    });

    it('should remove spaces', () => {
      expect(normalizeNif('1234 5678 Z')).toBe('12345678Z');
    });

    it('should remove hyphens', () => {
      expect(normalizeNif('1234-5678-Z')).toBe('12345678Z');
    });

    it('should remove dots', () => {
      expect(normalizeNif('12.345.678.Z')).toBe('12345678Z');
    });
  });

  describe('validateSpanishTaxId - NIF', () => {
    it('should validate correct NIF', () => {
      // Using a known valid NIF
      const result = validateSpanishTaxId('12345678Z');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('nif');
    });

    it('should reject NIF with invalid control letter', () => {
      const result = validateSpanishTaxId('12345678A');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid control letter');
    });

    it('should reject NIF with invalid length', () => {
      const result = validateSpanishTaxId('1234567Z');
      expect(result.valid).toBe(false);
    });

    it('should validate NIF 00000000T', () => {
      const result = validateSpanishTaxId('00000000T');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('nif');
    });

    it('should validate NIF 00000001R', () => {
      const result = validateSpanishTaxId('00000001R');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateSpanishTaxId - NIE', () => {
    it('should validate correct NIE starting with X', () => {
      // X0000000T (equivalent to 00000000T)
      const result = validateSpanishTaxId('X0000000T');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('nie');
    });

    it('should validate correct NIE starting with Y', () => {
      // Y0000000Z (equivalent to 10000000Z)
      const result = validateSpanishTaxId('Y0000000Z');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('nie');
    });

    it('should validate correct NIE starting with Z', () => {
      // Z0000000M (equivalent to 20000000M)
      const result = validateSpanishTaxId('Z0000000M');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('nie');
    });

    it('should reject NIE with invalid control letter', () => {
      const result = validateSpanishTaxId('X0000000A');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateSpanishTaxId - CIF', () => {
    it('should validate CIF with letter control (K prefix)', () => {
      // K prefix requires letter control - use valid control
      // For K1234567, the control is calculated and should be a letter
      const result = validateSpanishTaxId('P1234567D');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('cif');
    });

    it('should validate CIF with digit control (A prefix)', () => {
      // A prefix requires digit control
      const result = validateSpanishTaxId('A12345674');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('cif');
    });

    it('should validate CIF with B prefix', () => {
      const result = validateSpanishTaxId('B12345674');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('cif');
    });

    it('should reject CIF with invalid prefix', () => {
      const result = validateSpanishTaxId('I1234567J');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid CIF prefix');
    });

    it('should reject CIF with invalid control', () => {
      const result = validateSpanishTaxId('A12345671');
      expect(result.valid).toBe(false);
    });
  });

  describe('isValidSpanishTaxId', () => {
    it('should return true for valid NIF', () => {
      expect(isValidSpanishTaxId('12345678Z')).toBe(true);
    });

    it('should return false for invalid NIF', () => {
      expect(isValidSpanishTaxId('12345678A')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidSpanishTaxId('')).toBe(false);
    });
  });

  describe('assertValidSpanishTaxId', () => {
    it('should return normalized NIF for valid input', () => {
      const result = assertValidSpanishTaxId('12345678z');
      expect(result).toBe('12345678Z');
    });

    it('should throw InvalidNifError for invalid input', () => {
      expect(() => assertValidSpanishTaxId('invalid')).toThrow(InvalidNifError);
    });
  });

  describe('getSpanishTaxIdType', () => {
    it('should return nif for valid NIF', () => {
      expect(getSpanishTaxIdType('12345678Z')).toBe('nif');
    });

    it('should return nie for valid NIE', () => {
      expect(getSpanishTaxIdType('X0000000T')).toBe('nie');
    });

    it('should return cif for valid CIF', () => {
      expect(getSpanishTaxIdType('B12345674')).toBe('cif');
    });

    it('should return null for invalid tax ID', () => {
      expect(getSpanishTaxIdType('invalid')).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle null-ish values', () => {
      expect(validateSpanishTaxId('')).toEqual({ valid: false, error: 'Tax ID is required' });
    });

    it('should normalize before validation', () => {
      const result = validateSpanishTaxId('  12345678z  ');
      expect(result.normalized).toBe('12345678Z');
    });

    it('should reject tax ID starting with special characters', () => {
      const result = validateSpanishTaxId('@12345678');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid tax ID format');
    });

    it('should reject tax ID with non-alphanumeric start after normalization', () => {
      const result = validateSpanishTaxId('#ABCDEFGH');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid tax ID format');
    });
  });

  describe('formatSpanishTaxId', () => {
    it('should normalize and return uppercase tax ID', () => {
      expect(formatSpanishTaxId('12345678z')).toBe('12345678Z');
    });

    it('should remove spaces and hyphens', () => {
      expect(formatSpanishTaxId('1234-5678-Z')).toBe('12345678Z');
    });

    it('should handle already normalized input', () => {
      expect(formatSpanishTaxId('B12345674')).toBe('B12345674');
    });

    it('should handle lowercase CIF', () => {
      expect(formatSpanishTaxId('b12345674')).toBe('B12345674');
    });

    it('should handle NIE with spaces', () => {
      expect(formatSpanishTaxId('X 0000000 T')).toBe('X0000000T');
    });
  });

  describe('CIF letter-only prefixes', () => {
    it('should validate CIF with K prefix (letter control)', () => {
      // K requires letter control - control for 1234567 is D
      const result = validateSpanishTaxId('K1234567D');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('cif');
    });

    it('should validate CIF with L prefix (letter control)', () => {
      const result = validateSpanishTaxId('L1234567D');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('cif');
    });

    it('should validate CIF with M prefix (letter control)', () => {
      const result = validateSpanishTaxId('M1234567D');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('cif');
    });

    it('should reject K prefix with digit control', () => {
      const result = validateSpanishTaxId('K12345674');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid control letter');
    });

    it('should reject K prefix with wrong letter control', () => {
      const result = validateSpanishTaxId('K1234567A');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid control letter');
    });
  });

  describe('CIF digit-only prefixes', () => {
    it('should reject A prefix with letter control', () => {
      const result = validateSpanishTaxId('A1234567D');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid control digit');
    });

    it('should reject B prefix with wrong digit control', () => {
      const result = validateSpanishTaxId('B12345671');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid control digit');
    });
  });

  describe('CIF either prefix', () => {
    it('should validate P prefix with letter control', () => {
      // P can use either - control for 1234567 is D or 4
      const result = validateSpanishTaxId('P1234567D');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('cif');
    });

    it('should validate P prefix with digit control', () => {
      const result = validateSpanishTaxId('P12345674');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('cif');
    });

    it('should reject P prefix with wrong control', () => {
      const result = validateSpanishTaxId('P1234567A');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expected');
    });

    it('should validate Q prefix with letter control', () => {
      const result = validateSpanishTaxId('Q1234567D');
      expect(result.valid).toBe(true);
    });

    it('should validate S prefix with letter control', () => {
      const result = validateSpanishTaxId('S1234567D');
      expect(result.valid).toBe(true);
    });
  });

  describe('NIE edge cases', () => {
    it('should reject NIE with wrong format (too many digits)', () => {
      const result = validateSpanishTaxId('X12345678');
      expect(result.valid).toBe(false);
    });

    it('should reject NIE with invalid control letter', () => {
      const result = validateSpanishTaxId('Y0000000A');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid control letter');
    });
  });

  describe('NIF edge cases', () => {
    it('should reject NIF ending with digit instead of letter', () => {
      const result = validateSpanishTaxId('123456789');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('8 digits followed by a letter');
    });
  });
});
