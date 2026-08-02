/**
 * Tax-related models for Verifactu
 */

import type {
  CalificacionOperacion,
  EquivalenceSurchargeRate,
  ExemptionCause,
  Impuesto,
  NonSubjectCause,
  OperationRegime,
  VatRate,
} from './enums.js';

/**
 * Campos que el XSD sitúa en `DetalleType`, es decir **por línea**.
 *
 * Estaban cableados a `01`/`S1`/`01` y `Invoice.operationRegimes` no llegaba
 * jamás al XML, así que un arrendamiento de local (clave 11), una exportación
 * (02) o una operación con inversión del sujeto pasivo (S2) eran inexpresables:
 * el valor se descartaba en silencio y se declaraba régimen general lo que no
 * lo era.
 *
 * Todos son opcionales y conservan el valor por defecto anterior.
 */
interface LineaDesgloseComun {
  /**
   * `ClaveRegimen` (L8A/L8B). Por defecto, el primero de
   * `Invoice.operationRegimes` y, en su ausencia, `'01'` (régimen general).
   */
  readonly regime?: OperationRegime;
  /** `Impuesto`. Por defecto `'01'` (IVA). */
  readonly tax?: Impuesto;
}

/**
 * VAT breakdown item (Desglose IVA)
 */
export interface VatBreakdown extends LineaDesgloseComun {
  /** Tax base amount */
  readonly taxBase: number;
  /** VAT rate percentage */
  readonly vatRate: VatRate;
  /** VAT amount (calculated) */
  readonly vatAmount: number;
  /** Equivalence surcharge rate (optional, for retail) */
  readonly equivalenceSurchargeRate?: EquivalenceSurchargeRate;
  /** Equivalence surcharge amount */
  readonly equivalenceSurchargeAmount?: number;
  /**
   * `CalificacionOperacion`. Por defecto `'S1'` (sujeta y no exenta sin
   * inversión del sujeto pasivo). Con `'S2'`, tipo y cuota han de ser 0.
   */
  readonly qualification?: CalificacionOperacion;
  /**
   * `BaseImponibleACoste`. Obligatorio con el régimen `06` (grupo de entidades,
   * nivel avanzado) y solo admisible ahí o con `Impuesto` `02`/`05`.
   */
  readonly costBase?: number;
}

/**
 * Exempt operation breakdown
 */
export interface ExemptBreakdown extends LineaDesgloseComun {
  /** Exemption cause */
  readonly cause: ExemptionCause;
  /** Tax base amount */
  readonly taxBase: number;
}

/**
 * Non-subject operation breakdown
 */
export interface NonSubjectBreakdown extends LineaDesgloseComun {
  /** Non-subject cause */
  readonly cause: NonSubjectCause;
  /** Amount */
  readonly amount: number;
}

/**
 * Complete tax breakdown for an invoice
 */
export interface TaxBreakdown {
  /** Subject and non-exempt operations */
  readonly vatBreakdowns?: readonly VatBreakdown[];
  /** Exempt operations */
  readonly exemptBreakdowns?: readonly ExemptBreakdown[];
  /** Non-subject operations */
  readonly nonSubjectBreakdowns?: readonly NonSubjectBreakdown[];
}

/**
 * Tax totals summary
 */
export interface TaxTotals {
  /** Total tax base */
  readonly totalTaxBase: number;
  /** Total VAT amount */
  readonly totalVat: number;
  /** Total equivalence surcharge */
  readonly totalEquivalenceSurcharge: number;
  /** Grand total (tax base + VAT + surcharge) */
  readonly grandTotal: number;
}

/**
 * Calculate VAT amount from tax base and rate
 */
export function calculateVatAmount(taxBase: number, vatRate: number): number {
  return roundToTwoDecimals((taxBase * vatRate) / 100);
}

/**
 * Calculate equivalence surcharge amount
 */
export function calculateEquivalenceSurcharge(taxBase: number, rate: number): number {
  return roundToTwoDecimals((taxBase * rate) / 100);
}

/**
 * Round to two decimal places (for monetary amounts)
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Create a VAT breakdown with calculated amounts
 */
export function createVatBreakdown(
  taxBase: number,
  vatRate: VatRate,
  equivalenceSurchargeRate?: EquivalenceSurchargeRate
): VatBreakdown {
  const vatAmount = calculateVatAmount(taxBase, vatRate);
  const breakdown: VatBreakdown = {
    taxBase: roundToTwoDecimals(taxBase),
    vatRate,
    vatAmount,
  };

  if (equivalenceSurchargeRate !== undefined) {
    return {
      ...breakdown,
      equivalenceSurchargeRate,
      equivalenceSurchargeAmount: calculateEquivalenceSurcharge(taxBase, equivalenceSurchargeRate),
    };
  }

  return breakdown;
}

/**
 * Calculate tax totals from a tax breakdown
 */
export function calculateTaxTotals(breakdown: TaxBreakdown): TaxTotals {
  let totalTaxBase = 0;
  let totalVat = 0;
  let totalEquivalenceSurcharge = 0;

  if (breakdown.vatBreakdowns) {
    for (const vat of breakdown.vatBreakdowns) {
      totalTaxBase += vat.taxBase;
      totalVat += vat.vatAmount;
      if (vat.equivalenceSurchargeAmount !== undefined) {
        totalEquivalenceSurcharge += vat.equivalenceSurchargeAmount;
      }
    }
  }

  if (breakdown.exemptBreakdowns) {
    for (const exempt of breakdown.exemptBreakdowns) {
      totalTaxBase += exempt.taxBase;
    }
  }

  if (breakdown.nonSubjectBreakdowns) {
    for (const nonSubject of breakdown.nonSubjectBreakdowns) {
      totalTaxBase += nonSubject.amount;
    }
  }

  return {
    totalTaxBase: roundToTwoDecimals(totalTaxBase),
    totalVat: roundToTwoDecimals(totalVat),
    totalEquivalenceSurcharge: roundToTwoDecimals(totalEquivalenceSurcharge),
    grandTotal: roundToTwoDecimals(totalTaxBase + totalVat + totalEquivalenceSurcharge),
  };
}

/**
 * `CuotaTotal` del registro de facturación.
 *
 * **Incluye el recargo de equivalencia.** Lo confirma el código de error oficial
 * 2006 de la AEAT: *«El campo CuotaTotal tiene un valor incorrecto para el valor
 * de los campos CuotaRepercutida y CuotaRecargoEquivalencia suministrados»*.
 *
 * Es la única fuente del valor. Antes se calculaba en tres sitios con un `reduce`
 * en línea que sumaba solo `vatAmount`, mientras el validador de negocio sí sumaba
 * el recargo: tres puntos del código en desacuerdo sobre qué es el total, y uno de
 * ellos alimentando la huella.
 */
export function calculateCuotaTotal(breakdown: TaxBreakdown): number {
  const { totalVat, totalEquivalenceSurcharge } = calculateTaxTotals(breakdown);
  return roundToTwoDecimals(totalVat + totalEquivalenceSurcharge);
}
