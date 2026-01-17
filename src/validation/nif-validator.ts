/**
 * Spanish NIF/CIF/NIE Validator
 *
 * Validates Spanish tax identification numbers:
 * - NIF: Número de Identificación Fiscal (individuals)
 * - CIF: Código de Identificación Fiscal (companies)
 * - NIE: Número de Identidad de Extranjero (foreigners)
 */

import { InvalidNifError } from '../errors/validation-errors.js';

/**
 * NIF validation result
 */
export interface NifValidationResult {
  /** Whether the NIF is valid */
  valid: boolean;
  /** Type of NIF (nif, cif, nie) */
  type?: 'nif' | 'cif' | 'nie';
  /** Normalized NIF (uppercase, no spaces) */
  normalized?: string;
  /** Error message if invalid */
  error?: string;
}

/**
 * NIF control letter table
 */
const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/**
 * CIF control characters for entities that use letters
 */
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';

/**
 * CIF entity type prefixes
 * - Letter-ending: K, L, M (for entities that must use letter control)
 * - Digit-ending: A, B, C, D, E, F, G, H (for entities that may use digit control)
 * - Either: P, Q, R, S, N, W (can use either)
 */
const CIF_LETTER_ONLY_PREFIXES = ['K', 'L', 'M'];
const CIF_DIGIT_ONLY_PREFIXES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const CIF_VALID_PREFIXES = [...CIF_LETTER_ONLY_PREFIXES, ...CIF_DIGIT_ONLY_PREFIXES, 'P', 'Q', 'R', 'S', 'N', 'W', 'J', 'U', 'V'];

/**
 * Normalize a NIF string (uppercase, remove spaces and hyphens)
 */
export function normalizeNif(nif: string): string {
  return nif.toUpperCase().replace(/[\s\-\.]/g, '');
}

/**
 * Validate a Spanish NIF (8 digits + 1 letter)
 */
function validateNif(normalized: string): NifValidationResult {
  // NIF format: 8 digits + 1 letter
  const match = /^(\d{8})([A-Z])$/.exec(normalized);
  if (!match) {
    return { valid: false, error: 'NIF must be 8 digits followed by a letter' };
  }

  const digits = match[1];
  const letter = match[2];

  if (digits === undefined || letter === undefined) {
    return { valid: false, error: 'Invalid NIF format' };
  }

  // Calculate expected control letter
  const remainder = parseInt(digits, 10) % 23;
  const expectedLetter = NIF_LETTERS[remainder];

  if (letter !== expectedLetter) {
    return { valid: false, error: `Invalid control letter: expected ${expectedLetter ?? 'unknown'}` };
  }

  return { valid: true, type: 'nif', normalized };
}

/**
 * Validate a Spanish NIE (X/Y/Z + 7 digits + 1 letter)
 */
function validateNie(normalized: string): NifValidationResult {
  // NIE format: X/Y/Z + 7 digits + 1 letter
  const match = /^([XYZ])(\d{7})([A-Z])$/.exec(normalized);
  if (!match) {
    return { valid: false, error: 'NIE must start with X/Y/Z followed by 7 digits and a letter' };
  }

  const prefix = match[1];
  const digits = match[2];
  const letter = match[3];

  if (prefix === undefined || digits === undefined || letter === undefined) {
    return { valid: false, error: 'Invalid NIE format' };
  }

  // Convert NIE to equivalent NIF for validation
  // X -> 0, Y -> 1, Z -> 2
  const prefixMap: Record<string, string> = { X: '0', Y: '1', Z: '2' };
  const prefixDigit = prefixMap[prefix];

  if (prefixDigit === undefined) {
    return { valid: false, error: 'Invalid NIE prefix' };
  }

  const numericValue = parseInt(prefixDigit + digits, 10);
  const remainder = numericValue % 23;
  const expectedLetter = NIF_LETTERS[remainder];

  if (letter !== expectedLetter) {
    return { valid: false, error: `Invalid control letter: expected ${expectedLetter ?? 'unknown'}` };
  }

  return { valid: true, type: 'nie', normalized };
}

/**
 * Calculate CIF control digit/letter
 */
function calculateCifControl(prefix: string, digits: string): { digit: number; letter: string } {
  // CIF algorithm: sum of even positions + sum of (double odd positions, if >9 sum digits)
  let sumA = 0; // Sum of digits in even positions (2, 4, 6)
  let sumB = 0; // Sum of doubled digits in odd positions (1, 3, 5, 7)

  for (let i = 0; i < 7; i++) {
    const digit = parseInt(digits[i] ?? '0', 10);
    if (i % 2 === 0) {
      // Odd position (1, 3, 5, 7) - double and sum digits
      const doubled = digit * 2;
      sumB += doubled > 9 ? Math.floor(doubled / 10) + (doubled % 10) : doubled;
    } else {
      // Even position (2, 4, 6)
      sumA += digit;
    }
  }

  const total = sumA + sumB;
  const controlDigit = (10 - (total % 10)) % 10;
  const controlLetter = CIF_CONTROL_LETTERS[controlDigit] ?? 'J';

  return { digit: controlDigit, letter: controlLetter };
}

/**
 * Validate a Spanish CIF (1 letter + 7 digits + 1 control char)
 */
function validateCif(normalized: string): NifValidationResult {
  // CIF format: 1 letter + 7 digits + 1 control character (letter or digit)
  const match = /^([A-Z])(\d{7})([A-Z0-9])$/.exec(normalized);
  if (!match) {
    return { valid: false, error: 'CIF must be 1 letter + 7 digits + 1 control character' };
  }

  const prefix = match[1];
  const digits = match[2];
  const control = match[3];

  if (prefix === undefined || digits === undefined || control === undefined) {
    return { valid: false, error: 'Invalid CIF format' };
  }

  // Check if prefix is valid
  if (!CIF_VALID_PREFIXES.includes(prefix)) {
    return { valid: false, error: `Invalid CIF prefix: ${prefix}` };
  }

  // Calculate expected control
  const { digit: expectedDigit, letter: expectedLetter } = calculateCifControl(prefix, digits);

  // Determine if control should be letter or digit
  const isDigit = /^\d$/.test(control);
  const isLetter = /^[A-Z]$/.test(control);

  // Entities that must use letter
  if (CIF_LETTER_ONLY_PREFIXES.includes(prefix)) {
    if (!isLetter || control !== expectedLetter) {
      return { valid: false, error: `Invalid control letter: expected ${expectedLetter}` };
    }
    return { valid: true, type: 'cif', normalized };
  }

  // Entities that must use digit
  if (CIF_DIGIT_ONLY_PREFIXES.includes(prefix)) {
    if (!isDigit || parseInt(control, 10) !== expectedDigit) {
      return { valid: false, error: `Invalid control digit: expected ${expectedDigit}` };
    }
    return { valid: true, type: 'cif', normalized };
  }

  // Entities that can use either
  if (isDigit && parseInt(control, 10) === expectedDigit) {
    return { valid: true, type: 'cif', normalized };
  }
  if (isLetter && control === expectedLetter) {
    return { valid: true, type: 'cif', normalized };
  }

  return {
    valid: false,
    error: `Invalid control character: expected ${expectedDigit} or ${expectedLetter}`,
  };
}

/**
 * Validate any Spanish tax ID (NIF, CIF, or NIE)
 */
export function validateSpanishTaxId(taxId: string): NifValidationResult {
  if (!taxId || typeof taxId !== 'string') {
    return { valid: false, error: 'Tax ID is required' };
  }

  const normalized = normalizeNif(taxId);

  if (normalized.length !== 9) {
    return { valid: false, error: 'Tax ID must be 9 characters' };
  }

  // Determine type based on first character
  const firstChar = normalized[0];

  if (firstChar === undefined) {
    return { valid: false, error: 'Empty tax ID' };
  }

  // NIE: starts with X, Y, or Z
  if (/^[XYZ]/.test(normalized)) {
    return validateNie(normalized);
  }

  // CIF: starts with a letter (but not X, Y, Z)
  if (/^[A-Z]/.test(firstChar)) {
    return validateCif(normalized);
  }

  // NIF: starts with a digit
  if (/^\d/.test(firstChar)) {
    return validateNif(normalized);
  }

  return { valid: false, error: 'Invalid tax ID format' };
}

/**
 * Check if a tax ID is valid (convenience function)
 */
export function isValidSpanishTaxId(taxId: string): boolean {
  return validateSpanishTaxId(taxId).valid;
}

/**
 * Validate and throw if invalid
 */
export function assertValidSpanishTaxId(taxId: string): string {
  const result = validateSpanishTaxId(taxId);
  if (!result.valid) {
    throw new InvalidNifError(taxId, result.error);
  }
  return result.normalized ?? normalizeNif(taxId);
}

/**
 * Get the type of a valid Spanish tax ID
 */
export function getSpanishTaxIdType(taxId: string): 'nif' | 'cif' | 'nie' | null {
  const result = validateSpanishTaxId(taxId);
  return result.valid ? (result.type ?? null) : null;
}

/**
 * Format a tax ID with standard spacing (optional)
 */
export function formatSpanishTaxId(taxId: string): string {
  const normalized = normalizeNif(taxId);
  // Return normalized uppercase format
  return normalized;
}
