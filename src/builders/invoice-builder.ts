/**
 * Fluent Invoice Builder for Verifactu
 *
 * Provides a fluent, type-safe API for building invoice records.
 */

import type {
  Invoice,
  InvoiceId,
  InvoiceLine,
  InvoiceReference,
} from '../models/invoice.js';
import type {
  InvoiceType,
  RectifiedInvoiceType,
  OperationRegime,
  VatRate,
  ExemptionCause,
  NonSubjectCause,
  EquivalenceSurchargeRate,
} from '../models/enums.js';
import type { Issuer, Recipient, SoftwareInfo } from '../models/party.js';
import type { TaxBreakdown, VatBreakdown, ExemptBreakdown, NonSubjectBreakdown } from '../models/tax.js';
import { createVatBreakdown, calculateTaxTotals, roundToTwoDecimals } from '../models/tax.js';
import { ValidationError, MissingFieldError } from '../errors/validation-errors.js';

/**
 * Mutable invoice ID for builder
 */
interface MutableInvoiceId {
  series?: string;
  number?: string;
  issueDate?: Date;
}

/**
 * Builder state for tracking what's been set
 */
interface BuilderState {
  issuer?: Issuer;
  invoiceType?: InvoiceType;
  id: MutableInvoiceId;
  recipients: Recipient[];
  description?: string;
  operationRegimes: OperationRegime[];
  vatBreakdowns: VatBreakdown[];
  exemptBreakdowns: ExemptBreakdown[];
  nonSubjectBreakdowns: NonSubjectBreakdown[];
  lines: InvoiceLine[];
  rectifiedInvoiceType?: RectifiedInvoiceType;
  rectifiedInvoices: InvoiceReference[];
  softwareInfo?: SoftwareInfo;
}

/**
 * Fluent builder for creating invoices
 */
export class InvoiceBuilder {
  private state: BuilderState = {
    id: {},
    recipients: [],
    operationRegimes: [],
    vatBreakdowns: [],
    exemptBreakdowns: [],
    nonSubjectBreakdowns: [],
    lines: [],
    rectifiedInvoices: [],
  };

  /**
   * Create a new invoice builder
   */
  static create(): InvoiceBuilder {
    return new InvoiceBuilder();
  }

  /**
   * Set the invoice issuer
   */
  issuer(issuer: Issuer): this;
  issuer(nif: string, name: string): this;
  issuer(issuerOrNif: Issuer | string, name?: string): this {
    if (typeof issuerOrNif === 'string') {
      this.state.issuer = {
        taxId: { type: 'NIF', value: issuerOrNif },
        name: name ?? '',
      };
    } else {
      this.state.issuer = issuerOrNif;
    }
    return this;
  }

  /**
   * Set the invoice type
   */
  type(type: InvoiceType): this {
    this.state.invoiceType = type;
    return this;
  }

  /**
   * Set invoice ID
   */
  id(number: string, issueDate?: Date): this;
  id(series: string, number: string, issueDate?: Date): this;
  id(seriesOrNumber: string, numberOrDate?: string | Date, issueDate?: Date): this {
    if (typeof numberOrDate === 'string') {
      // Called with series, number, date
      this.state.id = {
        series: seriesOrNumber,
        number: numberOrDate,
        issueDate: issueDate ?? new Date(),
      };
    } else {
      // Called with number, date
      this.state.id = {
        number: seriesOrNumber,
        issueDate: numberOrDate ?? new Date(),
      };
    }
    return this;
  }

  /**
   * Set invoice series
   */
  series(series: string): this {
    this.state.id.series = series;
    return this;
  }

  /**
   * Set invoice number
   */
  number(number: string): this {
    this.state.id.number = number;
    return this;
  }

  /**
   * Set issue date
   */
  issueDate(date: Date): this {
    this.state.id.issueDate = date;
    return this;
  }

  /**
   * Add a recipient
   */
  recipient(recipient: Recipient): this;
  recipient(nif: string, name: string): this;
  recipient(recipientOrNif: Recipient | string, name?: string): this {
    if (typeof recipientOrNif === 'string') {
      this.state.recipients.push({
        taxId: { type: 'NIF', value: recipientOrNif },
        name: name ?? '',
      });
    } else {
      this.state.recipients.push(recipientOrNif);
    }
    return this;
  }

  /**
   * Set the operation description
   */
  description(description: string): this {
    this.state.description = description;
    return this;
  }

  /**
   * Add an operation regime
   */
  regime(regime: OperationRegime): this {
    if (!this.state.operationRegimes.includes(regime)) {
      this.state.operationRegimes.push(regime);
    }
    return this;
  }

  /**
   * Add general regime (01)
   */
  generalRegime(): this {
    return this.regime('01');
  }

  /**
   * Add an invoice line
   */
  addLine(line: {
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: VatRate;
    discountPercent?: number;
  }): this {
    const discount = line.discountPercent ?? 0;
    const lineTotal = roundToTwoDecimals(
      line.quantity * line.unitPrice * (1 - discount / 100)
    );

    this.state.lines.push({
      ...line,
      lineTotal,
    });

    return this;
  }

  /**
   * Add a VAT breakdown directly
   */
  addVatBreakdown(
    taxBase: number,
    vatRate: VatRate,
    equivalenceSurchargeRate?: EquivalenceSurchargeRate
  ): this {
    this.state.vatBreakdowns.push(
      createVatBreakdown(taxBase, vatRate, equivalenceSurchargeRate)
    );
    return this;
  }

  /**
   * Add an exempt breakdown
   */
  addExemptBreakdown(taxBase: number, cause: ExemptionCause): this {
    this.state.exemptBreakdowns.push({ taxBase: roundToTwoDecimals(taxBase), cause });
    return this;
  }

  /**
   * Add a non-subject breakdown
   */
  addNonSubjectBreakdown(amount: number, cause: NonSubjectCause): this {
    this.state.nonSubjectBreakdowns.push({ amount: roundToTwoDecimals(amount), cause });
    return this;
  }

  /**
   * Set as a rectification invoice
   */
  rectification(type: RectifiedInvoiceType): this {
    this.state.invoiceType = 'F3';
    this.state.rectifiedInvoiceType = type;
    return this;
  }

  /**
   * Add a rectified invoice reference
   */
  rectifies(issuerNif: string, number: string, issueDate: Date, series?: string): this {
    const invoiceId: InvoiceId = series !== undefined
      ? { series, number, issueDate }
      : { number, issueDate };
    this.state.rectifiedInvoices.push({
      issuerTaxId: issuerNif,
      invoiceId,
    });
    return this;
  }

  /**
   * Set software info
   */
  software(info: SoftwareInfo): this {
    this.state.softwareInfo = info;
    return this;
  }

  /**
   * Calculate VAT breakdowns from lines (if not manually set)
   */
  private calculateBreakdownsFromLines(): void {
    if (this.state.vatBreakdowns.length > 0) {
      // Breakdowns already set manually
      return;
    }

    if (this.state.lines.length === 0) {
      return;
    }

    // Group lines by VAT rate
    const byRate = new Map<number, number>();
    for (const line of this.state.lines) {
      const current = byRate.get(line.vatRate) ?? 0;
      byRate.set(line.vatRate, current + (line.lineTotal ?? 0));
    }

    // Create breakdowns
    for (const [rate, taxBase] of byRate) {
      this.state.vatBreakdowns.push(createVatBreakdown(taxBase, rate));
    }
  }

  /**
   * Build the invoice
   * @throws ValidationError if required fields are missing
   */
  build(): Invoice {
    // Validate required fields
    if (!this.state.issuer) {
      throw new MissingFieldError('issuer');
    }

    if (!this.state.invoiceType) {
      throw new MissingFieldError('invoiceType');
    }

    if (!this.state.id?.number) {
      throw new MissingFieldError('id.number');
    }

    if (!this.state.id.issueDate) {
      this.state.id.issueDate = new Date();
    }

    // Calculate breakdowns from lines if needed
    this.calculateBreakdownsFromLines();

    // Ensure at least one operation regime
    if (this.state.operationRegimes.length === 0) {
      this.state.operationRegimes.push('01'); // Default to general regime
    }

    // Build tax breakdown
    const taxBreakdown: TaxBreakdown =
      this.state.vatBreakdowns.length > 0 && this.state.exemptBreakdowns.length > 0 && this.state.nonSubjectBreakdowns.length > 0
        ? { vatBreakdowns: this.state.vatBreakdowns, exemptBreakdowns: this.state.exemptBreakdowns, nonSubjectBreakdowns: this.state.nonSubjectBreakdowns }
        : this.state.vatBreakdowns.length > 0 && this.state.exemptBreakdowns.length > 0
          ? { vatBreakdowns: this.state.vatBreakdowns, exemptBreakdowns: this.state.exemptBreakdowns }
          : this.state.vatBreakdowns.length > 0 && this.state.nonSubjectBreakdowns.length > 0
            ? { vatBreakdowns: this.state.vatBreakdowns, nonSubjectBreakdowns: this.state.nonSubjectBreakdowns }
            : this.state.exemptBreakdowns.length > 0 && this.state.nonSubjectBreakdowns.length > 0
              ? { exemptBreakdowns: this.state.exemptBreakdowns, nonSubjectBreakdowns: this.state.nonSubjectBreakdowns }
              : this.state.vatBreakdowns.length > 0
                ? { vatBreakdowns: this.state.vatBreakdowns }
                : this.state.exemptBreakdowns.length > 0
                  ? { exemptBreakdowns: this.state.exemptBreakdowns }
                  : this.state.nonSubjectBreakdowns.length > 0
                    ? { nonSubjectBreakdowns: this.state.nonSubjectBreakdowns }
                    : {};

    // Validate we have at least one breakdown type
    if (
      !taxBreakdown.vatBreakdowns &&
      !taxBreakdown.exemptBreakdowns &&
      !taxBreakdown.nonSubjectBreakdowns
    ) {
      throw new ValidationError('Invoice must have at least one tax breakdown');
    }

    // Calculate totals
    const totals = calculateTaxTotals(taxBreakdown);

    // Build invoice ID
    const invoiceId: InvoiceId = this.state.id.series !== undefined
      ? { series: this.state.id.series, number: this.state.id.number, issueDate: this.state.id.issueDate }
      : { number: this.state.id.number, issueDate: this.state.id.issueDate };

    // Build the invoice
    const invoice: Invoice = {
      operationType: 'A',
      invoiceType: this.state.invoiceType,
      id: invoiceId,
      issuer: this.state.issuer,
      operationRegimes: this.state.operationRegimes,
      taxBreakdown,
      totalAmount: totals.grandTotal,
    };

    // Add optional fields
    if (this.state.recipients.length > 0) {
      (invoice as { recipients?: readonly Recipient[] }).recipients = this.state.recipients;
    }
    if (this.state.description !== undefined) {
      (invoice as { description?: string }).description = this.state.description;
    }
    if (this.state.lines.length > 0) {
      (invoice as { lines?: readonly InvoiceLine[] }).lines = this.state.lines;
    }
    if (this.state.rectifiedInvoiceType !== undefined) {
      (invoice as { rectifiedInvoiceType?: RectifiedInvoiceType }).rectifiedInvoiceType = this.state.rectifiedInvoiceType;
    }
    if (this.state.rectifiedInvoices.length > 0) {
      (invoice as { rectifiedInvoices?: readonly InvoiceReference[] }).rectifiedInvoices = this.state.rectifiedInvoices;
    }
    if (this.state.softwareInfo !== undefined) {
      (invoice as { softwareInfo?: SoftwareInfo }).softwareInfo = this.state.softwareInfo;
    }

    return invoice;
  }

  /**
   * Reset the builder state
   */
  reset(): this {
    this.state = {
      id: {},
      recipients: [],
      operationRegimes: [],
      vatBreakdowns: [],
      exemptBreakdowns: [],
      nonSubjectBreakdowns: [],
      lines: [],
      rectifiedInvoices: [],
    };
    return this;
  }
}

/**
 * Create a new invoice builder
 */
export function createInvoiceBuilder(): InvoiceBuilder {
  return InvoiceBuilder.create();
}

/**
 * Quick invoice creation helper
 */
export function quickInvoice(options: {
  issuerNif: string;
  issuerName: string;
  recipientNif?: string;
  recipientName?: string;
  number: string;
  series?: string;
  date?: Date;
  description?: string;
  items: Array<{
    description: string;
    amount: number;
    vatRate?: number;
  }>;
}): Invoice {
  const builder = InvoiceBuilder.create()
    .issuer(options.issuerNif, options.issuerName)
    .type('F1')
    .id(options.number, options.date ?? new Date());

  if (options.series) {
    builder.series(options.series);
  }

  if (options.recipientNif && options.recipientName) {
    builder.recipient(options.recipientNif, options.recipientName);
  }

  if (options.description) {
    builder.description(options.description);
  }

  for (const item of options.items) {
    builder.addVatBreakdown(item.amount, item.vatRate ?? 21);
  }

  return builder.build();
}
