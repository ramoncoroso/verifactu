/**
 * Logger Interface for Verifactu
 *
 * Allows users to inject their own logger (pino, winston, console, etc.)
 * without adding any dependencies to the library.
 */

/**
 * Logger interface compatible with common logging libraries
 *
 * This interface is designed to be compatible with:
 * - pino
 * - winston
 * - console
 * - bunyan
 * - Any custom implementation
 */
export interface Logger {
  /**
   * Log debug messages (verbose, for development)
   * Used for: Request/response XML (sanitized), internal state
   */
  debug(message: string, meta?: Record<string, unknown>): void;

  /**
   * Log informational messages
   * Used for: Invoice submitted, cancelled, queried
   */
  info(message: string, meta?: Record<string, unknown>): void;

  /**
   * Log warning messages
   * Used for: Retry initiated, timeout approaching, deprecated usage
   */
  warn(message: string, meta?: Record<string, unknown>): void;

  /**
   * Log error messages
   * Used for: Network errors, AEAT errors, validation failures
   */
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * No-operation logger that discards all messages
 *
 * This is the default logger when none is provided.
 * It has zero overhead as all methods are empty.
 */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Console logger that outputs to console with prefixes
 *
 * Useful for development and debugging.
 */
export const consoleLogger: Logger = {
  debug: (message, meta) => {
    if (meta) {
      console.debug(`[DEBUG] ${message}`, meta);
    } else {
      console.debug(`[DEBUG] ${message}`);
    }
  },
  info: (message, meta) => {
    if (meta) {
      console.info(`[INFO] ${message}`, meta);
    } else {
      console.info(`[INFO] ${message}`);
    }
  },
  warn: (message, meta) => {
    if (meta) {
      console.warn(`[WARN] ${message}`, meta);
    } else {
      console.warn(`[WARN] ${message}`);
    }
  },
  error: (message, meta) => {
    if (meta) {
      console.error(`[ERROR] ${message}`, meta);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  },
};

/**
 * Create a logger that only logs at or above a certain level
 *
 * @param baseLogger - The underlying logger to use
 * @param minLevel - Minimum level to log ('debug' | 'info' | 'warn' | 'error')
 */
export function createLevelFilteredLogger(
  baseLogger: Logger,
  minLevel: 'debug' | 'info' | 'warn' | 'error'
): Logger {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const minLevelValue = levels[minLevel];

  return {
    debug: minLevelValue <= 0 ? baseLogger.debug.bind(baseLogger) : () => {},
    info: minLevelValue <= 1 ? baseLogger.info.bind(baseLogger) : () => {},
    warn: minLevelValue <= 2 ? baseLogger.warn.bind(baseLogger) : () => {},
    error: minLevelValue <= 3 ? baseLogger.error.bind(baseLogger) : () => {},
  };
}

/**
 * Log context for structured logging
 */
export interface LogContext {
  /** Operation being performed */
  operation?: 'submitInvoice' | 'cancelInvoice' | 'checkInvoiceStatus';
  /** Invoice ID if applicable */
  invoiceId?: string;
  /** Issuer NIF */
  issuerNif?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Retry attempt number */
  attempt?: number;
  /** Error code if applicable */
  errorCode?: string;
  /** Additional context */
  [key: string]: unknown;
}

/**
 * Sanitize XML to remove sensitive data before logging
 *
 * Removes or masks:
 * - Passwords
 * - Certificate data
 * - Full NIF values (shows only last 4 chars)
 */
export function sanitizeXmlForLogging(xml: string): string {
  return xml
    // Mask passwords
    .replace(/<([^>]*[Pp]assword[^>]*)>[^<]+<\//g, '<$1>***</')
    // Mask certificate data
    .replace(/<([^>]*[Cc]ertificate[^>]*)>[^<]+<\//g, '<$1>***</')
    // Partially mask NIF (show last 4 chars)
    .replace(/<(NIF|IDEmisorFactura)>([A-Z0-9]+)<\//g, (_: string, tag: string, nif: string) => {
      if (nif.length > 4) {
        return `<${tag}>****${nif.slice(-4)}</`;
      }
      return `<${tag}>${nif}</`;
    });
}
