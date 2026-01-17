/**
 * Certificate Management for Verifactu
 *
 * Handles loading and managing X.509 certificates for SOAP authentication.
 * Supports PFX/P12 and PEM formats.
 */

import { readFileSync } from 'node:fs';
import { createSecureContext, type SecureContextOptions } from 'node:tls';
import {
  CertificateError,
  CertificateNotFoundError,
} from '../errors/crypto-errors.js';

/**
 * Certificate types supported
 */
export type CertificateFormat = 'pfx' | 'pem';

/**
 * PFX certificate configuration
 */
export interface PfxCertificateConfig {
  type: 'pfx';
  /** Path to the PFX/P12 file */
  path: string;
  /** Password for the PFX file */
  password: string;
}

/**
 * PEM certificate configuration
 */
export interface PemCertificateConfig {
  type: 'pem';
  /** Path to the certificate file (.crt or .pem) */
  certPath: string;
  /** Path to the private key file (.key or .pem) */
  keyPath: string;
  /** Password for the private key (if encrypted) */
  keyPassword?: string;
  /** Path to CA certificate chain (optional) */
  caPath?: string;
}

/**
 * Certificate configuration
 */
export type CertificateConfig = PfxCertificateConfig | PemCertificateConfig;

/**
 * Loaded certificate data
 */
export interface LoadedCertificate {
  /** Certificate format */
  format: CertificateFormat;
  /** PFX buffer (for PFX format) */
  pfx?: Buffer;
  /** Certificate buffer (for PEM format) */
  cert?: Buffer;
  /** Private key buffer (for PEM format) */
  key?: Buffer;
  /** CA chain buffer (for PEM format) */
  ca?: Buffer;
  /** Password/passphrase */
  passphrase?: string;
}

/**
 * TLS options for HTTPS requests
 */
export interface TlsOptions {
  pfx?: Buffer;
  cert?: Buffer;
  key?: Buffer;
  ca?: Buffer;
  passphrase?: string;
  rejectUnauthorized?: boolean;
}

/**
 * Load a certificate from configuration
 */
export function loadCertificate(config: CertificateConfig): LoadedCertificate {
  if (config.type === 'pfx') {
    return loadPfxCertificate(config);
  } else {
    return loadPemCertificate(config);
  }
}

/**
 * Load a PFX/P12 certificate
 */
function loadPfxCertificate(config: PfxCertificateConfig): LoadedCertificate {
  try {
    const pfx = readFileSync(config.path);
    return {
      format: 'pfx',
      pfx,
      passphrase: config.password,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CertificateNotFoundError(config.path);
    }
    throw new CertificateError(
      `Failed to load PFX certificate: ${(error as Error).message}`
    );
  }
}

/**
 * Load a PEM certificate
 */
function loadPemCertificate(config: PemCertificateConfig): LoadedCertificate {
  try {
    const cert = readFileSync(config.certPath);
    const key = readFileSync(config.keyPath);
    const ca = config.caPath ? readFileSync(config.caPath) : undefined;

    return {
      format: 'pem',
      cert,
      key,
      ca,
      passphrase: config.keyPassword,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const missingPath = (error as NodeJS.ErrnoException).path ?? 'unknown';
      throw new CertificateNotFoundError(missingPath);
    }
    throw new CertificateError(
      `Failed to load PEM certificate: ${(error as Error).message}`
    );
  }
}

/**
 * Convert loaded certificate to TLS options for HTTPS requests
 */
export function toTlsOptions(
  certificate: LoadedCertificate,
  rejectUnauthorized: boolean = true
): TlsOptions {
  if (certificate.format === 'pfx') {
    return {
      pfx: certificate.pfx,
      passphrase: certificate.passphrase,
      rejectUnauthorized,
    };
  } else {
    return {
      cert: certificate.cert,
      key: certificate.key,
      ca: certificate.ca,
      passphrase: certificate.passphrase,
      rejectUnauthorized,
    };
  }
}

/**
 * Validate that a certificate can be loaded and used
 */
export function validateCertificate(config: CertificateConfig): void {
  const loaded = loadCertificate(config);

  // Try to create a secure context to validate the certificate
  try {
    const options: SecureContextOptions = {};

    if (loaded.format === 'pfx') {
      options.pfx = loaded.pfx;
      options.passphrase = loaded.passphrase;
    } else {
      options.cert = loaded.cert;
      options.key = loaded.key;
      if (loaded.ca) {
        options.ca = loaded.ca;
      }
      if (loaded.passphrase) {
        options.passphrase = loaded.passphrase;
      }
    }

    createSecureContext(options);
  } catch (error) {
    throw new CertificateError(
      `Invalid certificate: ${(error as Error).message}`
    );
  }
}

/**
 * Certificate manager for handling certificate lifecycle
 */
export class CertificateManager {
  private config: CertificateConfig;
  private loaded: LoadedCertificate | null = null;

  constructor(config: CertificateConfig) {
    this.config = config;
  }

  /**
   * Load the certificate (lazy loading)
   */
  load(): LoadedCertificate {
    if (!this.loaded) {
      this.loaded = loadCertificate(this.config);
    }
    return this.loaded;
  }

  /**
   * Get TLS options for HTTPS requests
   */
  getTlsOptions(rejectUnauthorized: boolean = true): TlsOptions {
    return toTlsOptions(this.load(), rejectUnauthorized);
  }

  /**
   * Validate the certificate
   */
  validate(): void {
    validateCertificate(this.config);
  }

  /**
   * Reload the certificate (e.g., after renewal)
   */
  reload(): LoadedCertificate {
    this.loaded = null;
    return this.load();
  }

  /**
   * Get the certificate format
   */
  getFormat(): CertificateFormat {
    return this.config.type;
  }
}

/**
 * Create a certificate manager from configuration
 */
export function createCertificateManager(config: CertificateConfig): CertificateManager {
  return new CertificateManager(config);
}
