/**
 * Humo sobre el PAQUETE INSTALADO, en CommonJS.
 *
 * El `package.json` promete build dual y hasta ahora nadie había ejecutado un
 * `require()` del paquete empaquetado. Si el campo `exports` o el fichero `.cjs`
 * se rompieran, la suite seguiría verde porque importa el código fuente.
 */

const v = require('@ramoncoroso/verifactu');

const fallos = [];

function check(nombre, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(`${ok ? '  ok  ' : ' FALLO'} ${nombre}`);
  if (!ok) {
    console.log(`         esperado: ${JSON.stringify(esperado)}`);
    console.log(`         obtenido: ${JSON.stringify(real)}`);
    fallos.push(nombre);
  }
}

check('require() devuelve la API', typeof v.VerifactuClient, 'function');
check('el builder viaja en el paquete', typeof v.InvoiceBuilder.create, 'function');

const factura = v.InvoiceBuilder.create()
  .issuer('B12345678', 'Mi Empresa SL')
  .recipient('A87654321', 'Cliente SA')
  .type('F1')
  .id('FC', '0001', new Date('2026-03-15T10:00:00Z'))
  .description('Servicios')
  .addVatBreakdown(1000, 21)
  .build();
check('construye la factura', factura.totalAmount, 1210);

check(
  'la huella reproduce el vector oficial',
  v.calculateAltaHash({
    IDEmisorFactura: '89890001K',
    NumSerieFactura: '12345678/G33',
    FechaExpedicionFactura: '01-01-2024',
    TipoFactura: 'F1',
    CuotaTotal: '12.35',
    ImporteTotal: '123.45',
    Huella: '',
    FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
  }),
  '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60'
);

const procesada = v.RecordChain.create().processInvoice(factura, new Date('2026-03-15T12:00:00Z'));
check('genera el QR', v.generateQrCode(procesada, 'production').data.startsWith('<svg'), true);
check('valida identificadores', v.validateSpanishTaxId('Q2826000H').valid, true);

console.log(
  fallos.length === 0
    ? '\nCJS · el paquete instalado funciona\n'
    : `\nCJS · ${fallos.length} fallo(s): ${fallos.join(' | ')}\n`
);
process.exit(fallos.length > 0 ? 1 : 0);
