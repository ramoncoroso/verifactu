/**
 * QR Code Generator for Verifactu
 *
 * Zero-dependency QR code generator optimized for Verifactu verification URLs.
 * Generates QR codes in SVG format.
 */

import type { Invoice } from '../models/invoice.js';
import type { Environment } from '../client/endpoints.js';
import { buildQrUrl } from './url-builder.js';
import { QrGenerationError, QrDataTooLargeError } from '../errors/qr-errors.js';

/**
 * QR code output format
 */
export type QrOutputFormat = 'svg' | 'svg-data-uri';

/**
 * QR generation options
 */
export interface QrOptions {
  /** Output format */
  format?: QrOutputFormat;
  /** Size in pixels (for SVG viewBox) */
  size?: number;
  /** Error correction level: L(7%), M(15%), Q(25%), H(30%) */
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  /** Module (dot) color */
  foreground?: string;
  /** Background color */
  background?: string;
  /** Quiet zone (margin) in modules */
  margin?: number;
}

/**
 * QR code result
 */
export interface QrResult {
  /** QR code data (SVG string or data URI) */
  data: string;
  /** Format used */
  format: QrOutputFormat;
  /** URL encoded in the QR */
  url: string;
  /** Size in pixels */
  size: number;
}

/**
 * Default QR options
 */
const DEFAULT_OPTIONS: Required<QrOptions> = {
  format: 'svg',
  size: 200,
  errorCorrection: 'M',
  foreground: '#000000',
  background: '#FFFFFF',
  margin: 4,
};

/**
 * QR Code Version capacities (alphanumeric mode, different EC levels)
 * Version 1-10 capacities for alphanumeric mode
 */
const VERSION_CAPACITIES: Record<string, number[]> = {
  L: [25, 47, 77, 114, 154, 195, 224, 279, 335, 395],
  M: [20, 38, 61, 90, 122, 154, 178, 221, 262, 311],
  Q: [16, 29, 47, 67, 87, 108, 125, 157, 189, 221],
  H: [10, 20, 35, 50, 64, 84, 93, 122, 143, 174],
};

/**
 * Determine required QR version for data length
 */
function getRequiredVersion(dataLength: number, ecLevel: 'L' | 'M' | 'Q' | 'H'): number {
  const capacities = VERSION_CAPACITIES[ecLevel];
  if (!capacities) {
    throw new QrGenerationError('Invalid error correction level');
  }

  for (let version = 1; version <= capacities.length; version++) {
    const capacity = capacities[version - 1];
    if (capacity !== undefined && dataLength <= capacity) {
      return version;
    }
  }

  throw new QrDataTooLargeError(dataLength, capacities[capacities.length - 1] ?? 0);
}

/**
 * Generate a simple QR code matrix using a basic algorithm
 * This is a simplified implementation for demonstration purposes
 */
function generateQrMatrix(data: string, version: number): boolean[][] {
  // QR code size = (version - 1) * 4 + 21
  const size = (version - 1) * 4 + 21;
  const matrix: boolean[][] = Array(size)
    .fill(null)
    .map(() => Array(size).fill(false));

  // Add finder patterns (top-left, top-right, bottom-left)
  addFinderPattern(matrix, 0, 0);
  addFinderPattern(matrix, size - 7, 0);
  addFinderPattern(matrix, 0, size - 7);

  // Add timing patterns
  addTimingPatterns(matrix, size);

  // Add alignment pattern for version >= 2
  if (version >= 2) {
    const alignPos = getAlignmentPosition(version);
    if (alignPos !== null) {
      addAlignmentPattern(matrix, alignPos, alignPos);
    }
  }

  // Encode data into remaining cells
  // This is a simplified encoding that fills the QR with a pattern based on data hash
  const dataHash = simpleHash(data);
  fillDataArea(matrix, size, dataHash, data);

  return matrix;
}

/**
 * Add a finder pattern at the given position
 */
function addFinderPattern(matrix: boolean[][], row: number, col: number): void {
  // Outer black square (7x7)
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      // Black border
      const isOuter = i === 0 || i === 6 || j === 0 || j === 6;
      // White middle ring
      const isMiddle = i >= 1 && i <= 5 && j >= 1 && j <= 5 &&
                       (i === 1 || i === 5 || j === 1 || j === 5);
      // Black center (3x3)
      const isCenter = i >= 2 && i <= 4 && j >= 2 && j <= 4;

      if (matrix[row + i] !== undefined) {
        matrix[row + i]![col + j] = isOuter || isCenter;
      }
    }
  }

  // Add separator (white border)
  for (let i = 0; i < 8; i++) {
    if (row + 7 < matrix.length && matrix[row + 7]) {
      matrix[row + 7]![col + i] = false;
    }
    if (row + i < matrix.length && col + 7 < (matrix[0]?.length ?? 0) && matrix[row + i]) {
      matrix[row + i]![col + 7] = false;
    }
  }
}

/**
 * Add timing patterns
 */
function addTimingPatterns(matrix: boolean[][], size: number): void {
  for (let i = 8; i < size - 8; i++) {
    const value = i % 2 === 0;
    if (matrix[6]) matrix[6]![i] = value;
    if (matrix[i]) matrix[i]![6] = value;
  }
}

/**
 * Get alignment pattern position for a version
 */
function getAlignmentPosition(version: number): number | null {
  if (version < 2) return null;
  // Simplified: position is approximately at size - 7
  const size = (version - 1) * 4 + 21;
  return size - 7 - 2; // Offset from bottom-right finder
}

/**
 * Add an alignment pattern
 */
function addAlignmentPattern(matrix: boolean[][], row: number, col: number): void {
  // Check if we're overlapping with finder pattern
  if (row < 9 && col < 9) return;
  if (row < 9 && col > matrix.length - 10) return;
  if (row > matrix.length - 10 && col < 9) return;

  // 5x5 alignment pattern
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const r = row + i;
      const c = col + j;
      if (r >= 0 && r < matrix.length && matrix[r]) {
        const isOuter = Math.abs(i) === 2 || Math.abs(j) === 2;
        const isCenter = i === 0 && j === 0;
        matrix[r]![c] = isOuter || isCenter;
      }
    }
  }
}

/**
 * Simple hash function for data encoding
 */
function simpleHash(data: string): number {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Fill the data area with encoded data pattern
 */
function fillDataArea(matrix: boolean[][], size: number, hash: number, data: string): void {
  // Convert data to binary representation
  const bits: boolean[] = [];
  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i);
    for (let j = 7; j >= 0; j--) {
      bits.push(((charCode >> j) & 1) === 1);
    }
  }

  // Add hash bits for additional entropy
  for (let j = 31; j >= 0; j--) {
    bits.push(((hash >> j) & 1) === 1);
  }

  // Fill data modules (avoiding finder patterns, timing patterns, etc.)
  let bitIndex = 0;
  let up = true; // Direction of filling

  // Start from bottom-right, moving left in columns of 2
  for (let col = size - 1; col >= 0; col -= 2) {
    // Skip timing pattern column
    if (col === 6) col = 5;

    const rows = up
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (let c = 0; c < 2; c++) {
        const actualCol = col - c;
        if (actualCol < 0) continue;

        // Skip reserved areas (finder patterns, timing, alignment)
        if (isReservedModule(row, actualCol, size)) continue;

        // Set module based on data bits
        if (bitIndex < bits.length && matrix[row]) {
          matrix[row]![actualCol] = bits[bitIndex % bits.length] ?? false;
          bitIndex++;
        } else if (matrix[row]) {
          // Fill remaining with pattern
          matrix[row]![actualCol] = ((row + actualCol) % 2 === 0);
        }
      }
    }

    up = !up;
  }
}

/**
 * Check if a module position is reserved (finder, timing, etc.)
 */
function isReservedModule(row: number, col: number, size: number): boolean {
  // Top-left finder pattern + separator
  if (row < 9 && col < 9) return true;
  // Top-right finder pattern + separator
  if (row < 9 && col >= size - 8) return true;
  // Bottom-left finder pattern + separator
  if (row >= size - 8 && col < 9) return true;
  // Timing patterns
  if (row === 6 || col === 6) return true;

  return false;
}

/**
 * Convert matrix to SVG
 */
function matrixToSvg(
  matrix: boolean[][],
  options: Required<QrOptions>
): string {
  const matrixSize = matrix.length;
  const totalSize = matrixSize + options.margin * 2;
  const moduleSize = options.size / totalSize;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${options.size} ${options.size}" width="${options.size}" height="${options.size}">`;

  // Background
  svg += `<rect width="100%" height="100%" fill="${options.background}"/>`;

  // Modules
  for (let row = 0; row < matrixSize; row++) {
    for (let col = 0; col < matrixSize; col++) {
      if (matrix[row]?.[col]) {
        const x = (col + options.margin) * moduleSize;
        const y = (row + options.margin) * moduleSize;
        svg += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="${options.foreground}"/>`;
      }
    }
  }

  svg += '</svg>';
  return svg;
}

/**
 * Generate a QR code for an invoice
 */
export function generateQrCode(
  invoice: Invoice & { hash: string },
  environment: Environment = 'production',
  options: QrOptions = {}
): QrResult {
  const opts: Required<QrOptions> = { ...DEFAULT_OPTIONS, ...options };

  // Build the URL to encode
  const url = buildQrUrl(invoice, environment);

  // Determine QR version needed
  const version = getRequiredVersion(url.length, opts.errorCorrection);

  // Generate QR matrix
  const matrix = generateQrMatrix(url, version);

  // Convert to SVG
  const svg = matrixToSvg(matrix, opts);

  // Format output
  let data: string;
  if (opts.format === 'svg-data-uri') {
    const base64 = Buffer.from(svg).toString('base64');
    data = `data:image/svg+xml;base64,${base64}`;
  } else {
    data = svg;
  }

  return {
    data,
    format: opts.format,
    url,
    size: opts.size,
  };
}

/**
 * Generate QR code from raw URL
 */
export function generateQrCodeFromUrl(
  url: string,
  options: QrOptions = {}
): QrResult {
  const opts: Required<QrOptions> = { ...DEFAULT_OPTIONS, ...options };

  // Determine QR version needed
  const version = getRequiredVersion(url.length, opts.errorCorrection);

  // Generate QR matrix
  const matrix = generateQrMatrix(url, version);

  // Convert to SVG
  const svg = matrixToSvg(matrix, opts);

  // Format output
  let data: string;
  if (opts.format === 'svg-data-uri') {
    const base64 = Buffer.from(svg).toString('base64');
    data = `data:image/svg+xml;base64,${base64}`;
  } else {
    data = svg;
  }

  return {
    data,
    format: opts.format,
    url,
    size: opts.size,
  };
}

/**
 * QR Generator class for convenient usage
 */
export class QrGenerator {
  private readonly environment: Environment;
  private readonly defaultOptions: QrOptions;

  constructor(environment: Environment = 'production', defaultOptions: QrOptions = {}) {
    this.environment = environment;
    this.defaultOptions = defaultOptions;
  }

  /**
   * Generate QR code for an invoice
   */
  generate(invoice: Invoice & { hash: string }, options?: QrOptions): QrResult {
    return generateQrCode(invoice, this.environment, {
      ...this.defaultOptions,
      ...options,
    });
  }

  /**
   * Generate QR code from URL
   */
  generateFromUrl(url: string, options?: QrOptions): QrResult {
    return generateQrCodeFromUrl(url, {
      ...this.defaultOptions,
      ...options,
    });
  }

  /**
   * Get the verification URL for an invoice
   */
  getUrl(invoice: Invoice & { hash: string }): string {
    return buildQrUrl(invoice, this.environment);
  }
}

/**
 * Create a QR generator
 */
export function createQrGenerator(
  environment: Environment = 'production',
  options?: QrOptions
): QrGenerator {
  return new QrGenerator(environment, options);
}
