/**
 * Literales que la norma obliga a imprimir junto al código QR.
 *
 * El §3 de la especificación y el art. 20.1.b de la OM HAC/1177/2024 los fijan
 * palabra por palabra. Se exportan como constantes porque, tecleados a mano, se
 * teclean mal: `VERIFACTU` sin asterisco, «Sede AEAT» en lugar del literal.
 */

/**
 * Va **encima** del código, precediéndolo, «de manera que sirva para
 * identificarlo y distinguirlo de otros posibles códigos QR que pudiera contener
 * la factura para otros cometidos».
 */
export const AEAT_QR_PREFIX_TEXT = 'QR tributario:';

/** Va **debajo**, solo si el sistema emite facturas verificables. */
export const AEAT_QR_VERIFACTU_TEXT = 'Factura verificable en la sede electrónica de la AEAT';

/** Alternativa admitida al literal anterior. */
export const AEAT_QR_VERIFACTU_SHORT_TEXT = 'VERI*FACTU';

/** Tamaño impreso mínimo, en milímetros (art. 21.1). */
export const AEAT_QR_MIN_SIZE_MM = 30;

/** Tamaño impreso máximo, en milímetros (art. 21.1). */
export const AEAT_QR_MAX_SIZE_MM = 40;

/** Zona de silencio mínima alrededor del código, en milímetros (§3). */
export const AEAT_QR_MIN_QUIET_ZONE_MM = 2;

/** Zona de silencio recomendada, en milímetros (§3). */
export const AEAT_QR_RECOMMENDED_QUIET_ZONE_MM = 6;
