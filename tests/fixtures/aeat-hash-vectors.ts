/**
 * Vectores de prueba OFICIALES para el cálculo de la huella.
 *
 * Fuente: AEAT, «Detalle de las especificaciones técnicas para generación de la
 * huella o hash de los registros de facturación», v0.1.2 (27/08/2024), apartado 6.
 * https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Veri-Factu_especificaciones_huella_hash_registros.pdf
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTOS VALORES PROCEDEN DE LA AEAT. NO SE EDITAN.                         │
 * │ Si un test que los usa falla, el que está mal es el código.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Los tres forman una cadena real: el digest de cada uno es la `Huella` del
 * siguiente. Eso permite verificar el encadenamiento extremo a extremo con datos
 * publicados por el regulador en lugar de inventados.
 *
 * Reglas de construcción de la cadena, del apartado 3 del mismo documento y de
 * la implementación de referencia en Java de su apartado 4:
 *
 *   - `nombre=valor`, separados por `&`, SIN `&` final.
 *   - Cada valor se recorta por ambos extremos (`valor.trim()`); los espacios
 *     internos se conservan.
 *   - Un campo ausente se emite igualmente: `Huella=` (el caso del primer
 *     registro de la cadena).
 *   - NO se aplica URL-encoding: la `/` de `12345678/G33` viaja cruda.
 *   - UTF-8, y salida en hexadecimal MAYÚSCULAS de 64 caracteres.
 */

export interface AeatHashVector {
  readonly id: string;
  readonly kind: 'alta' | 'anulacion';
  /** Campos en el orden exacto en que se concatenan. */
  readonly fields: Readonly<Record<string, string>>;
  /** La cadena completa, tal y como debe quedar antes del digest. */
  readonly input: string;
  /** SHA-256 de `input` en hexadecimal mayúsculas. */
  readonly digest: string;
}

const H_6_1 = '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60';
const H_6_2 = 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97';
const H_6_3 = '177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68';

export const AEAT_HASH_VECTORS: readonly AeatHashVector[] = [
  {
    // §6.1 — primer registro de facturación (alta) de un SIF: `Huella=` vacía.
    id: 'alta-primer-registro',
    kind: 'alta',
    fields: {
      IDEmisorFactura: '89890001K',
      NumSerieFactura: '12345678/G33',
      FechaExpedicionFactura: '01-01-2024',
      TipoFactura: 'F1',
      CuotaTotal: '12.35',
      ImporteTotal: '123.45',
      Huella: '',
      FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
    },
    input:
      'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&' +
      'FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&' +
      'ImporteTotal=123.45&Huella=&' +
      'FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00',
    digest: H_6_1,
  },
  {
    // §6.2 — alta encadenada al anterior.
    id: 'alta-encadenada',
    kind: 'alta',
    fields: {
      IDEmisorFactura: '89890001K',
      NumSerieFactura: '12345679/G34',
      FechaExpedicionFactura: '01-01-2024',
      TipoFactura: 'F1',
      CuotaTotal: '12.35',
      ImporteTotal: '123.45',
      Huella: H_6_1,
      FechaHoraHusoGenRegistro: '2024-01-01T19:20:35+01:00',
    },
    input:
      'IDEmisorFactura=89890001K&NumSerieFactura=12345679/G34&' +
      'FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&' +
      `ImporteTotal=123.45&Huella=${H_6_1}&` +
      'FechaHoraHusoGenRegistro=2024-01-01T19:20:35+01:00',
    digest: H_6_2,
  },
  {
    // §6.3 — anulación. Nótese el sufijo `Anulada` en los tres primeros campos,
    // y su ausencia en `Huella` y `FechaHoraHusoGenRegistro`.
    id: 'anulacion-encadenada',
    kind: 'anulacion',
    fields: {
      IDEmisorFacturaAnulada: '89890001K',
      NumSerieFacturaAnulada: '12345679/G34',
      FechaExpedicionFacturaAnulada: '01-01-2024',
      Huella: H_6_2,
      FechaHoraHusoGenRegistro: '2024-01-01T19:20:40+01:00',
    },
    input:
      'IDEmisorFacturaAnulada=89890001K&NumSerieFacturaAnulada=12345679/G34&' +
      `FechaExpedicionFacturaAnulada=01-01-2024&Huella=${H_6_2}&` +
      'FechaHoraHusoGenRegistro=2024-01-01T19:20:40+01:00',
    digest: H_6_3,
  },
] as const;

/** Los dos primeros vectores, que son los de alta. */
export const AEAT_ALTA_VECTORS = AEAT_HASH_VECTORS.filter((v) => v.kind === 'alta');

/** El vector de anulación. */
export const AEAT_ANULACION_VECTOR = AEAT_HASH_VECTORS.find((v) => v.kind === 'anulacion')!;
