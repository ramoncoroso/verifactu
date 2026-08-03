/**
 * Los `.d.ts` que se publican resuelven y tipan.
 *
 * Se compila con `--strict` **desde el proyecto temporal**, no desde el
 * repositorio: así se comprueba lo que recibe quien instala el paquete, con su
 * resolución de módulos y sus `exports`. Un `tsc --noEmit` sobre `src/` no dice
 * nada de esto.
 */

import {
  VerifactuClient,
  InvoiceBuilder,
  generateQrCode,
  type Invoice,
  type SubmitBatchResponse,
  type SubmitInvoiceResponse,
  type PacerState,
  type ChainState,
  type VatBreakdown,
  type CertificateConfig,
} from '@ramoncoroso/verifactu';

const factura: Invoice = InvoiceBuilder.create()
  .issuer('B12345678', 'Mi Empresa SL')
  .recipient('A87654321', 'Cliente SA')
  .type('F1')
  .id('FC', '0001', new Date())
  .description('Servicios')
  .addVatBreakdown(1000, 21)
  .build();

// Los campos por línea que se añadieron en #81 tienen que llegar tipados.
const lineas: VatBreakdown[] = [
  { taxBase: 800, vatRate: 21, vatAmount: 168, regime: '11', qualification: 'S1', tax: '01' },
  { taxBase: 1000, vatRate: 21, vatAmount: 210, regime: '06', costBase: 800 },
];

const certificado: CertificateConfig = { type: 'pfx', path: '/x.p12', password: 'x' };

async function usar(cliente: VerifactuClient, estado: ChainState): Promise<void> {
  const uno: SubmitInvoiceResponse = await cliente.submitInvoice(factura);
  const lote: SubmitBatchResponse = await cliente.submitInvoices([factura]);
  const pacer: PacerState = cliente.getFlowControlState();
  generateQrCode(uno.invoice, 'production', { size: 35, unit: 'mm', format: 'svg-data-uri' });
  void lote;
  void pacer;
  void estado;
  void lineas;
  void certificado;
}

void usar;
