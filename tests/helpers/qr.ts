/**
 * Decodificación de códigos QR para los tests.
 *
 * Un QR solo está bien si un lector lo lee. Comprobar que el SVG «contiene
 * `<svg`» no verifica nada: 21 de los 22 tests actuales del generador pasan con
 * una imagen completamente en blanco (ver la issue VF-018).
 *
 * No hace falta rasterizador ni navegador sin cabeza: se construye el buffer
 * RGBA a mano a partir de la matriz de módulos y se pasa a `jsqr`.
 */

import jsQR from 'jsqr';

/** Matriz de módulos; `true` = módulo oscuro. */
export type QrMatrix = readonly (readonly boolean[])[];

export interface RasterizeOptions {
  /** Píxeles por módulo. */
  scale?: number;
  /** Zona de silencio, en módulos. */
  quietZone?: number;
}

/** Convierte una matriz de módulos en un buffer RGBA que `jsqr` pueda consumir. */
export function rasterize(
  matrix: QrMatrix,
  { scale = 4, quietZone = 4 }: RasterizeOptions = {}
): { data: Uint8ClampedArray; size: number } {
  const modules = matrix.length;
  const size = (modules + quietZone * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);

  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (!matrix[row]?.[col]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const y = (row + quietZone) * scale + dy;
          const x = (col + quietZone) * scale + dx;
          const i = (y * size + x) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    }
  }
  return { data, size };
}

/** Decodifica una matriz de módulos. Devuelve `null` si no es un QR legible. */
export function decodeMatrix(matrix: QrMatrix, options?: RasterizeOptions): string | null {
  const { data, size } = rasterize(matrix, options);
  return jsQR(data, size, size)?.data ?? null;
}

/**
 * Reconstruye la matriz de módulos a partir del SVG que produce el generador.
 *
 * Existe porque `QrResult` no expone hoy la matriz: solo devuelve la cadena SVG.
 * Cuando el generador exponga `modules` (propuesto en la corrección de VF-001),
 * esta función deja de ser necesaria y los tests pasan a usar la matriz directa.
 */
export function matrixFromSvg(svg: string): QrMatrix {
  const viewBox = /viewBox="0 0 (\d+(?:\.\d+)?) /.exec(svg);
  if (!viewBox?.[1]) throw new Error('El SVG no declara viewBox');

  const rects = [...svg.matchAll(/<rect\s+x="([\d.]+)"\s+y="([\d.]+)"\s+width="([\d.]+)"/g)].map(
    (m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]) })
  );
  if (rects.length === 0) throw new Error('El SVG no contiene ningún <rect> de módulo');

  const moduleSize = rects[0]!.w;
  const xs = rects.map((r) => r.x);
  const ys = rects.map((r) => r.y);
  const originX = Math.min(...xs);
  const originY = Math.min(...ys);
  const modules =
    Math.round((Math.max(...xs) - originX) / moduleSize) + 1 >
    Math.round((Math.max(...ys) - originY) / moduleSize) + 1
      ? Math.round((Math.max(...xs) - originX) / moduleSize) + 1
      : Math.round((Math.max(...ys) - originY) / moduleSize) + 1;

  const matrix: boolean[][] = Array.from({ length: modules }, () =>
    Array.from({ length: modules }, () => false)
  );
  for (const r of rects) {
    const col = Math.round((r.x - originX) / moduleSize);
    const row = Math.round((r.y - originY) / moduleSize);
    const line = matrix[row];
    if (line && col >= 0 && col < line.length) line[col] = true;
  }
  return matrix;
}

/** Barre varias configuraciones de rasterizado. Evita atribuir al codificador lo que sea del rasterizado. */
export function decodeAcrossConfigurations(
  matrix: QrMatrix
): { decoded: string | null; attempts: number } {
  let attempts = 0;
  for (const scale of [2, 3, 4, 6, 8]) {
    for (const quietZone of [0, 2, 4, 8]) {
      attempts++;
      const decoded = decodeMatrix(matrix, { scale, quietZone });
      if (decoded !== null) return { decoded, attempts };
    }
  }
  return { decoded: null, attempts };
}
