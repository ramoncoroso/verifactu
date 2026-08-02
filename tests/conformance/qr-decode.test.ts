/**
 * Nivel 3 de la pirámide: el QR se verifica decodificándolo.
 *
 * El art. 21 de la OM HAC/1177/2024 exige que el código siga ISO/IEC 18004:2015
 * con nivel M de corrección de errores. La única comprobación que verifica eso
 * es que un lector lo lea.
 *
 * Los tests marcados `it.fails` documentan VF-001: **pasan mientras el generador
 * siga roto**. Al sustituir el motor empezarán a fallar y habrá que quitar el
 * `.fails` en el mismo PR.
 */

import { describe, expect, it } from 'vitest';

import { generateQrCodeFromUrl } from '../../src/qr/generator.js';
import { QR_CONTROL_MATRIX, QR_CONTROL_URL } from '../fixtures/qr-control.js';
import { decodeAcrossConfigurations, decodeMatrix, matrixFromSvg } from '../helpers/qr.js';

/** URL de cotejo conforme al §6 de la especificación: exactamente 4 parámetros. */
const URL_COTEJO =
  'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR' +
  '?nif=89890001K&numserie=12345678%2FG33&fecha=01-01-2024&importe=241.40';

describe('Control positivo · el método de prueba funciona', () => {
  // Si esto falla, el que está roto es el rasterizador o `jsqr`, no el generador
  // del repositorio. Sin este control, un fallo del test de abajo sería
  // inconcluyente.
  it('decodifica un QR correcto y devuelve exactamente su contenido', () => {
    expect(decodeMatrix(QR_CONTROL_MATRIX)).toBe(QR_CONTROL_URL);
  });

  it('lo decodifica en todas las escalas y zonas de silencio probadas', () => {
    for (const scale of [2, 4, 8]) {
      for (const quietZone of [2, 4]) {
        expect(decodeMatrix(QR_CONTROL_MATRIX, { scale, quietZone })).toBe(QR_CONTROL_URL);
      }
    }
  });

  it('el control es de versión 7, el tamaño que corresponde a una URL de cotejo', () => {
    expect(QR_CONTROL_MATRIX.length).toBe(45); // (7-1)*4+21
  });
});

describe('Generador del repositorio', () => {
  // VF-001: `generateQrMatrix` no implementa Reed-Solomon, ni indicadores de modo
  // y longitud, ni máscaras, ni información de formato. La salida no es un QR.
  it.fails('el QR generado decodifica a la URL de cotejo [VF-001 abierto]', () => {
    const svg = generateQrCodeFromUrl(URL_COTEJO, { errorCorrection: 'M' }).data;
    expect(decodeMatrix(matrixFromSvg(svg))).toBe(URL_COTEJO);
  });

  it.fails('el QR generado decodifica en alguna configuración [VF-001 abierto]', () => {
    const svg = generateQrCodeFromUrl(URL_COTEJO, { errorCorrection: 'M' }).data;
    const { decoded } = decodeAcrossConfigurations(matrixFromSvg(svg));
    expect(decoded).not.toBeNull();
  });

  // Este no es `it.fails`: documenta el estado actual de forma afirmativa, para
  // que quede constancia de que no decodifica en NINGUNA configuración y no solo
  // en la de por defecto. Al corregir VF-001 habrá que invertirlo.
  it('hoy no decodifica en ninguna de las 20 configuraciones probadas [VF-001 abierto]', () => {
    const svg = generateQrCodeFromUrl(URL_COTEJO, { errorCorrection: 'M' }).data;
    const { decoded, attempts } = decodeAcrossConfigurations(matrixFromSvg(svg));
    expect(attempts).toBe(20);
    expect(decoded).toBeNull();
  });

  // El tamaño de la matriz es un indicio independiente del defecto: las tablas de
  // capacidad de `VERSION_CAPACITIES` son de modo alfanumérico, y la URL va en
  // modo byte, así que la versión elegida se queda corta.
  it.fails('elige la versión que corresponde al modo byte [VF-001 abierto]', () => {
    const svg = generateQrCodeFromUrl(URL_COTEJO, { errorCorrection: 'M' }).data;
    expect(matrixFromSvg(svg).length).toBe(45); // versión 7, la que usa el ejemplo oficial
  });
});
