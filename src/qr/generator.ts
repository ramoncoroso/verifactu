/**
 * Generación del código QR de la factura.
 *
 * El art. 21.1 de la OM HAC/1177/2024 exige que el código siga **ISO/IEC
 * 18004:2015** con nivel **M** de corrección de errores, y que se imprima entre
 * 30×30 y 40×40 milímetros.
 *
 * La codificación la hace `qrcode-generator` (MIT, sin dependencias transitivas),
 * el port canónico del encoder de Kazuhiko Arase. La implementación anterior era
 * un placeholder —lo decía su propio comentario— que dibujaba los patrones de
 * localización y rellenaba el resto con los bits crudos de la cadena más un hash
 * de 32 bits: sin Reed-Solomon, sin indicadores de modo y longitud, sin máscaras
 * y sin información de formato. Verificado: no la decodificaba ningún lector en
 * ninguna de 664 configuraciones probadas.
 */

import qrcode from 'qrcode-generator';

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
  /**
   * Unidad de `size`. `'px'` por defecto.
   *
   * La norma exige un tamaño impreso de 30 a 40 mm, y una zona de silencio de al
   * menos 2 mm (recomendado 6). Con `'mm'` el SVG sale dimensionado en
   * milímetros y se comprueba que la zona de silencio resultante sea conforme.
   */
  unit?: 'px' | 'mm';
  /**
   * Emite un único `<path>` fusionando tiradas horizontales en vez de un `<rect>`
   * por módulo. Reduce el SVG en torno a un 85 %. Por defecto, activado.
   */
  optimize?: boolean;
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
  /**
   * Matriz de módulos; `true` = módulo oscuro.
   *
   * Se expone para poder **decodificar** la salida en los tests sin parsear el
   * SVG. Sin ella, verificar que el QR es legible exigía reconstruir la matriz
   * con expresiones regulares.
   */
  readonly modules: readonly (readonly boolean[])[];
  /** Versión QR resultante (1-40). Para Veri*Factu, típicamente 7-11. */
  readonly version: number;
  /** Nivel de corrección de errores efectivo. */
  readonly errorCorrection: 'L' | 'M' | 'Q' | 'H';
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
  unit: 'px',
  optimize: true,
};

/** Caracteres admitidos en el contenido del QR. */
const ASCII_IMPRIMIBLE = /^[\x20-\x7E]*$/;

/**
 * Codifica el contenido en una matriz de módulos.
 *
 * Dos cosas que no son obvias y que hay que respetar:
 *
 *  - **Modo byte explícito.** La URL de cotejo lleva minúsculas, `:`, `?` y `&`,
 *    que están fuera del alfabeto alfanumérico de QR. Las tablas de capacidad de
 *    la implementación anterior eran de modo alfanumérico, así que elegía una
 *    versión demasiado pequeña: versión 5 donde hacen falta la 7.
 *  - **La validación ASCII va ANTES de codificar.** El `stringToBytes` por
 *    defecto de `qrcode-generator` es latin-1, no UTF-8, así que un carácter
 *    fuera de ASCII se codificaría mal en silencio. Y el §4 de la especificación
 *    del QR lo prohíbe de todos modos.
 */
function buildMatrix(data: string, ec: 'L' | 'M' | 'Q' | 'H'): boolean[][] {
  if (!ASCII_IMPRIMIBLE.test(data)) {
    throw new QrGenerationError(
      'El contenido del QR solo puede contener caracteres ASCII del 32 al 126 ' +
        '(especificación del código QR, apartado 4)'
    );
  }
  let qr;
  try {
    qr = qrcode(0, ec); // 0 = versión automática
    qr.addData(data, 'Byte');
    qr.make();
  } catch (error) {
    throw new QrDataTooLargeError(data.length, 2331);
  }
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col) => qr.isDark(row, col))
  );
}

function matrixToSvg(matrix: boolean[][], options: Required<QrOptions>): string {
  const modules = matrix.length;
  const total = modules + options.margin * 2;
  const moduleSize = options.size / total;
  const unidad = options.unit === 'mm' ? 'mm' : '';

  if (options.unit === 'mm') {
    // §3 de la especificación: mínimo 2 mm de zona de silencio, recomendado 6.
    const zona = options.margin * moduleSize;
    if (zona < 2) {
      throw new QrGenerationError(
        `Zona de silencio de ${zona.toFixed(2)} mm: la especificación exige al menos 2 mm. ` +
          `Aumenta el tamaño o el margen.`
      );
    }
  }

  const cuerpo = options.optimize
    ? pathDeModulos(matrix, options.margin, moduleSize, options.foreground)
    : rectsDeModulos(matrix, options.margin, moduleSize, options.foreground);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${options.size} ${options.size}" ` +
    `width="${options.size}${unidad}" height="${options.size}${unidad}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="${options.background}"/>` +
    cuerpo +
    '</svg>'
  );
}

/** Un `<path>` con las tiradas horizontales fusionadas. */
function pathDeModulos(
  matrix: boolean[][],
  margin: number,
  moduleSize: number,
  fill: string
): string {
  const trozos: string[] = [];
  for (let row = 0; row < matrix.length; row++) {
    const fila = matrix[row]!;
    let col = 0;
    while (col < fila.length) {
      if (!fila[col]) {
        col++;
        continue;
      }
      let ancho = 1;
      while (col + ancho < fila.length && fila[col + ancho]) ancho++;
      const x = (col + margin) * moduleSize;
      const y = (row + margin) * moduleSize;
      trozos.push(`M${red(x)} ${red(y)}h${red(ancho * moduleSize)}v${red(moduleSize)}h-${red(ancho * moduleSize)}z`);
      col += ancho;
    }
  }
  return trozos.length === 0 ? '' : `<path fill="${fill}" d="${trozos.join('')}"/>`;
}

/** Un `<rect>` por módulo. Se conserva para quien dependa de esa forma. */
function rectsDeModulos(
  matrix: boolean[][],
  margin: number,
  moduleSize: number,
  fill: string
): string {
  let svg = '';
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix[row]!.length; col++) {
      if (!matrix[row]?.[col]) continue;
      const x = (col + margin) * moduleSize;
      const y = (row + margin) * moduleSize;
      svg += `<rect x="${red(x)}" y="${red(y)}" width="${red(moduleSize)}" height="${red(moduleSize)}" fill="${fill}"/>`;
    }
  }
  return svg;
}

/** Recorta la coma flotante a 4 decimales. */
function red(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Construye el resultado a partir de la matriz. Único punto que arma `QrResult`. */
function buildResult(url: string, matrix: boolean[][], opts: Required<QrOptions>): QrResult {
  const svg = matrixToSvg(matrix, opts);
  const data =
    opts.format === 'svg-data-uri'
      ? `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
      : svg;
  return {
    data,
    format: opts.format,
    url,
    size: opts.size,
    modules: matrix,
    version: (matrix.length - 21) / 4 + 1,
    errorCorrection: opts.errorCorrection,
  };
}

/** Genera el QR de cotejo de una factura. */
export function generateQrCode(
  invoice: Invoice & { hash: string },
  environment: Environment = 'production',
  options: QrOptions = {}
): QrResult {
  const opts: Required<QrOptions> = { ...DEFAULT_OPTIONS, ...options };
  const url = buildQrUrl(invoice, environment);
  return buildResult(url, buildMatrix(url, opts.errorCorrection), opts);
}

/** Genera un QR a partir de una URL ya construida. */
export function generateQrCodeFromUrl(url: string, options: QrOptions = {}): QrResult {
  const opts: Required<QrOptions> = { ...DEFAULT_OPTIONS, ...options };
  return buildResult(url, buildMatrix(url, opts.errorCorrection), opts);
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
