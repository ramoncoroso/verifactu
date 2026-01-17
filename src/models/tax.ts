/**
 * Tax-related models for Verifactu
 */

import type { ExemptionCause, NonSubjectCause, VatRate, EquivalenceSurchargeRate } from './enums.js';

/**
 * VAT breakdown item (Desglose IVA)
 */
export interface VatBreakdown {
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
}

/**
 * Exempt operation breakdown
 */
export interface ExemptBreakdown {
  /** Exemption cause */
  readonly cause: ExemptionCause;
  /** Tax base amount */
  readonly taxBase: number;
}

/**
 * Non-subject operation breakdown
 */
export interface NonSubjectBreakdown {
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
