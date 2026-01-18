/**
 * Tests for the Logger module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  noopLogger,
  consoleLogger,
  createLevelFilteredLogger,
  sanitizeXmlForLogging,
  type Logger,
} from '../../src/client/logger.js';

describe('Logger', () => {
  describe('noopLogger', () => {
    it('should have all required methods', () => {
      expect(typeof noopLogger.debug).toBe('function');
      expect(typeof noopLogger.info).toBe('function');
      expect(typeof noopLogger.warn).toBe('function');
      expect(typeof noopLogger.error).toBe('function');
    });

    it('should not throw when called', () => {
      expect(() => noopLogger.debug('test')).not.toThrow();
      expect(() => noopLogger.info('test')).not.toThrow();
      expect(() => noopLogger.warn('test')).not.toThrow();
      expect(() => noopLogger.error('test')).not.toThrow();
    });

    it('should accept meta parameter', () => {
      expect(() => noopLogger.debug('test', { key: 'value' })).not.toThrow();
      expect(() => noopLogger.info('test', { key: 'value' })).not.toThrow();
      expect(() => noopLogger.warn('test', { key: 'value' })).not.toThrow();
      expect(() => noopLogger.error('test', { key: 'value' })).not.toThrow();
    });
  });

  describe('consoleLogger', () => {
    beforeEach(() => {
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should call console.debug with prefix', () => {
      consoleLogger.debug('test message');
      expect(console.debug).toHaveBeenCalledWith('[DEBUG] test message');
    });

    it('should call console.info with prefix', () => {
      consoleLogger.info('test message');
      expect(console.info).toHaveBeenCalledWith('[INFO] test message');
    });

    it('should call console.warn with prefix', () => {
      consoleLogger.warn('test message');
      expect(console.warn).toHaveBeenCalledWith('[WARN] test message');
    });

    it('should call console.error with prefix', () => {
      consoleLogger.error('test message');
      expect(console.error).toHaveBeenCalledWith('[ERROR] test message');
    });

    it('should include meta when provided', () => {
      const meta = { key: 'value' };
      consoleLogger.debug('test message', meta);
      expect(console.debug).toHaveBeenCalledWith('[DEBUG] test message', meta);
    });

    it('should not include meta when undefined', () => {
      consoleLogger.info('test message');
      expect(console.info).toHaveBeenCalledWith('[INFO] test message');
    });
  });

  describe('createLevelFilteredLogger', () => {
    let mockLogger: Logger;

    beforeEach(() => {
      mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
    });

    it('should pass all levels when minLevel is debug', () => {
      const filtered = createLevelFilteredLogger(mockLogger, 'debug');

      filtered.debug('debug message');
      filtered.info('info message');
      filtered.warn('warn message');
      filtered.error('error message');

      expect(mockLogger.debug).toHaveBeenCalledWith('debug message');
      expect(mockLogger.info).toHaveBeenCalledWith('info message');
      expect(mockLogger.warn).toHaveBeenCalledWith('warn message');
      expect(mockLogger.error).toHaveBeenCalledWith('error message');
    });

    it('should filter debug when minLevel is info', () => {
      const filtered = createLevelFilteredLogger(mockLogger, 'info');

      filtered.debug('debug message');
      filtered.info('info message');
      filtered.warn('warn message');
      filtered.error('error message');

      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('info message');
      expect(mockLogger.warn).toHaveBeenCalledWith('warn message');
      expect(mockLogger.error).toHaveBeenCalledWith('error message');
    });

    it('should filter debug and info when minLevel is warn', () => {
      const filtered = createLevelFilteredLogger(mockLogger, 'warn');

      filtered.debug('debug message');
      filtered.info('info message');
      filtered.warn('warn message');
      filtered.error('error message');

      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('warn message');
      expect(mockLogger.error).toHaveBeenCalledWith('error message');
    });

    it('should only pass error when minLevel is error', () => {
      const filtered = createLevelFilteredLogger(mockLogger, 'error');

      filtered.debug('debug message');
      filtered.info('info message');
      filtered.warn('warn message');
      filtered.error('error message');

      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('error message');
    });

    it('should pass meta to filtered methods', () => {
      const filtered = createLevelFilteredLogger(mockLogger, 'info');
      const meta = { key: 'value' };

      filtered.info('info message', meta);

      expect(mockLogger.info).toHaveBeenCalledWith('info message', meta);
    });
  });

  describe('sanitizeXmlForLogging', () => {
    it('should mask password elements', () => {
      const xml = '<Password>secretpassword123</Password>';
      const sanitized = sanitizeXmlForLogging(xml);
      expect(sanitized).toBe('<Password>***</Password>');
    });

    it('should mask password elements case-insensitively', () => {
      const xml = '<password>secretpassword123</password>';
      const sanitized = sanitizeXmlForLogging(xml);
      expect(sanitized).toBe('<password>***</password>');
    });

    it('should mask certificate elements', () => {
      const xml = '<Certificate>base64certdata...</Certificate>';
      const sanitized = sanitizeXmlForLogging(xml);
      expect(sanitized).toBe('<Certificate>***</Certificate>');
    });

    it('should partially mask NIF', () => {
      const xml = '<NIF>B12345678</NIF>';
      const sanitized = sanitizeXmlForLogging(xml);
      expect(sanitized).toBe('<NIF>****5678</NIF>');
    });

    it('should partially mask IDEmisorFactura', () => {
      const xml = '<IDEmisorFactura>A87654321</IDEmisorFactura>';
      const sanitized = sanitizeXmlForLogging(xml);
      expect(sanitized).toBe('<IDEmisorFactura>****4321</IDEmisorFactura>');
    });

    it('should not mask short NIFs', () => {
      const xml = '<NIF>1234</NIF>';
      const sanitized = sanitizeXmlForLogging(xml);
      expect(sanitized).toBe('<NIF>1234</NIF>');
    });

    it('should handle multiple elements', () => {
      const xml = `
        <data>
          <NIF>B12345678</NIF>
          <Password>secret</Password>
          <IDEmisorFactura>A87654321</IDEmisorFactura>
        </data>
      `;
      const sanitized = sanitizeXmlForLogging(xml);
      expect(sanitized).toContain('<NIF>****5678</NIF>');
      expect(sanitized).toContain('<Password>***</Password>');
      expect(sanitized).toContain('<IDEmisorFactura>****4321</IDEmisorFactura>');
    });

    it('should not modify non-sensitive elements', () => {
      const xml = '<NumSerieFactura>A001</NumSerieFactura>';
      const sanitized = sanitizeXmlForLogging(xml);
      expect(sanitized).toBe('<NumSerieFactura>A001</NumSerieFactura>');
    });

    it('should handle empty strings', () => {
      const sanitized = sanitizeXmlForLogging('');
      expect(sanitized).toBe('');
    });
  });

  describe('Custom Logger Implementation', () => {
    it('should work with a custom logger', () => {
      const logs: { level: string; message: string; meta?: Record<string, unknown> }[] = [];

      const customLogger: Logger = {
        debug: (message, meta) => logs.push({ level: 'debug', message, meta }),
        info: (message, meta) => logs.push({ level: 'info', message, meta }),
        warn: (message, meta) => logs.push({ level: 'warn', message, meta }),
        error: (message, meta) => logs.push({ level: 'error', message, meta }),
      };

      customLogger.info('Invoice submitted', { invoiceId: 'A001' });
      customLogger.error('Network error', { code: 'ECONNREFUSED' });

      expect(logs).toHaveLength(2);
      expect(logs[0]).toEqual({
        level: 'info',
        message: 'Invoice submitted',
        meta: { invoiceId: 'A001' },
      });
      expect(logs[1]).toEqual({
        level: 'error',
        message: 'Network error',
        meta: { code: 'ECONNREFUSED' },
      });
    });

    it('should be compatible with pino-like interface', () => {
      // Simulate pino logger structure
      const pinoLike: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      pinoLike.info('test', { key: 'value' });
      expect(pinoLike.info).toHaveBeenCalledWith('test', { key: 'value' });
    });
  });
});
