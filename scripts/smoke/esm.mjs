/**
 * Humo sobre el PAQUETE INSTALADO, en ESM.
 *
 * Se ejecuta dentro de un proyecto temporal donde se ha instalado el tarball, no
 * contra `src/`. Esa es toda su razón de ser: la suite de tests importa el
 * código fuente y por eso no ve nada de lo que ocurre al empaquetar —el `exports`
 * del `package.json`, lo que entra y lo que no en `files`, si los `.d.ts` que
 * salen resuelven—. Este guion es la única capa que valida el artefacto que de
 * verdad se publica.
 *
 * Encontró dos defectos la primera vez que se ejecutó, ambos en el README.
 */

import {
  VerifactuClient,
  InvoiceBuilder,
  generateQrCode,
  buildQrUrl,
  validateSpanishTaxId,
  calculateAltaHash,
  RecordChain,
  getServiceUrl,
} from '@ramoncoroso/verifactu';
import jsQR from 'jsqr';

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

function seccion(titulo) {
  console.log(`\n— ${titulo} —`);
}

seccion('La API pública está donde dice el package.json');
for (const [nombre, valor] of Object.entries({
  VerifactuClient,
  InvoiceBuilder,
  generateQrCode,
  buildQrUrl,
  validateSpanishTaxId,
  calculateAltaHash,
  RecordChain,
  getServiceUrl,
})) {
  check(`${nombre} se importa`, typeof valor === 'function', true);
}

seccion('Construcción de facturas');
const factura = InvoiceBuilder.create()
  .issuer('B12345678', 'Mi Empresa SL')
  .recipient('A87654321', 'Cliente SA')
  .type('F1')
  .id('FC', '0001', new Date('2026-03-15T10:00:00Z'))
  .description('Servicios de consultoria')
  .addVatBreakdown(1000, 21)
  .build();
check('el builder calcula la cuota', factura.taxBreakdown.vatBreakdowns[0].vatAmount, 210);
check('el builder calcula el total', factura.totalAmount, 1210);

seccion('Huella · vector oficial 6.1 de la AEAT');
const huella = calculateAltaHash({
  IDEmisorFactura: '89890001K',
  NumSerieFactura: '12345678/G33',
  FechaExpedicionFactura: '01-01-2024',
  TipoFactura: 'F1',
  CuotaTotal: '12.35',
  ImporteTotal: '123.45',
  Huella: '',
  FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
});
check(
  'reproduce el digest publicado',
  huella,
  '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60'
);
check('es hex en mayusculas de 64', /^[0-9A-F]{64}$/.test(huella), true);

seccion('Cadena de registros');
const cadena = RecordChain.create();
const r1 = cadena.processInvoice(factura, new Date('2026-03-15T12:00:00Z'));
const r2 = cadena.processInvoice(
  { ...factura, id: { ...factura.id, number: '0002' } },
  new Date('2026-03-15T12:00:01Z')
);
check('el segundo encadena contra el primero', r2.chainReference.previousHash, r1.hash);
check('avanza dos posiciones', cadena.getState().recordCount, 2);
check(
  'no expone ninguna operacion de retroceso',
  ['revert', 'rollback', 'restore', 'undo'].some((m) => m in RecordChain.prototype),
  false
);

seccion('Codigo QR');
const qr = generateQrCode(r1, 'production', { size: 35, unit: 'mm' });
check('el SVG sale dimensionado en milimetros', /width="35mm"/.test(qr.data), true);
check(
  'la URL es la de cotejo oficial',
  qr.url.startsWith('https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?'),
  true
);
check('lleva cuatro parametros y solo cuatro', [...new URL(qr.url).searchParams.keys()].sort(), [
  'fecha',
  'importe',
  'nif',
  'numserie',
]);
check('la huella NO va dentro del QR', qr.url.includes(r1.hash), false);
check(
  'la variante no-verifactu apunta a otro servicio',
  buildQrUrl(r1, 'production', 'no-verifactu').includes('ValidarQRNoVerifactu'),
  true
);

// Rasterizar la matriz que expone el paquete y leerla con un decodificador ajeno.
// Sin esto, «el QR se genera» solo significa que salió un SVG: 21 de los 22 tests
// de QR llegaron a pasar con una imagen en blanco.
const m = qr.modules;
const n = m.length;
const escala = 4;
const borde = 4 * escala;
const lado = n * escala + borde * 2;
const px = new Uint8ClampedArray(lado * lado * 4).fill(255);
for (let y = 0; y < n; y++) {
  for (let x = 0; x < n; x++) {
    if (!m[y][x]) continue;
    for (let dy = 0; dy < escala; dy++) {
      for (let dx = 0; dx < escala; dx++) {
        const i = ((borde + y * escala + dy) * lado + (borde + x * escala + dx)) * 4;
        px[i] = px[i + 1] = px[i + 2] = 0;
      }
    }
  }
}
const leido = jsQR(px, lado, lado);
check('un lector independiente lo decodifica', leido?.data ?? '(ilegible)', qr.url);

seccion('Endpoints, tomados del WSDL');
check(
  'produccion · representante',
  getServiceUrl('production', 'representative'),
  'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP'
);
check(
  'sandbox · sello de entidad',
  getServiceUrl('sandbox', 'seal'),
  'https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP'
);

seccion('Validacion de identificadores');
check('CIF real de la AEAT', validateSpanishTaxId('Q2826000H').valid, true);
check('NIF M es persona fisica', validateSpanishTaxId('M1234567L').type, 'nif');
check('rechaza la letra de control equivocada', validateSpanishTaxId('12345678A').valid, false);

seccion('El cliente genera XML conforme');
const client = new VerifactuClient({
  environment: 'sandbox',
  certificate: { type: 'pfx', data: Buffer.from('humo'), password: 'x' },
  software: {
    name: 'humo',
    developerTaxId: 'B99999999',
    version: '1.0.0',
    installationNumber: '001',
    systemType: 'S',
  },
  flowControl: false,
});
const xml = client.buildAltaSoapBody({ ...r1 }, new Date('2026-03-15T12:00:00Z'), true);
check('lleva el registro de alta', xml.includes('RegistroAlta'), true);
check('usa el elemento del XSD con la i minuscula', xml.includes('BaseImponibleOimporteNoSujeto'), true);
check('la fecha va en dd-mm-yyyy', /FechaExpedicionFactura>15-03-2026</.test(xml), true);

seccion('Rechaza en local lo que la AEAT rechazaria');
try {
  await client.submitInvoice({
    ...factura,
    taxBreakdown: { vatBreakdowns: [{ taxBase: 100, vatRate: 10, vatAmount: 10, regime: '11' }] },
  });
  check('regimen 11 con tipo distinto de 21', 'no lanzo', 'deberia lanzar');
} catch (e) {
  check(
    'regimen 11 con tipo distinto de 21 (error 1206)',
    e.constructor.name === 'ValidationError' && /ClaveRegimen 11/.test(e.message),
    true
  );
}
try {
  await client.submitInvoice({ ...factura, description: '' });
  check('factura sin descripcion', 'no lanzo', 'deberia lanzar');
} catch (e) {
  check('factura sin descripcion (el XSD la exige)', /DescripcionOperacion/.test(e.message), true);
}

console.log(
  fallos.length === 0
    ? '\nESM · el paquete instalado funciona\n'
    : `\nESM · ${fallos.length} fallo(s): ${fallos.join(' | ')}\n`
);
process.exit(fallos.length > 0 ? 1 : 0);
