/**
 * Tests for Tax Models
 */

import { describe, it, expect } from 'vitest';
import {
  calculateVatAmount,
  calculateEquivalenceSurcharge,
  roundToTwoDecimals,
  createVatBreakdown,
  calculateTaxTotals,
} from '../../src/models/tax.js';
import type { TaxBreakdown } from '../../src/models/tax.js';

describe('Tax Models', () => {
  describe('roundToTwoDecimals', () => {
    it('should round to two decimal places', () => {
      expect(roundToTwoDecimals(10.125)).toBe(10.13);
      expect(roundToTwoDecimals(10.124)).toBe(10.12);
      expect(roundToTwoDecimals(10.1)).toBe(10.1);
      expect(roundToTwoDecimals(10)).toBe(10);
    });
  });

  describe('calculateVatAmount', () => {
    it('should calculate VAT at 21%', () => {
      expect(calculateVatAmount(100, 21)).toBe(21);
    });

    it('should calculate VAT at 10%', () => {
      expect(calculateVatAmount(100, 10)).toBe(10);
    });

    it('should calculate VAT at 4%', () => {
      expect(calculateVatAmount(100, 4)).toBe(4);
    });

    it('should calculate VAT at 0%', () => {
      expect(calculateVatAmount(100, 0)).toBe(0);
    });

    it('should round VAT to two decimals', () => {
      expect(calculateVatAmount(33.33, 21)).toBe(7);
    });
  });

  describe('calculateEquivalenceSurcharge', () => {
    it('should calculate equivalence surcharge at 5.2%', () => {
      expect(calculateEquivalenceSurcharge(100, 5.2)).toBe(5.2);
    });

    it('should calculate equivalence surcharge at 1.4%', () => {
      expect(calculateEquivalenceSurcharge(100, 1.4)).toBe(1.4);
    });

    it('should round to two decimals', () => {
      expect(calculateEquivalenceSurcharge(33.33, 5.2)).toBe(1.73);
    });
  });

  describe('createVatBreakdown', () => {
    it('should create breakdown without equivalence surcharge', () => {
      const breakdown = createVatBreakdown(100, 21);

      expect(breakdown.taxBase).toBe(100);
      expect(breakdown.vatRate).toBe(21);
      expect(breakdown.vatAmount).toBe(21);
      expect(breakdown.equivalenceSurchargeRate).toBeUndefined();
      expect(breakdown.equivalenceSurchargeAmount).toBeUndefined();
    });

    it('should create breakdown with equivalence surcharge', () => {
      const breakdown = createVatBreakdown(100, 21, 5.2);

      expect(breakdown.taxBase).toBe(100);
      expect(breakdown.vatRate).toBe(21);
      expect(breakdown.vatAmount).toBe(21);
      expect(breakdown.equivalenceSurchargeRate).toBe(5.2);
      expect(breakdown.equivalenceSurchargeAmount).toBe(5.2);
    });

    it('should calculate equivalence surcharge correctly', () => {
      const breakdown = createVatBreakdown(200, 21, 1.4);

      expect(breakdown.equivalenceSurchargeRate).toBe(1.4);
      expect(breakdown.equivalenceSurchargeAmount).toBe(2.8);
    });
  });

  describe('calculateTaxTotals', () => {
    it('should calculate totals for simple VAT breakdown', () => {
      const breakdown: TaxBreakdown = {
        vatBreakdowns: [
          { taxBase: 100, vatRate: 21, vatAmount: 21 },
        ],
      };

      const totals = calculateTaxTotals(breakdown);

      expect(totals.totalTaxBase).toBe(100);
      expect(totals.totalVat).toBe(21);
      expect(totals.totalEquivalenceSurcharge).toBe(0);
      expect(totals.grandTotal).toBe(121);
    });

    it('should calculate totals with multiple VAT breakdowns', () => {
      const breakdown: TaxBreakdown = {
        vatBreakdowns: [
          { taxBase: 100, vatRate: 21, vatAmount: 21 },
          { taxBase: 50, vatRate: 10, vatAmount: 5 },
        ],
      };

      const totals = calculateTaxTotals(breakdown);

      expect(totals.totalTaxBase).toBe(150);
      expect(totals.totalVat).toBe(26);
      expect(totals.grandTotal).toBe(176);
    });

    it('should calculate totals with equivalence surcharge', () => {
      const breakdown: TaxBreakdown = {
        vatBreakdowns: [
          {
            taxBase: 100,
            vatRate: 21,
            vatAmount: 21,
            equivalenceSurchargeRate: 5.2,
            equivalenceSurchargeAmount: 5.2
          },
        ],
      };

      const totals = calculateTaxTotals(breakdown);

      expect(totals.totalTaxBase).toBe(100);
      expect(totals.totalVat).toBe(21);
      expect(totals.totalEquivalenceSurcharge).toBe(5.2);
      expect(totals.grandTotal).toBe(126.2);
    });

    it('should calculate totals with exempt breakdowns', () => {
      const breakdown: TaxBreakdown = {
        exemptBreakdowns: [
          { cause: 'E1', taxBase: 100 },
        ],
      };

      const totals = calculateTaxTotals(breakdown);

      expect(totals.totalTaxBase).toBe(100);
      expect(totals.totalVat).toBe(0);
      expect(totals.grandTotal).toBe(100);
    });

    it('should calculate totals with non-subject breakdowns', () => {
      const breakdown: TaxBreakdown = {
        nonSubjectBreakdowns: [
          { cause: 'RL', amount: 50 },
        ],
      };

      const totals = calculateTaxTotals(breakdown);

      expect(totals.totalTaxBase).toBe(50);
      expect(totals.totalVat).toBe(0);
      expect(totals.grandTotal).toBe(50);
    });

    it('should calculate totals with mixed breakdowns', () => {
      const breakdown: TaxBreakdown = {
        vatBreakdowns: [
          { taxBase: 100, vatRate: 21, vatAmount: 21 },
        ],
        exemptBreakdowns: [
          { cause: 'E1', taxBase: 50 },
        ],
        nonSubjectBreakdowns: [
          { cause: 'RL', amount: 25 },
        ],
      };

      const totals = calculateTaxTotals(breakdown);

      expect(totals.totalTaxBase).toBe(175);
      expect(totals.totalVat).toBe(21);
      expect(totals.grandTotal).toBe(196);
    });

    it('should handle empty breakdown', () => {
      const breakdown: TaxBreakdown = {};

      const totals = calculateTaxTotals(breakdown);

      expect(totals.totalTaxBase).toBe(0);
      expect(totals.totalVat).toBe(0);
      expect(totals.totalEquivalenceSurcharge).toBe(0);
      expect(totals.grandTotal).toBe(0);
    });
  });
});
