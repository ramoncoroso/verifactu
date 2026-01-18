/**
 * Tests for Certificate Management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as tls from 'node:tls';
import {
  loadCertificate,
  toTlsOptions,
  validateCertificate,
  CertificateManager,
  createCertificateManager,
  type PfxCertificateConfig,
  type PfxCertificateBufferConfig,
  type PemCertificateConfig,
  type PemCertificateBufferConfig,
  type LoadedCertificate,
} from '../../src/crypto/certificate.js';
import {
  CertificateError,
  CertificateNotFoundError,
} from '../../src/errors/crypto-errors.js';

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

// Mock tls module
vi.mock('node:tls', () => ({
  createSecureContext: vi.fn(),
}));

describe('Certificate', () => {
  const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
  const mockCreateSecureContext = tls.createSecureContext as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('loadCertificate', () => {
    describe('PFX certificate', () => {
      it('should load PFX certificate successfully', () => {
        const pfxBuffer = Buffer.from('mock-pfx-data');
        mockReadFileSync.mockReturnValue(pfxBuffer);

        const config: PfxCertificateConfig = {
          type: 'pfx',
          path: '/path/to/cert.pfx',
          password: 'test-password',
        };

        const result = loadCertificate(config);

        expect(result.format).toBe('pfx');
        expect(result.pfx).toEqual(pfxBuffer);
        expect(result.passphrase).toBe('test-password');
        expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/cert.pfx');
      });

      it('should throw CertificateNotFoundError when PFX file not found', () => {
        const error = new Error('ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        mockReadFileSync.mockImplementation(() => {
          throw error;
        });

        const config: PfxCertificateConfig = {
          type: 'pfx',
          path: '/path/to/missing.pfx',
          password: 'password',
        };

        expect(() => loadCertificate(config)).toThrow(CertificateNotFoundError);
      });

      it('should throw CertificateError on other read errors', () => {
        mockReadFileSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });

        const config: PfxCertificateConfig = {
          type: 'pfx',
          path: '/path/to/cert.pfx',
          password: 'password',
        };

        expect(() => loadCertificate(config)).toThrow(CertificateError);
        expect(() => loadCertificate(config)).toThrow(/Failed to load PFX certificate/);
      });
    });

    describe('PEM certificate', () => {
      it('should load PEM certificate without CA successfully', () => {
        const certBuffer = Buffer.from('mock-cert-data');
        const keyBuffer = Buffer.from('mock-key-data');
        mockReadFileSync
          .mockReturnValueOnce(certBuffer)
          .mockReturnValueOnce(keyBuffer);

        const config: PemCertificateConfig = {
          type: 'pem',
          certPath: '/path/to/cert.pem',
          keyPath: '/path/to/key.pem',
        };

        const result = loadCertificate(config);

        expect(result.format).toBe('pem');
        expect(result.cert).toEqual(certBuffer);
        expect(result.key).toEqual(keyBuffer);
        expect(result.ca).toBeUndefined();
        expect(result.passphrase).toBeUndefined();
      });

      it('should load PEM certificate with CA successfully', () => {
        const certBuffer = Buffer.from('mock-cert-data');
        const keyBuffer = Buffer.from('mock-key-data');
        const caBuffer = Buffer.from('mock-ca-data');
        mockReadFileSync
          .mockReturnValueOnce(certBuffer)
          .mockReturnValueOnce(keyBuffer)
          .mockReturnValueOnce(caBuffer);

        const config: PemCertificateConfig = {
          type: 'pem',
          certPath: '/path/to/cert.pem',
          keyPath: '/path/to/key.pem',
          caPath: '/path/to/ca.pem',
        };

        const result = loadCertificate(config);

        expect(result.format).toBe('pem');
        expect(result.cert).toEqual(certBuffer);
        expect(result.key).toEqual(keyBuffer);
        expect(result.ca).toEqual(caBuffer);
      });

      it('should load PEM certificate with key password', () => {
        const certBuffer = Buffer.from('mock-cert-data');
        const keyBuffer = Buffer.from('mock-key-data');
        mockReadFileSync
          .mockReturnValueOnce(certBuffer)
          .mockReturnValueOnce(keyBuffer);

        const config: PemCertificateConfig = {
          type: 'pem',
          certPath: '/path/to/cert.pem',
          keyPath: '/path/to/key.pem',
          keyPassword: 'key-password',
        };

        const result = loadCertificate(config);

        expect(result.passphrase).toBe('key-password');
      });

      it('should throw CertificateNotFoundError when PEM file not found', () => {
        const error = new Error('ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        error.path = '/path/to/cert.pem';
        mockReadFileSync.mockImplementation(() => {
          throw error;
        });

        const config: PemCertificateConfig = {
          type: 'pem',
          certPath: '/path/to/cert.pem',
          keyPath: '/path/to/key.pem',
        };

        expect(() => loadCertificate(config)).toThrow(CertificateNotFoundError);
      });

      it('should throw CertificateNotFoundError when key file not found', () => {
        const certBuffer = Buffer.from('mock-cert-data');
        mockReadFileSync.mockReturnValueOnce(certBuffer);

        const error = new Error('ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        error.path = '/path/to/key.pem';
        mockReadFileSync.mockImplementationOnce(() => {
          throw error;
        });

        const config: PemCertificateConfig = {
          type: 'pem',
          certPath: '/path/to/cert.pem',
          keyPath: '/path/to/key.pem',
        };

        expect(() => loadCertificate(config)).toThrow(CertificateNotFoundError);
      });

      it('should throw CertificateError on other PEM read errors', () => {
        mockReadFileSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });

        const config: PemCertificateConfig = {
          type: 'pem',
          certPath: '/path/to/cert.pem',
          keyPath: '/path/to/key.pem',
        };

        expect(() => loadCertificate(config)).toThrow(CertificateError);
        expect(() => loadCertificate(config)).toThrow(/Failed to load PEM certificate/);
      });

      it('should handle ENOENT without path property', () => {
        const error = new Error('ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        // No path property set
        mockReadFileSync.mockImplementation(() => {
          throw error;
        });

        const config: PemCertificateConfig = {
          type: 'pem',
          certPath: '/path/to/cert.pem',
          keyPath: '/path/to/key.pem',
        };

        expect(() => loadCertificate(config)).toThrow(CertificateNotFoundError);
      });
    });

    describe('PFX Buffer certificate (in-memory)', () => {
      it('should load PFX from Buffer without file access', () => {
        const pfxBuffer = Buffer.from('mock-pfx-data');

        const config: PfxCertificateBufferConfig = {
          type: 'pfx',
          data: pfxBuffer,
          password: 'test-password',
        };

        const result = loadCertificate(config);

        expect(result.format).toBe('pfx');
        expect(result.pfx).toBe(pfxBuffer);
        expect(result.passphrase).toBe('test-password');
        // Should not call readFileSync for buffer configs
        expect(mockReadFileSync).not.toHaveBeenCalled();
      });
    });

    describe('PEM Buffer certificate (in-memory)', () => {
      it('should load PEM from Buffers without file access', () => {
        const certBuffer = Buffer.from('mock-cert-data');
        const keyBuffer = Buffer.from('mock-key-data');

        const config: PemCertificateBufferConfig = {
          type: 'pem',
          certData: certBuffer,
          keyData: keyBuffer,
        };

        const result = loadCertificate(config);

        expect(result.format).toBe('pem');
        expect(result.cert).toBe(certBuffer);
        expect(result.key).toBe(keyBuffer);
        expect(result.ca).toBeUndefined();
        expect(result.passphrase).toBeUndefined();
        // Should not call readFileSync for buffer configs
        expect(mockReadFileSync).not.toHaveBeenCalled();
      });

      it('should load PEM from Buffers with CA and password', () => {
        const certBuffer = Buffer.from('mock-cert-data');
        const keyBuffer = Buffer.from('mock-key-data');
        const caBuffer = Buffer.from('mock-ca-data');

        const config: PemCertificateBufferConfig = {
          type: 'pem',
          certData: certBuffer,
          keyData: keyBuffer,
          caData: caBuffer,
          keyPassword: 'key-password',
        };

        const result = loadCertificate(config);

        expect(result.format).toBe('pem');
        expect(result.cert).toBe(certBuffer);
        expect(result.key).toBe(keyBuffer);
        expect(result.ca).toBe(caBuffer);
        expect(result.passphrase).toBe('key-password');
        expect(mockReadFileSync).not.toHaveBeenCalled();
      });
    });
  });

  describe('toTlsOptions', () => {
    it('should convert PFX certificate to TLS options', () => {
      const certificate: LoadedCertificate = {
        format: 'pfx',
        pfx: Buffer.from('pfx-data'),
        passphrase: 'password',
      };

      const result = toTlsOptions(certificate);

      expect(result.pfx).toEqual(certificate.pfx);
      expect(result.passphrase).toBe('password');
      expect(result.rejectUnauthorized).toBe(true);
      expect(result.cert).toBeUndefined();
      expect(result.key).toBeUndefined();
    });

    it('should convert PEM certificate to TLS options', () => {
      const certificate: LoadedCertificate = {
        format: 'pem',
        cert: Buffer.from('cert-data'),
        key: Buffer.from('key-data'),
        ca: Buffer.from('ca-data'),
        passphrase: 'key-password',
      };

      const result = toTlsOptions(certificate);

      expect(result.cert).toEqual(certificate.cert);
      expect(result.key).toEqual(certificate.key);
      expect(result.ca).toEqual(certificate.ca);
      expect(result.passphrase).toBe('key-password');
      expect(result.rejectUnauthorized).toBe(true);
      expect(result.pfx).toBeUndefined();
    });

    it('should allow disabling rejectUnauthorized', () => {
      const certificate: LoadedCertificate = {
        format: 'pfx',
        pfx: Buffer.from('pfx-data'),
      };

      const result = toTlsOptions(certificate, false);

      expect(result.rejectUnauthorized).toBe(false);
    });

    it('should handle PEM certificate without CA', () => {
      const certificate: LoadedCertificate = {
        format: 'pem',
        cert: Buffer.from('cert-data'),
        key: Buffer.from('key-data'),
      };

      const result = toTlsOptions(certificate);

      expect(result.ca).toBeUndefined();
    });

    it('should handle PEM certificate without passphrase', () => {
      const certificate: LoadedCertificate = {
        format: 'pem',
        cert: Buffer.from('cert-data'),
        key: Buffer.from('key-data'),
      };

      const result = toTlsOptions(certificate);

      expect(result.passphrase).toBeUndefined();
    });
  });

  describe('validateCertificate', () => {
    it('should validate PFX certificate successfully', () => {
      const pfxBuffer = Buffer.from('mock-pfx-data');
      mockReadFileSync.mockReturnValue(pfxBuffer);
      mockCreateSecureContext.mockReturnValue({});

      const config: PfxCertificateConfig = {
        type: 'pfx',
        path: '/path/to/cert.pfx',
        password: 'password',
      };

      expect(() => validateCertificate(config)).not.toThrow();
      expect(mockCreateSecureContext).toHaveBeenCalled();
    });

    it('should validate PEM certificate successfully', () => {
      const certBuffer = Buffer.from('mock-cert-data');
      const keyBuffer = Buffer.from('mock-key-data');
      mockReadFileSync
        .mockReturnValueOnce(certBuffer)
        .mockReturnValueOnce(keyBuffer);
      mockCreateSecureContext.mockReturnValue({});

      const config: PemCertificateConfig = {
        type: 'pem',
        certPath: '/path/to/cert.pem',
        keyPath: '/path/to/key.pem',
      };

      expect(() => validateCertificate(config)).not.toThrow();
      expect(mockCreateSecureContext).toHaveBeenCalled();
    });

    it('should validate PEM certificate with CA', () => {
      const certBuffer = Buffer.from('mock-cert-data');
      const keyBuffer = Buffer.from('mock-key-data');
      const caBuffer = Buffer.from('mock-ca-data');
      mockReadFileSync
        .mockReturnValueOnce(certBuffer)
        .mockReturnValueOnce(keyBuffer)
        .mockReturnValueOnce(caBuffer);
      mockCreateSecureContext.mockReturnValue({});

      const config: PemCertificateConfig = {
        type: 'pem',
        certPath: '/path/to/cert.pem',
        keyPath: '/path/to/key.pem',
        caPath: '/path/to/ca.pem',
      };

      expect(() => validateCertificate(config)).not.toThrow();
    });

    it('should validate PEM certificate with passphrase', () => {
      const certBuffer = Buffer.from('mock-cert-data');
      const keyBuffer = Buffer.from('mock-key-data');
      mockReadFileSync
        .mockReturnValueOnce(certBuffer)
        .mockReturnValueOnce(keyBuffer);
      mockCreateSecureContext.mockReturnValue({});

      const config: PemCertificateConfig = {
        type: 'pem',
        certPath: '/path/to/cert.pem',
        keyPath: '/path/to/key.pem',
        keyPassword: 'key-password',
      };

      expect(() => validateCertificate(config)).not.toThrow();
      expect(mockCreateSecureContext).toHaveBeenCalledWith(
        expect.objectContaining({ passphrase: 'key-password' })
      );
    });

    it('should throw CertificateError when createSecureContext fails', () => {
      const pfxBuffer = Buffer.from('mock-pfx-data');
      mockReadFileSync.mockReturnValue(pfxBuffer);
      mockCreateSecureContext.mockImplementation(() => {
        throw new Error('Invalid certificate format');
      });

      const config: PfxCertificateConfig = {
        type: 'pfx',
        path: '/path/to/cert.pfx',
        password: 'password',
      };

      expect(() => validateCertificate(config)).toThrow(CertificateError);
      expect(() => validateCertificate(config)).toThrow(/Invalid certificate/);
    });
  });

  describe('CertificateManager', () => {
    describe('constructor and getFormat', () => {
      it('should create manager with PFX config', () => {
        const config: PfxCertificateConfig = {
          type: 'pfx',
          path: '/path/to/cert.pfx',
          password: 'password',
        };

        const manager = new CertificateManager(config);

        expect(manager.getFormat()).toBe('pfx');
      });

      it('should create manager with PEM config', () => {
        const config: PemCertificateConfig = {
          type: 'pem',
          certPath: '/path/to/cert.pem',
          keyPath: '/path/to/key.pem',
        };

        const manager = new CertificateManager(config);

        expect(manager.getFormat()).toBe('pem');
      });
    });

    describe('load', () => {
      it('should load certificate lazily', () => {
        const pfxBuffer = Buffer.from('mock-pfx-data');
        mockReadFileSync.mockReturnValue(pfxBuffer);

        const config: PfxCertificateConfig = {
          type: 'pfx',
          path: '/path/to/cert.pfx',
          password: 'password',
        };

        const manager = new CertificateManager(config);

        // Certificate not loaded yet
        expect(mockReadFileSync).not.toHaveBeenCalled();

        // First load
        const loaded1 = manager.load();
        expect(mockReadFileSync).toHaveBeenCalledTimes(1);
        expect(loaded1.format).toBe('pfx');

        // Second load should return cached
        const loaded2 = manager.load();
        expect(mockReadFileSync).toHaveBeenCalledTimes(1); // Still 1
        expect(loaded2).toBe(loaded1);
      });
    });

    describe('getTlsOptions', () => {
      it('should return TLS options', () => {
        const pfxBuffer = Buffer.from('mock-pfx-data');
        mockReadFileSync.mockReturnValue(pfxBuffer);

        const config: PfxCertificateConfig = {
          type: 'pfx',
          path: '/path/to/cert.pfx',
          password: 'password',
        };

        const manager = new CertificateManager(config);
        const options = manager.getTlsOptions();

        expect(options.pfx).toEqual(pfxBuffer);
        expect(options.passphrase).toBe('password');
        expect(options.rejectUnauthorized).toBe(true);
      });

      it('should allow setting rejectUnauthorized to false', () => {
        const pfxBuffer = Buffer.from('mock-pfx-data');
        mockReadFileSync.mockReturnValue(pfxBuffer);

        const config: PfxCertificateConfig = {
          type: 'pfx',
          path: '/path/to/cert.pfx',
          password: 'password',
        };

        const manager = new CertificateManager(config);
        const options = manager.getTlsOptions(false);

        expect(options.rejectUnauthorized).toBe(false);
      });
    });

    describe('validate', () => {
      it('should validate certificate', () => {
        const pfxBuffer = Buffer.from('mock-pfx-data');
        mockReadFileSync.mockReturnValue(pfxBuffer);
        mockCreateSecureContext.mockReturnValue({});

        const config: PfxCertificateConfig = {
          type: 'pfx',
          path: '/path/to/cert.pfx',
          password: 'password',
        };

        const manager = new CertificateManager(config);

        expect(() => manager.validate()).not.toThrow();
      });

      it('should throw on invalid certificate', () => {
        const pfxBuffer = Buffer.from('mock-pfx-data');
        mockReadFileSync.mockReturnValue(pfxBuffer);
        mockCreateSecureContext.mockImplementation(() => {
          throw new Error('Invalid certificate');
        });

        const config: PfxCertificateConfig = {
          type: 'pfx',
          path: '/path/to/cert.pfx',
          password: 'password',
        };

        const manager = new CertificateManager(config);

        expect(() => manager.validate()).toThrow(CertificateError);
      });
    });

    describe('reload', () => {
      it('should reload certificate', () => {
        const pfxBuffer1 = Buffer.from('mock-pfx-data-1');
        const pfxBuffer2 = Buffer.from('mock-pfx-data-2');
        mockReadFileSync
          .mockReturnValueOnce(pfxBuffer1)
          .mockReturnValueOnce(pfxBuffer2);

        const config: PfxCertificateConfig = {
          type: 'pfx',
          path: '/path/to/cert.pfx',
          password: 'password',
        };

        const manager = new CertificateManager(config);

        // First load
        const loaded1 = manager.load();
        expect(loaded1.pfx).toEqual(pfxBuffer1);

        // Reload
        const loaded2 = manager.reload();
        expect(loaded2.pfx).toEqual(pfxBuffer2);
        expect(mockReadFileSync).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('createCertificateManager', () => {
    it('should create CertificateManager instance', () => {
      const config: PfxCertificateConfig = {
        type: 'pfx',
        path: '/path/to/cert.pfx',
        password: 'password',
      };

      const manager = createCertificateManager(config);

      expect(manager).toBeInstanceOf(CertificateManager);
      expect(manager.getFormat()).toBe('pfx');
    });
  });
});
