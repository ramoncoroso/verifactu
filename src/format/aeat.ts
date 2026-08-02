/**
 * Formateo de valores para la AEAT. **Única fuente.**
 *
 * Antes de este módulo había tres formateadores de fecha (`xml/builder.ts`,
 * `qr/url-builder.ts` en línea, y `models/invoice.ts`) y dos de marca temporal
 * (`xml/builder.ts` y `crypto/hash.ts`). El de `models/invoice.ts` era el único
 * correcto y no lo llamaba nadie; el del XML y el de la huella producían
 * representaciones **distintas del mismo instante**, así que la huella no podía
 * coincidir con lo que se enviaba.
 *
 * La regla que gobierna el diseño la fija el apartado 3 del documento de la
 * huella de la AEAT: *«Los valores de los campos deberán tener la misma
 * información contenida en el campo correspondiente del fichero XML»*. Se
 * formatea **una vez**, y el texto resultante alimenta al XML y a la huella.
 */

import { ValidationError } from '../errors/validation-errors.js';
import { ErrorCode } from '../errors/base-error.js';

/** `sf:fecha` — `SuministroInformacion.xsd`, longitud 10. */
export const AEAT_DATE_PATTERN = /^\d{2}-\d{2}-\d{4}$/;

/** `FechaHoraHusoGenRegistro` — `xs:dateTime` con offset numérico, longitud 25. */
export const AEAT_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

/** `ImporteSgn12.2Type` — hasta 12 dígitos enteros y 2 decimales, con signo opcional. */
export const AEAT_AMOUNT_PATTERN = /^-?\d{1,12}(\.\d{1,2})?$/;

/** `Tipo2.2Type` — hasta 3 dígitos y 2 decimales, **sin signo**. */
export const AEAT_RATE_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

/** Máximo representable por `ImporteSgn12.2Type`. */
const MAX_AMOUNT = 1e12;

type Parts = Record<string, string>;

/**
 * Descompone un instante en la zona indicada.
 *
 * Usa `Intl` en lugar de aritmética sobre `getTimezoneOffset()`. La versión
 * anterior calculaba `Math.abs(Math.floor(offset / 60))`, que aplica el redondeo
 * antes que el valor absoluto y produce `+06:30` donde debería decir `+05:30`.
 * `Intl` resuelve husos fraccionarios, de cuarto de hora y horario de verano sin
 * aritmética propia.
 */
function partsIn(date: Date, timeZone?: string): Parts {
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('Fecha inválida', ErrorCode.VALIDATION_ERROR, { field: 'date' });
  }
  const fmt = new Intl.DateTimeFormat('en-CA', {
    ...(timeZone === undefined ? {} : { timeZone }),
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'longOffset',
  });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

/**
 * `FechaExpedicionFactura`, `FechaOperacion` y la fecha de `RegistroAnterior`.
 *
 * Formato `dd-mm-yyyy`. El XSD lo declara como cadena de longitud fija 10 con
 * patrón `\d{2,2}-\d{2,2}-\d{4,4}`: una fecha ISO **no valida**.
 *
 * @param timeZone Zona IANA en la que se interpreta el instante. Si se omite se
 * usa la del proceso, que hace el resultado dependiente del entorno: un `Date`
 * construido como `new Date('2024-01-15')` es medianoche **UTC** y produce el día
 * 14 en cualquier huso al oeste de Greenwich. Pásala siempre que el determinismo
 * importe.
 */
export function formatAeatDate(date: Date, timeZone?: string): string {
  const p = partsIn(date, timeZone);
  return `${p.day}-${p.month}-${p.year}`;
}

/**
 * `FechaHoraHusoGenRegistro`.
 *
 * `yyyy-mm-ddThh:mm:ss±hh:mm`, longitud fija 25. Siempre con offset numérico:
 * nunca `Z`, nunca segundos fraccionarios. El XSD acepta el offset ausente
 * —está comprobado—, pero entonces la huella no coincide con lo que la AEAT
 * recalcula a partir del XML, y todos los ejemplos oficiales lo llevan.
 */
export function formatAeatTimestamp(date: Date, timeZone?: string): string {
  const p = partsIn(date, timeZone);
  // `longOffset` devuelve «GMT+02:00», y «GMT» a secas en UTC.
  const offset = (p.timeZoneName ?? '').replace('GMT', '') || '+00:00';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`;
}

/**
 * `ImporteSgn12.2Type`: `CuotaTotal`, `ImporteTotal`, `BaseImponibleOimporteNoSujeto`…
 *
 * `toFixed(2)` a secas no vale: emite `"NaN"`, `"Infinity"` y `"1e+21"`, que
 * violan el patrón sin que nada avise, y produce `"-0.00"` para importes que
 * redondean a cero.
 */
export function formatAeatAmount(value: number): string {
  if (!Number.isFinite(value)) {
    throw new ValidationError(`Importe no finito: ${String(value)}`, ErrorCode.VALIDATION_ERROR, {
      field: 'amount',
    });
  }
  if (Math.abs(value) >= MAX_AMOUNT) {
    throw new ValidationError(
      `Importe fuera de rango: ${value} (máximo 12 dígitos enteros)`,
      ErrorCode.VALIDATION_ERROR,
      { field: 'amount' }
    );
  }
  // Redondeo sobre céntimos enteros. Evita además el `-0`.
  const centimos = Math.round(value * 100);
  const normalizado = centimos === 0 ? 0 : centimos / 100;
  return normalizado.toFixed(2);
}

/** `Tipo2.2Type`: `TipoImpositivo`, `TipoRecargoEquivalencia`. Sin signo. */
export function formatAeatRate(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError(
      `Tipo impositivo inválido: ${String(value)}`,
      ErrorCode.VALIDATION_ERROR,
      { field: 'rate' }
    );
  }
  if (value >= 1000) {
    throw new ValidationError(
      `Tipo impositivo fuera de rango: ${value}`,
      ErrorCode.VALIDATION_ERROR,
      { field: 'rate' }
    );
  }
  return (Math.round(value * 100) / 100).toFixed(2);
}

/**
 * Normaliza un valor de texto antes de que entre en el XML **y** en la huella.
 *
 * El documento de la huella exige recortar los extremos de cada valor, y su
 * implementación de referencia usa `String.trim()` de Java, que solo elimina
 * caracteres `<= U+0020`. El `.trim()` de JavaScript elimina además el espacio
 * duro y el BOM, así que una razón social terminada en ` ` produciría una
 * huella distinta de la que calcula la AEAT. Se replica la semántica de Java.
 */
export function normalizeAeatText(value: string | undefined | null): string {
  if (value === undefined || value === null) return '';
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) start++;
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end--;
  return value.slice(start, end);
}

/**
 * Compone `NumSerieFactura` a partir de la serie y el número.
 *
 * Única fuente: el QR, el XML y la huella deben usar exactamente la misma
 * cadena. Si divergen, la factura es válida pero **no cotejable**, y el fallo es
 * silencioso.
 */
export function buildNumSerieFactura(id: {
  series?: string | undefined;
  number: string;
}): string {
  const serie = normalizeAeatText(id.series);
  const numero = normalizeAeatText(id.number);
  return serie ? `${serie}${numero}` : numero;
}
