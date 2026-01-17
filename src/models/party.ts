/**
 * Party models for Verifactu (Issuer/Recipient)
 */

import type { CountryCode, TaxIdType } from './enums.js';

/**
 * Tax identification number
 */
export interface TaxId {
  /** Type of tax ID */
  readonly type: TaxIdType;
  /** Tax ID value (NIF, passport, etc.) */
  readonly value: string;
  /** Country code (required for non-Spanish entities) */
  readonly country?: CountryCode;
}

/**
 * Spanish NIF (Número de Identificación Fiscal)
 */
export interface SpanishTaxId extends TaxId {
  readonly type: 'NIF';
  readonly country?: 'ES';
}

/**
 * Foreign tax ID
 */
export interface ForeignTaxId extends TaxId {
  readonly type: Exclude<TaxIdType, 'NIF'>;
  readonly country: Exclude<CountryCode, 'ES'>;
}

/**
 * Address information
 */
export interface Address {
  /** Street address */
  readonly street?: string;
  /** Postal code */
  readonly postalCode?: string;
  /** City */
  readonly city?: string;
  /** Province */
  readonly province?: string;
  /** Country code */
  readonly country: CountryCode;
}

/**
 * Spanish address
 */
export interface SpanishAddress extends Address {
  readonly country: 'ES';
  readonly postalCode: string;
  readonly city: string;
  readonly province: string;
}

/**
 * Party base interface (issuer or recipient)
 */
export interface Party {
  /** Tax identification */
  readonly taxId: TaxId;
  /** Legal name */
  readonly name: string;
  /** Address (optional) */
  readonly address?: Address;
}

/**
 * Invoice issuer (Emisor)
 */
export interface Issuer extends Party {
  /** Tax identification (required for issuer) */
  readonly taxId: SpanishTaxId;
  /** Legal name */
  readonly name: string;
  /** Address (optional for issuer) */
  readonly address?: SpanishAddress;
}

/**
 * Invoice recipient (Destinatario)
 */
export interface Recipient extends Party {
  /** Tax identification */
  readonly taxId: TaxId;
  /** Legal name */
  readonly name: string;
  /** Address */
  readonly address?: Address;
}

/**
 * Third party acting on behalf of the issuer
 */
export interface Representative {
  /** Tax identification */
  readonly taxId: TaxId;
  /** Legal name */
  readonly name: string;
}

/**
 * Software information for the system generating invoices
 */
export interface SoftwareInfo {
  /** Software name */
  readonly name: string;
  /** Software developer NIF */
  readonly developerTaxId: string;
  /** Software version */
  readonly version: string;
  /** Installation number (unique per installation) */
  readonly installationNumber: string;
  /** System type indicator */
  readonly systemType: 'V' | 'N';
}

/**
 * Create a Spanish issuer
 */
export function createIssuer(
  nif: string,
  name: string,
  address?: Omit<SpanishAddress, 'country'>
): Issuer {
  return {
    taxId: { type: 'NIF', value: nif },
    name,
    address: address ? { ...address, country: 'ES' } : undefined,
  };
}

/**
 * Create a recipient with Spanish NIF
 */
export function createSpanishRecipient(
  nif: string,
  name: string,
  address?: Omit<SpanishAddress, 'country'>
): Recipient {
  return {
    taxId: { type: 'NIF', value: nif },
    name,
    address: address ? { ...address, country: 'ES' } : undefined,
  };
}

/**
 * Create a foreign recipient
 */
export function createForeignRecipient(
  idType: Exclude<TaxIdType, 'NIF'>,
  idValue: string,
  country: Exclude<CountryCode, 'ES'>,
  name: string,
  address?: Omit<Address, 'country'>
): Recipient {
  return {
    taxId: { type: idType, value: idValue, country },
    name,
    address: address ? { ...address, country } : undefined,
  };
}
