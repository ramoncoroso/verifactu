# Verifactu

Librería TypeScript para el sistema **Veri\*Factu** de la AEAT. Genera el registro de facturación,
la huella encadenada, el XML, el QR y lo envía por SOAP con certificado electrónico.

**[Read this in English](README.en.md)**

[![CI](https://github.com/ramoncoroso/verifactu/actions/workflows/ci.yml/badge.svg)](https://github.com/ramoncoroso/verifactu/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ramoncoroso/verifactu/branch/main/graph/badge.svg)](https://codecov.io/gh/ramoncoroso/verifactu)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Dependencies](https://img.shields.io/badge/dependencias-1%20(0%20transitivas)-brightgreen.svg)]()

> ### Estado
>
> Los **once defectos bloqueantes** que detectó la auditoría de conformidad están corregidos y
> verificados contra fuentes oficiales de la AEAT. Falta la validación contra el entorno de
> **preproducción real**, que requiere un certificado electrónico válido, así que trátala como
> *release candidate*: apta para integrar y probar, pendiente de la última prueba de campo.
>
> El histórico completo está en [`docs/AUDITORIA_CONFORMIDAD.md`](docs/AUDITORIA_CONFORMIDAD.md).

---

## Índice

- [Por qué esta librería](#por-qué-esta-librería)
- [Instalación](#instalación)
- [Inicio rápido](#inicio-rápido)
- [Facturas](#facturas)
  - [Factura simple](#factura-simple) · [Varios tipos de IVA](#varios-tipos-de-iva) ·
    [Recargo de equivalencia](#recargo-de-equivalencia) · [Exentas y no sujetas](#exentas-y-no-sujetas) ·
    [Rectificativas](#rectificativas) · [Simplificada](#factura-simplificada-f2)
- [Regímenes especiales](#regímenes-especiales)
- [Envío](#envío)
  - [Control de flujo](#control-de-flujo-art-162) · [Envío por lotes](#envío-por-lotes) ·
    [Anulación](#anulación) · [Consulta](#consulta)
- [La cadena de registros](#la-cadena-de-registros)
- [Código QR](#código-qr)
- [Errores](#errores)
- [Certificados](#certificados)
- [Validación](#validación)
- [Ajustes del cliente](#ajustes-del-cliente)
- [Conformidad](#conformidad-qué-se-verifica-y-contra-qué)
- [Desarrollo](#desarrollo)

---

## Por qué esta librería

**Una sola dependencia en tiempo de ejecución.** `qrcode-generator` (MIT, cero transitivas), y solo
porque el art. 21 de la Orden HAC/1177/2024 impone un QR conforme a ISO/IEC 18004. Todo lo demás
—SHA-256, TLS con certificado de cliente, SOAP, XML— usa APIs nativas de Node.

**Se verifica contra fuentes externas, no contra sí misma.** Los XSD, el WSDL y el catálogo de
errores de la AEAT están vendorizados en `schemas/` y congelados por sha256; los tests validan el
XML generado contra ellos, reproducen los vectores de huella publicados y **decodifican** el QR
generado con un lector independiente. Ver [Conformidad](#conformidad-qué-se-verifica-y-contra-qué).

**Cumple el control de flujo del art. 16.2**, que es un «deberán implementar», no una recomendación.

## Instalación

```bash
npm install @ramoncoroso/verifactu
```

```typescript
import { VerifactuClient } from '@ramoncoroso/verifactu';
```

> Va con alcance porque el nombre `verifactu` a secas lo tiene reservado un tercero en npm desde
> 2024 —una versión de 223 bytes que nunca se ha tocado—. También puedes instalarla directamente
> del repositorio: `npm install github:ramoncoroso/verifactu`.

Requiere **Node.js ≥ 18**. ESM y CommonJS.

## Inicio rápido

```typescript
import { VerifactuClient, InvoiceBuilder } from '@ramoncoroso/verifactu';

const client = new VerifactuClient({
  environment: 'sandbox',
  certificate: { type: 'pfx', path: process.env.CERT_PATH!, password: process.env.CERT_PASSWORD! },
  software: {
    name: 'Mi ERP',
    developerTaxId: 'B12345678',
    version: '1.0.0',
    installationNumber: '001',
    systemType: 'S', // 'S' si el sistema solo puede operar en modo Veri*Factu
  },
});

const factura = InvoiceBuilder.create()
  .issuer('B12345678', 'Mi Empresa SL')
  .recipient('A87654321', 'Cliente SA')
  .type('F1')
  .id('FC', '0001', new Date())
  .description('Servicios de consultoría')
  .addVatBreakdown(1000, 21)
  .build();

const r = await client.submitInvoice(factura);
console.log(r.accepted, r.csv, r.invoice.hash);
```

---

## Facturas

### Factura simple

```typescript
const factura = InvoiceBuilder.create()
  .issuer('B12345678', 'Mi Empresa SL')
  .recipient('A87654321', 'Cliente SA')
  .type('F1')
  .id('FC', '0001', new Date('2026-03-15'))
  .description('Mantenimiento anual')
  .addVatBreakdown(1000, 21) // base 1000 → cuota 210, total 1210
  .build();
```

`addVatBreakdown(base, tipo)` calcula la cuota y el total. Si prefieres darlos tú, construye el
objeto `Invoice` a mano: todos sus campos son públicos y `readonly`.

### Varios tipos de IVA

Una factura puede llevar tantas líneas de desglose como haga falta, hasta doce.

```typescript
const factura = InvoiceBuilder.create()
  .issuer('B12345678', 'Mi Empresa SL')
  .recipient('A87654321', 'Cliente SA')
  .type('F1')
  .id('FC', '0002', new Date())
  .description('Suministros varios')
  .addVatBreakdown(1000, 21) //  general
  .addVatBreakdown(500, 10)  //  reducido
  .addVatBreakdown(200, 4)   //  superreducido
  .build();
// ImporteTotal = 1910,00 · CuotaTotal = 280,00
```

### Recargo de equivalencia

Va en la misma línea que su IVA y **entra en `CuotaTotal`**; omitirlo hace que la AEAT rechace el
registro con el error 2006.

```typescript
const factura: Invoice = {
  operationType: 'A',
  invoiceType: 'F1',
  issuer: { taxId: { type: 'NIF', value: 'B12345678' }, name: 'Mayorista SL' },
  recipients: [{ taxId: { type: 'NIF', value: '12345678Z' }, name: 'Minorista' }],
  id: { series: 'FC', number: '0003', issueDate: new Date() },
  description: 'Venta a minorista en recargo',
  operationRegimes: ['01'],
  taxBreakdown: {
    vatBreakdowns: [
      {
        taxBase: 1000,
        vatRate: 21,
        vatAmount: 210,
        equivalenceSurchargeRate: 5.2,
        equivalenceSurchargeAmount: 52,
      },
    ],
  },
  totalAmount: 1262,
};
```

### Exentas y no sujetas

Son bloques distintos y ambos llegan al XML. La no sujeción **no** tiene elemento propio: se expresa
con `CalificacionOperacion` `N1` (art. 7, 14 y otros) o `N2` (reglas de localización).

```typescript
const factura = InvoiceBuilder.create()
  .issuer('B12345678', 'Exportadora SL')
  .recipient('A87654321', 'Cliente SA')
  .type('F1')
  .id('FC', '0004', new Date())
  .description('Exportación y suplidos')
  .addVatBreakdown(1000, 21)
  .addExemptBreakdown(500, 'E1')     // exenta por el art. 20
  .addNonSubjectBreakdown(120, 'N1') // suplidos
  .build();
```

Causas de exención: `E1` (art. 20) · `E2` (art. 21) · `E3` (art. 22) · `E4` (arts. 23 y 24) ·
`E5` (art. 25) · `E6` (otros).

> **`E2` y `E3` no caben en régimen general.** La AEAT lo rechaza con el error 1199: una
> exportación va con su propia `ClaveRegimen` (`02`), no con la `01`. La librería lo comprueba
> antes de enviar, así que el fallo sale como error local:
>
> ```typescript
> taxBreakdown: { exemptBreakdowns: [{ cause: 'E2', taxBase: 500, regime: '02' }] }
> ```

### Rectificativas

```typescript
const rectificativa = InvoiceBuilder.create()
  .issuer('B12345678', 'Mi Empresa SL')
  .recipient('A87654321', 'Cliente SA')
  .type('R1')            // R1: error fundado en derecho o art. 80.Uno/Dos/Seis
  .rectification('I')    // 'I' por diferencias · 'S' por sustitución
  .rectifies('B12345678', '0001', new Date('2026-03-15'), 'FC')
  .id('FR', '0001', new Date())
  .description('Rectificación de la factura FC0001')
  .addVatBreakdown(-200, 21)
  .build();
```

### Factura simplificada (F2)

Sin destinatario: la AEAT lo rechaza si se informa (error 1190).

```typescript
const ticket = InvoiceBuilder.create()
  .issuer('B12345678', 'Bar Pepe')
  .type('F2')
  .id('T', '000123', new Date())
  .description('Consumiciones')
  .addVatBreakdown(9.09, 10)
  .build();
```

---

## Regímenes especiales

`ClaveRegimen`, `CalificacionOperacion` e `Impuesto` viven **en la línea de desglose**, no en la
factura. El valor por defecto es régimen general (`01`), operación sujeta y no exenta (`S1`) e IVA
(`01`).

```typescript
const factura: Invoice = {
  // …
  taxBreakdown: {
    vatBreakdowns: [
      { taxBase: 800, vatRate: 21, vatAmount: 168, regime: '11' }, // arrendamiento de local
      { taxBase: 500, vatRate: 21, vatAmount: 105, regime: '07' }, // criterio de caja
      { taxBase: 300, vatRate: 7, vatAmount: 21, regime: '01', tax: '03' }, // IGIC
    ],
  },
  totalAmount: 1894,
};
```

**Inversión del sujeto pasivo** — con `S2`, el tipo y la cuota valen 0 por definición:

```typescript
vatBreakdowns: [{ taxBase: 1000, vatRate: 0, vatAmount: 0, qualification: 'S2' }];
```

**Grupo de entidades, nivel avanzado** (régimen `06`) — exige `BaseImponibleACoste`:

```typescript
vatBreakdowns: [{ taxBase: 1000, vatRate: 21, vatAmount: 210, regime: '06', costBase: 800 }];
```

La librería comprueba **antes de enviar** las reglas de coherencia que la AEAT publica en
`errores.properties` y que provocarían el rechazo del registro: régimen `08` exige `N2` (1252),
`03` solo admite `S1` (1200), `04` exige `S2` o exenta (1201), `11` exige el 21 % (1206),
`10` exige `N1` + `F1` + destinatario con NIF (1205), y así con doce reglas más. Un rechazo remoto
—con la huella ya impresa en una factura entregada— se convierte en un error local.

---

## Envío

### Control de flujo (art. 16.2)

> «Los sistemas informáticos "VERI\*FACTU" **deberán implementar un mecanismo de control de flujo**
> basado en el tiempo de espera entre envíos, el cual tomará inicialmente el valor de 60 segundos.»

Va **activo por defecto**. El primer envío sale de inmediato; el siguiente espera lo que falte de
`t` **contado desde el envío anterior**, no desde su respuesta. La AEAT devuelve el valor vigente en
cada respuesta y la librería lo aplica.

```typescript
const r1 = await client.submitInvoice(f1); // sale ya
console.log(r1.tiempoEsperaEnvioSeconds);  // p. ej. 60
const r2 = await client.submitInvoice(f2); // espera lo que falte
```

Un pacer en memoria no protege a un proceso que reinicia, así que **persiste su estado**:

```typescript
await guardar(client.getFlowControlState()); // { waitSeconds, lastSubmissionAt }

// Al arrancar de nuevo:
const client = new VerifactuClient({
  /* … */
  flowControl: { state: await cargar() },
});
```

Si gobiernas la cadencia fuera de la librería —una cola compartida entre varios procesos, por
ejemplo— desactívalo con `flowControl: false`. La responsabilidad pasa a ser tuya.

### Envío por lotes

Es la otra rama del art. 16.2: esperar `t` segundos **o** acumular registros hasta el límite del
diseño de registro, *la circunstancia que ocurra primero*. Hasta **1000** registros por petición,
que consumen **un solo** hueco de cadencia.

```typescript
const lote = await client.submitInvoices([f1, f2, f3]);

console.log(lote.estadoEnvio);              // 'Correcto' | 'ParcialmenteCorrecto' | 'Incorrecto'
console.log(lote.tiempoEsperaEnvioSeconds); // para el siguiente envío

for (const r of lote.results) {
  console.log(r.invoice.id.number, r.state, r.errorCode ?? '');
}
```

> `estadoEnvio` es global y **no sirve para decidir nada por registro**: `ParcialmenteCorrecto` no
> implica que haya rechazos, basta un `AceptadoConErrores`. Usa el `state` de cada resultado.

El lote se valida entero antes de tocar la cadena: **todo o nada**.

### Anulación

Viaja en el mismo mensaje `RegFactuSistemaFacturacion` que las altas y ocupa su propia posición en
la cadena.

```typescript
const r = await client.cancelInvoice(
  { series: 'FC', number: '0001', issueDate: new Date('2026-03-15') },
  { taxId: { type: 'NIF', value: 'B12345678' }, name: 'Mi Empresa SL' },
  'Error en los datos del destinatario'
);
```

### Consulta

```typescript
const estado = await client.checkInvoiceStatus(
  { series: 'FC', number: '0001', issueDate: new Date('2026-03-15') },
  'B12345678'
);
```

---

## La cadena de registros

Cada registro incluye la huella del anterior. La cadena es **local**: se genera al expedir la
factura y **no retrocede** aunque la AEAT rechace el registro, porque su huella ya va impresa en el
QR de una factura probablemente entregada. Suprimir un registro generado es lo que prohíben los
arts. 7 y 10 del RRSIF; el remedio ante un rechazo es un **alta de subsanación**.

```typescript
const estado = client.getChainState();
await db.guardar(estado); // { lastHash, lastNumber, lastDate, lastSeries, lastIssuerNif, … }

// Tras un reinicio, la cadena continúa exactamente donde estaba:
const client = new VerifactuClient({ /* … */, chainState: await db.cargar() });
```

Guarda el estado **después de cada envío**. `RecordChain` no expone `revert`, `rollback` ni
`restore`: retroceder no es una operación legal.

---

## Código QR

El contenido son **cuatro parámetros y solo cuatro** —NIF, número de serie, fecha e importe—.
La huella **no** va en el QR.

```typescript
import { generateQrCode } from '@ramoncoroso/verifactu';

const r = await client.submitInvoice(factura);

// SVG dimensionado en milímetros, como pide la norma (30–40 mm impresos)
const qr = generateQrCode(r.invoice, 'production', { size: 35, unit: 'mm' });
qr.data;    // '<svg …>'
qr.url;     // https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=…
qr.version; // 7–11 para Veri*Factu

// Data URI, para incrustarlo en un <img> de un HTML o un PDF
const uri = generateQrCode(r.invoice, 'production', { format: 'svg-data-uri', size: 300 });
// uri.data → 'data:image/svg+xml;base64,…'
```

Junto al QR, la factura debe llevar impresa la leyenda **«Factura verificable en la sede
electrónica de la AEAT»** o **«VERI\*FACTU»**.

Para sistemas que **no** emiten facturas verificables, la URL de cotejo es otra:

```typescript
import { buildQrUrl } from '@ramoncoroso/verifactu';
const url = buildQrUrl(r.invoice, 'production', 'no-verifactu'); // …/ValidarQRNoVerifactu
```

---

## Errores

Todos derivan de `VerifactuError` y llevan un código estable (`VF1000`, `VF4000`…).

```typescript
import {
  VerifactuError,
  ValidationError,
  CertificateError,
  HttpStatusError,
  SoapError,
  AeatError,
} from '@ramoncoroso/verifactu';

try {
  await client.submitInvoice(factura);
} catch (e) {
  if (e instanceof ValidationError) {
    // La factura no es emisible. La cadena NO se ha movido.
    console.error(e.message, e.context);
  } else if (e instanceof CertificateError) {
    // Incluye el diagnóstico de los .p12 con cifrado heredado.
    console.error(e.message);
  } else if (e instanceof HttpStatusError) {
    console.error(e.statusCode, e.responseBody);
  } else if (e instanceof SoapError) {
    console.error(e.soapFaultCode, e.aeatCode); // p. ej. '4102'
  } else if (e instanceof VerifactuError) {
    console.error(e.code, e.isRetryable());
  }
}
```

**Rechazo ≠ excepción.** Un registro rechazado por la AEAT es una respuesta normal, no un error:

```typescript
const r = await client.submitInvoice(factura);
if (!r.accepted) {
  console.error(r.state, r.errorCode, r.errorDescription);
  // El remedio normativo es un alta de subsanación, no reenviar lo mismo.
}
if (r.alreadyRegistered) {
  // El registro ya constaba. Tampoco es un fallo.
}
```

### Reintentos

Con backoff exponencial y jitter. Solo se reintenta el **envío**: el registro y su huella se generan
una sola vez, de modo que los dos intentos mandan **exactamente los mismos bytes**.

```typescript
const r = await client.submitInvoiceWithRetry(factura, {
  maxRetries: 3,
  initialDelayMs: 1000,
  onRetry: (intento, error, esperaMs) => log.warn({ intento, esperaMs }, error.message),
});
```

Qué se reintenta y qué no: los errores de red y los 5xx/408/425/429 sí; un 4xx no; un `SOAPFault`
solo si su `faultcode` es `soapenv:Server`, que es lo que instruye la AEAT.

---

## Certificados

```typescript
// Desde fichero
certificate: { type: 'pfx', path: '/ruta/cert.p12', password: process.env.CERT_PASSWORD! }

// Desde memoria (útil en contenedores: el secreto llega en base64)
certificate: { type: 'pfx', data: Buffer.from(process.env.CERT_B64!, 'base64'), password: '…' }

// PEM separado
certificate: { type: 'pem', certPath: '/ruta/cert.pem', keyPath: '/ruta/key.pem' }
```

**Certificados antiguos de la FNMT.** Node 18+ va contra OpenSSL 3, que ya no trae RC2/RC4 en su
proveedor por defecto. Si tu `.p12` es de una exportación antigua, la librería lo detecta y te dice
qué hacer en vez de devolverte un error de red opaco:

```
El certificado usa cifrado heredado (RC2/RC4), que OpenSSL 3 —el que lleva Node 18+—
no incluye en su proveedor por defecto. […] La contraseña es correcta: el problema es el algoritmo.

Opción A (recomendada) · reexportar con cifrado moderno:
  openssl pkcs12 -legacy -in certificado-antiguo.p12 -nodes -out temporal.pem
  openssl pkcs12 -export -in temporal.pem -out certificado-nuevo.p12
  shred -u temporal.pem     # rm -P en macOS. El PEM lleva la clave SIN cifrar.
```

Una contraseña incorrecta da un mensaje distinto, a propósito: no manda a nadie a reexportar nada.

---

## Validación

```typescript
import { validateSpanishTaxId, validateInvoice, validateInvoiceBusinessRules } from '@ramoncoroso/verifactu';

validateSpanishTaxId('Q2826000H'); // { valid: true, type: 'cif',  normalized: 'Q2826000H' }
validateSpanishTaxId('M1234567L'); // { valid: true, type: 'nif' }  ← K/L/M son persona física
validateSpanishTaxId('12345678A'); // { valid: false, error: 'Invalid control letter: expected Z' }

const esquema = validateInvoice(factura);   // estructura
const negocio = validateInvoiceBusinessRules(factura); // reglas AEAT
if (!esquema.valid) console.error(esquema.violations);
```

---

## Ajustes del cliente

```typescript
const client = new VerifactuClient({
  environment: 'sandbox',
  certificate: { /* … */ },
  software: { /* … */ },

  timeout: 30_000,        // ms por petición
  maxConcurrency: 4,      // peticiones simultáneas (distinto del control de flujo)
  queueTimeout: 30_000,   // espera máxima en cola
  retry: { maxRetries: 3, initialDelayMs: 1000 },
  flowControl: { state: guardado },
  chainState: cadenaGuardada,
  logger: {               // cualquier objeto con estos cuatro métodos
    debug: (m, c) => log.debug(c, m),
    info:  (m, c) => log.info(c, m),
    warn:  (m, c) => log.warn(c, m),
    error: (m, c) => log.error(c, m),
  },
});
```

El logger recibe el XML **saneado**: NIF, nombres y huellas no se escriben enteros.

---

## Conformidad: qué se verifica y contra qué

El riesgo de una librería fiscal no es que falle, es que **pase los tests y no sea conforme**. Por
eso ningún test de conformidad usa la implementación como oráculo:

| Nivel | Oráculo externo | Qué caza |
|---|---|---|
| Vectores de huella | Los tres ejemplos encadenados que publica la AEAT | Orden de campos, `trim`, formato de fecha con huso, hex en mayúsculas |
| Validación XSD | `SuministroLR.xsd` y `SuministroInformacion.xsd` vendorizados | Estructura, orden, espacios de nombres, valores de enumerado |
| Decodificación de QR | `jsqr`, un lector independiente | Que el QR **se lea** y diga lo que debe |
| WSDL | `SistemaFacturacion.wsdl` | Endpoints, `SOAPAction`, nombres de operación |
| Catálogo de errores | `errores.properties` | Las reglas de coherencia del desglose |

Los esquemas están **congelados por sha256**: si la AEAT publica una revisión, el CI falla y obliga
a revisar el diff en lugar de arrastrarlo en silencio (`npm run schemas:check`).

Puntos ciegos **medidos**, para que nadie confíe de más en el XSD: una huella en Base64 valida
contra el esquema, y un `FechaHoraHusoGenRegistro` sin huso también. Por eso los vectores oficiales
no son redundantes.

---

## Desarrollo

```bash
npm run build            # ESM + CJS + tipos
npm test                 # 977 tests
npm run test:conformance  # solo la capa que contrasta con la AEAT
npm run test:coverage    # con umbrales
npm run typecheck        # src
npm run typecheck:tests  # tests (sí, también compilan)
npm run lint:all         # src + tests
npm run schemas:check    # integridad de los esquemas oficiales (sin red)
```

## Seguridad

Nunca subas certificados ni contraseñas al repositorio. `.gitignore` ya excluye `*.p12`, `*.pfx` y
`*.pem`.

```bash
# .env — nunca en git
CERT_PATH=/ruta/segura/certificado.p12
CERT_PASSWORD=…
```

Si detectas una vulnerabilidad, abre un
[aviso de seguridad privado](https://github.com/ramoncoroso/verifactu/security/advisories/new) en
lugar de una issue pública.

## Recursos

- [Orden HAC/1177/2024](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-22138)
- [Real Decreto 1007/2023 (RRSIF)](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2023-24840)
- [Sede electrónica · Veri\*Factu](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html)
- [Especificaciones técnicas y XSD](https://www.agenciatributaria.es/AEAT.desarrolladores/Desarrolladores/_menu_/Documentacion/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU.html)

## Contribuir

Ver [`CONTRIBUTING.md`](CONTRIBUTING.md). Regla de la casa: **un hallazgo se corrige con un test que
falle primero**, y los tests que contradicen la norma se borran, no se actualizan.

## Licencia

MIT © Ramón Coroso — ver [`LICENSE`](LICENSE).
