# Verifactu

TypeScript library for the Spanish Tax Agency's **Veri\*Factu** system. It builds the invoicing
record, the chained hash, the XML and the QR code, and submits it over SOAP with a client
certificate.

**[Léeme en castellano](README.md)**

[![CI](https://github.com/ramoncoroso/verifactu/actions/workflows/ci.yml/badge.svg)](https://github.com/ramoncoroso/verifactu/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ramoncoroso/verifactu/branch/main/graph/badge.svg)](https://codecov.io/gh/ramoncoroso/verifactu)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Dependencies](https://img.shields.io/badge/dependencies-1%20(0%20transitive)-brightgreen.svg)]()

> ### Status
>
> The **eleven blocking defects** found by the conformance audit are fixed and verified against
> official AEAT sources. Validation against the **real pre-production environment** is still
> pending — it requires a valid electronic certificate — so treat this as a *release candidate*:
> ready to integrate and test, awaiting one last field check.
>
> Full history in [`docs/AUDITORIA_CONFORMIDAD.md`](docs/AUDITORIA_CONFORMIDAD.md) (Spanish).

---

## Contents

- [Why this library](#why-this-library)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Invoices](#invoices)
  - [Simple invoice](#simple-invoice) · [Multiple VAT rates](#multiple-vat-rates) ·
    [Equivalence surcharge](#equivalence-surcharge) · [Exempt and non-subject](#exempt-and-non-subject) ·
    [Corrective invoices](#corrective-invoices) · [Simplified](#simplified-invoice-f2)
- [Special regimes](#special-regimes)
- [Submitting](#submitting)
  - [Flow control](#flow-control-article-162) · [Batch submission](#batch-submission) ·
    [Cancellation](#cancellation) · [Status query](#status-query)
- [The record chain](#the-record-chain)
- [QR code](#qr-code)
- [Errors](#errors)
- [Certificates](#certificates)
- [Validation](#validation)
- [Client options](#client-options)
- [Conformance](#conformance-what-is-verified-and-against-what)
- [Development](#development)

---

## Why this library

**One runtime dependency.** `qrcode-generator` (MIT, zero transitive), and only because article 21
of Order HAC/1177/2024 mandates an ISO/IEC 18004-conformant QR code. Everything else — SHA-256,
mutual TLS, SOAP, XML — uses native Node APIs.

**It is verified against external sources, not against itself.** The AEAT's XSDs, WSDL and error
catalogue are vendored under `schemas/` and frozen by sha256; the tests validate the generated XML
against them, reproduce the published hash vectors, and **decode** the generated QR with an
independent reader. See [Conformance](#conformance-what-is-verified-and-against-what).

**It implements the article 16.2 flow control**, which the Order words as *shall implement*, not as
a recommendation.

## Installation

```bash
npm install @ramoncoroso/verifactu
```

```typescript
import { VerifactuClient } from '@ramoncoroso/verifactu';
```

> It ships scoped because the bare `verifactu` name has been reserved on npm by a third party since
> 2024 — a 223-byte version that has never been touched. You can also install straight from the
> repository: `npm install github:ramoncoroso/verifactu`.

Requires **Node.js ≥ 18**. Ships both ESM and CommonJS.

## Quick start

```typescript
import { VerifactuClient, InvoiceBuilder } from '@ramoncoroso/verifactu';

const client = new VerifactuClient({
  environment: 'sandbox',
  certificate: { type: 'pfx', path: process.env.CERT_PATH!, password: process.env.CERT_PASSWORD! },
  software: {
    name: 'My ERP',
    developerTaxId: 'B12345678',
    version: '1.0.0',
    installationNumber: '001',
    systemType: 'S', // 'S' if the system can only operate in Veri*Factu mode
  },
});

const invoice = InvoiceBuilder.create()
  .issuer('B12345678', 'My Company SL')
  .recipient('A87654321', 'Client SA')
  .type('F1')
  .id('FC', '0001', new Date())
  .description('Consulting services')
  .addVatBreakdown(1000, 21)
  .build();

const r = await client.submitInvoice(invoice);
console.log(r.accepted, r.csv, r.invoice.hash);
```

---

## Invoices

### Simple invoice

```typescript
const invoice = InvoiceBuilder.create()
  .issuer('B12345678', 'My Company SL')
  .recipient('A87654321', 'Client SA')
  .type('F1')
  .id('FC', '0001', new Date('2026-03-15'))
  .description('Annual maintenance')
  .addVatBreakdown(1000, 21) // base 1000 → VAT 210, total 1210
  .build();
```

`addVatBreakdown(base, rate)` computes the VAT amount and the total. To supply them yourself, build
the `Invoice` object directly — every field is public and `readonly`.

### Multiple VAT rates

An invoice may carry as many breakdown lines as needed, up to twelve.

```typescript
const invoice = InvoiceBuilder.create()
  .issuer('B12345678', 'My Company SL')
  .recipient('A87654321', 'Client SA')
  .type('F1')
  .id('FC', '0002', new Date())
  .description('Assorted supplies')
  .addVatBreakdown(1000, 21) // standard
  .addVatBreakdown(500, 10)  // reduced
  .addVatBreakdown(200, 4)   // super-reduced
  .build();
// ImporteTotal = 1910.00 · CuotaTotal = 280.00
```

### Equivalence surcharge

It belongs to the same line as its VAT and **counts towards `CuotaTotal`**; leaving it out makes the
AEAT reject the record with error 2006.

```typescript
const invoice: Invoice = {
  operationType: 'A',
  invoiceType: 'F1',
  issuer: { taxId: { type: 'NIF', value: 'B12345678' }, name: 'Wholesaler SL' },
  recipients: [{ taxId: { type: 'NIF', value: '12345678Z' }, name: 'Retailer' }],
  id: { series: 'FC', number: '0003', issueDate: new Date() },
  description: 'Sale to a retailer under the surcharge regime',
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

### Exempt and non-subject

They are separate blocks and both reach the XML. Non-subjection has **no element of its own**: it is
expressed through `CalificacionOperacion` `N1` (articles 7, 14 and others) or `N2` (place-of-supply
rules).

```typescript
const invoice = InvoiceBuilder.create()
  .issuer('B12345678', 'Exporter SL')
  .recipient('A87654321', 'Client SA')
  .type('F1')
  .id('FC', '0004', new Date())
  .description('Export and disbursements')
  .addVatBreakdown(1000, 21)
  .addExemptBreakdown(500, 'E1')     // exempt under art. 20
  .addNonSubjectBreakdown(120, 'N1') // disbursements
  .build();
```

Exemption causes: `E1` (art. 20) · `E2` (art. 21) · `E3` (art. 22) · `E4` (arts. 23 and 24) ·
`E5` (art. 25) · `E6` (other).

> **`E2` and `E3` do not fit under the general regime.** The AEAT rejects that with error 1199:
> an export carries its own `ClaveRegimen` (`02`), not `01`. The library checks it before
> submitting, so the failure surfaces as a local error:
>
> ```typescript
> taxBreakdown: { exemptBreakdowns: [{ cause: 'E2', taxBase: 500, regime: '02' }] }
> ```

### Corrective invoices

```typescript
const corrective = InvoiceBuilder.create()
  .issuer('B12345678', 'My Company SL')
  .recipient('A87654321', 'Client SA')
  .type('R1')            // R1: error in law, or art. 80.One/Two/Six
  .rectification('I')    // 'I' by difference · 'S' by substitution
  .rectifies('B12345678', '0001', new Date('2026-03-15'), 'FC')
  .id('FR', '0001', new Date())
  .description('Correction of invoice FC0001')
  .addVatBreakdown(-200, 21)
  .build();
```

### Simplified invoice (F2)

No recipient: the AEAT rejects the record if one is supplied (error 1190).

```typescript
const receipt = InvoiceBuilder.create()
  .issuer('B12345678', 'Pepe Bar SL')
  .type('F2')
  .id('T', '000123', new Date())
  .description('Food and drink')
  .addVatBreakdown(9.09, 10)
  .build();
```

---

## Special regimes

`ClaveRegimen`, `CalificacionOperacion` and `Impuesto` live **on the breakdown line**, not on the
invoice. The defaults are general regime (`01`), subject and non-exempt (`S1`) and VAT (`01`).

```typescript
const invoice: Invoice = {
  // …
  taxBreakdown: {
    vatBreakdowns: [
      { taxBase: 800, vatRate: 21, vatAmount: 168, regime: '11' }, // business premises lease
      { taxBase: 500, vatRate: 21, vatAmount: 105, regime: '07' }, // cash accounting scheme
      { taxBase: 300, vatRate: 7, vatAmount: 21, regime: '01', tax: '03' }, // IGIC (Canary Islands)
    ],
  },
  totalAmount: 1894,
};
```

**Reverse charge** — with `S2`, rate and amount are zero by definition:

```typescript
vatBreakdowns: [{ taxBase: 1000, vatRate: 0, vatAmount: 0, qualification: 'S2' }];
```

**VAT group, advanced level** (regime `06`) — requires `BaseImponibleACoste`:

```typescript
vatBreakdowns: [{ taxBase: 1000, vatRate: 21, vatAmount: 210, regime: '06', costBase: 800 }];
```

**Before submitting**, the library checks the coherence rules the AEAT publishes in
`errores.properties` and which would cause the record to be rejected: regime `08` requires `N2`
(1252), `03` only allows `S1` (1200), `04` requires `S2` or exempt (1201), `11` requires 21 % (1206),
`10` requires `N1` + `F1` + a recipient identified by NIF (1205), and a dozen more. A remote
rejection — with the hash already printed on an invoice that has probably been handed over — becomes
a local error.

---

## Submitting

### Flow control (article 16.2)

> "Veri\*Factu computer systems **shall implement a flow-control mechanism** based on the waiting
> time between submissions, which shall initially take the value of 60 seconds."

It is **on by default**. The first submission goes out immediately; the next one waits out the
remainder of `t` **counted from the previous submission**, not from its response. The AEAT returns
the current value in every response and the library applies it.

```typescript
const r1 = await client.submitInvoice(f1); // goes out immediately
console.log(r1.tiempoEsperaEnvioSeconds);  // e.g. 60
const r2 = await client.submitInvoice(f2); // waits out the remainder
```

An in-memory pacer does not protect a process that restarts, so **persist its state**:

```typescript
await save(client.getFlowControlState()); // { waitSeconds, lastSubmissionAt }

// On the next start-up:
const client = new VerifactuClient({
  /* … */
  flowControl: { state: await load() },
});
```

If you govern the cadence outside the library — a queue shared across several processes, say — turn
it off with `flowControl: false`. The responsibility then becomes yours.

### Batch submission

This is the other branch of article 16.2: wait `t` seconds **or** accumulate records up to the limit
set by the record layout, *whichever happens first*. Up to **1000** records per request, consuming a
**single** cadence slot.

```typescript
const batch = await client.submitInvoices([f1, f2, f3]);

console.log(batch.estadoEnvio);              // 'Correcto' | 'ParcialmenteCorrecto' | 'Incorrecto'
console.log(batch.tiempoEsperaEnvioSeconds); // for the next submission

for (const r of batch.results) {
  console.log(r.invoice.id.number, r.state, r.errorCode ?? '');
}
```

> `estadoEnvio` is global and **decides nothing per record**: `ParcialmenteCorrecto` does not imply
> rejections — a single `AceptadoConErrores` is enough. Use each result's `state`.

The whole batch is validated before the chain is touched: **all or nothing**.

### Cancellation

It travels in the same `RegFactuSistemaFacturacion` message as registrations and takes its own
position in the chain.

```typescript
const r = await client.cancelInvoice(
  { series: 'FC', number: '0001', issueDate: new Date('2026-03-15') },
  { taxId: { type: 'NIF', value: 'B12345678' }, name: 'My Company SL' },
  'Wrong recipient details'
);
```

### Status query

```typescript
const status = await client.checkInvoiceStatus(
  { series: 'FC', number: '0001', issueDate: new Date('2026-03-15') },
  'B12345678'
);
```

---

## The record chain

Every record embeds the previous record's hash. The chain is **local**: it is generated when the
invoice is issued and **never rolls back**, even if the AEAT rejects the record, because its hash is
already printed on the QR of an invoice that has probably been handed over. Deleting a generated
record is precisely what articles 7 and 10 of the RRSIF forbid; the remedy for a rejection is a
**correcting registration** (*alta de subsanación*).

```typescript
const state = client.getChainState();
await db.save(state); // { lastHash, lastNumber, lastDate, lastSeries, lastIssuerNif, … }

// After a restart, the chain resumes exactly where it was:
const client = new VerifactuClient({ /* … */, chainState: await db.load() });
```

Save the state **after every submission**. `RecordChain` exposes no `revert`, `rollback` or
`restore`: going backwards is not a lawful operation.

---

## QR code

The payload is **four parameters and only four** — tax ID, invoice number, date and amount. The
hash is **not** in the QR.

```typescript
import { generateQrCode } from '@ramoncoroso/verifactu';

const r = await client.submitInvoice(invoice);

// SVG sized in millimetres, as the specification requires (30–40 mm when printed)
const qr = generateQrCode(r.invoice, 'production', { size: 35, unit: 'mm' });
qr.data;    // '<svg …>'
qr.url;     // https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=…
qr.version; // 7–11 for Veri*Factu

// Data URI, to embed in an <img> inside HTML or a PDF
const uri = generateQrCode(r.invoice, 'production', { format: 'svg-data-uri', size: 300 });
// uri.data → 'data:image/svg+xml;base64,…'
```

Next to the QR, the invoice must carry the printed caption **«Factura verificable en la sede
electrónica de la AEAT»** or **«VERI\*FACTU»**.

Systems that do **not** issue verifiable invoices use a different verification URL:

```typescript
import { buildQrUrl } from '@ramoncoroso/verifactu';
const url = buildQrUrl(r.invoice, 'production', 'no-verifactu'); // …/ValidarQRNoVerifactu
```

---

## Errors

They all derive from `VerifactuError` and carry a stable code (`VF1000`, `VF4000`…).

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
  await client.submitInvoice(invoice);
} catch (e) {
  if (e instanceof ValidationError) {
    // The invoice cannot be issued. The chain has NOT moved.
    console.error(e.message, e.context);
  } else if (e instanceof CertificateError) {
    // Includes the diagnosis for legacy-encrypted .p12 files.
    console.error(e.message);
  } else if (e instanceof HttpStatusError) {
    console.error(e.statusCode, e.responseBody);
  } else if (e instanceof SoapError) {
    console.error(e.soapFaultCode, e.aeatCode); // e.g. '4102'
  } else if (e instanceof VerifactuError) {
    console.error(e.code, e.isRetryable());
  }
}
```

**A rejection is not an exception.** A record rejected by the AEAT is an ordinary response:

```typescript
const r = await client.submitInvoice(invoice);
if (!r.accepted) {
  console.error(r.state, r.errorCode, r.errorDescription);
  // The lawful remedy is a correcting registration, not resending the same thing.
}
if (r.alreadyRegistered) {
  // The record was already on file. Not a failure either.
}
```

### Retries

Exponential backoff with jitter. Only the **submission** is retried: the record and its hash are
generated once, so both attempts send **exactly the same bytes**.

```typescript
const r = await client.submitInvoiceWithRetry(invoice, {
  maxRetries: 3,
  initialDelayMs: 1000,
  onRetry: (attempt, error, delayMs) => log.warn({ attempt, delayMs }, error.message),
});
```

What is retried and what is not: network errors and 5xx/408/425/429 are; a 4xx is not; a `SOAPFault`
only when its `faultcode` is `soapenv:Server`, which is what the AEAT instructs.

---

## Certificates

```typescript
// From a file
certificate: { type: 'pfx', path: '/path/cert.p12', password: process.env.CERT_PASSWORD! }

// From memory (handy in containers, where the secret arrives base64-encoded)
certificate: { type: 'pfx', data: Buffer.from(process.env.CERT_B64!, 'base64'), password: '…' }

// Separate PEM files
certificate: { type: 'pem', certPath: '/path/cert.pem', keyPath: '/path/key.pem' }
```

**Old FNMT certificates.** Node 18+ runs on OpenSSL 3, whose default provider no longer ships RC2 or
RC4. If your `.p12` comes from an old export, the library detects it and tells you what to do
instead of handing back an opaque network error (the message is in Spanish):

```
El certificado usa cifrado heredado (RC2/RC4), que OpenSSL 3 —el que lleva Node 18+—
no incluye en su proveedor por defecto. […] La contraseña es correcta: el problema es el algoritmo.

Opción A (recomendada) · reexportar con cifrado moderno:
  openssl pkcs12 -legacy -in certificado-antiguo.p12 -nodes -out temporal.pem
  openssl pkcs12 -export -in temporal.pem -out certificado-nuevo.p12
  shred -u temporal.pem     # rm -P on macOS. The intermediate PEM holds the key UNENCRYPTED.
```

A wrong password produces a different message, deliberately: it sends nobody off to re-export
anything.

---

## Validation

```typescript
import { validateSpanishTaxId, validateInvoice, validateInvoiceBusinessRules } from '@ramoncoroso/verifactu';

validateSpanishTaxId('Q2826000H'); // { valid: true, type: 'cif',  normalized: 'Q2826000H' }
validateSpanishTaxId('M1234567L'); // { valid: true, type: 'nif' }  ← K/L/M are individuals
validateSpanishTaxId('12345678A'); // { valid: false, error: 'Invalid control letter: expected Z' }

const schema = validateInvoice(invoice);                // structure
const business = validateInvoiceBusinessRules(invoice); // AEAT rules
if (!schema.valid) console.error(schema.violations);
```

---

## Client options

```typescript
const client = new VerifactuClient({
  environment: 'sandbox',
  certificate: { /* … */ },
  software: { /* … */ },

  timeout: 30_000,        // ms per request
  maxConcurrency: 4,      // simultaneous requests (distinct from flow control)
  queueTimeout: 30_000,   // maximum wait in the queue
  retry: { maxRetries: 3, initialDelayMs: 1000 },
  flowControl: { state: saved },
  chainState: savedChain,
  logger: {               // any object with these four methods
    debug: (m, c) => log.debug(c, m),
    info:  (m, c) => log.info(c, m),
    warn:  (m, c) => log.warn(c, m),
    error: (m, c) => log.error(c, m),
  },
});
```

The logger receives **sanitised** XML: tax IDs, names and hashes are never written out in full.

---

## Conformance: what is verified, and against what

The risk in a tax library is not that it fails — it is that it **passes its own tests and is not
conformant**. That is why no conformance test uses the implementation as its oracle:

| Level | External oracle | What it catches |
|---|---|---|
| Hash vectors | The three chained examples published by the AEAT | Field order, `trim`, date format with offset, uppercase hex |
| XSD validation | Vendored `SuministroLR.xsd` and `SuministroInformacion.xsd` | Structure, ordering, namespaces, enumerated values |
| QR decoding | `jsqr`, an independent reader | That the QR **can be read** and says what it must |
| WSDL | `SistemaFacturacion.wsdl` | Endpoints, `SOAPAction`, operation names |
| Error catalogue | `errores.properties` | The breakdown coherence rules |

The schemas are **frozen by sha256**: if the AEAT publishes a revision, CI fails and forces someone
to review the diff instead of silently carrying it along (`npm run schemas:check`).

Two blind spots, **measured**, so that nobody over-trusts the XSD: a Base64 hash validates against
the schema, and so does a `FechaHoraHusoGenRegistro` with no time-zone offset. That is why the
official vectors are not redundant.

---

## Development

```bash
npm run build            # ESM + CJS + types
npm test                 # 977 tests
npm run test:conformance # only the layer that checks against the AEAT
npm run test:coverage    # with thresholds
npm run typecheck        # src
npm run typecheck:tests  # tests (they compile too)
npm run lint:all         # src + tests
npm run schemas:check    # integrity of the official schemas (no network)
```

## Security

Never commit certificates or passwords. `.gitignore` already excludes `*.p12`, `*.pfx` and `*.pem`.

```bash
# .env — never in git
CERT_PATH=/secure/path/certificate.p12
CERT_PASSWORD=…
```

Found a vulnerability? Please open a
[private security advisory](https://github.com/ramoncoroso/verifactu/security/advisories/new)
rather than a public issue.

## Resources

- [Order HAC/1177/2024](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-22138)
- [Royal Decree 1007/2023 (RRSIF)](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2023-24840)
- [AEAT e-Office · Veri\*Factu](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html)
- [Technical specifications and XSDs](https://www.agenciatributaria.es/AEAT.desarrolladores/Desarrolladores/_menu_/Documentacion/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU.html)

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). House rule: **a finding is fixed with a test that fails
first**, and tests that contradict the specification are deleted, not updated.

## License

MIT © Ramón Coroso — see [`LICENSE`](LICENSE).
