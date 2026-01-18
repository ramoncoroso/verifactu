# Verifactu

**Production-ready** TypeScript library for integrating with the **Spanish Tax Agency (AEAT) Verifactu** invoice verification system.

[![CI](https://github.com/your-username/verifactu/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/verifactu/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/your-username/verifactu/branch/master/graph/badge.svg)](https://codecov.io/gh/your-username/verifactu)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)]()

**[Leer en Español](README.md)**

## Features

- **Zero runtime dependencies** (only native Node.js APIs)
- **Type-safe** with TypeScript strict mode
- **Dual build**: ESM and CommonJS
- **Integrity chain**: each record contains the hash of the previous one (blockchain-like)
- **Complete validation**: NIF/CIF/NIE, schemas, AEAT business rules
- **QR code generation**: SVG QR codes without dependencies
- **Sandbox and production support**: both AEAT environments
- **Fluent API**: Builder pattern for intuitive invoice construction

## Installation

```bash
npm install verifactu
```

## Quick Start

```typescript
import { VerifactuClient, InvoiceBuilder } from 'verifactu';

// 1. Create client (use environment variables for credentials)
const client = new VerifactuClient({
  environment: 'sandbox', // or 'production'
  certificate: {
    type: 'pfx',
    path: process.env.CERT_PATH!,
    password: process.env.CERT_PASSWORD!,
  },
  software: {
    name: 'My Application',
    developerTaxId: process.env.DEVELOPER_TAX_ID!,
    version: '1.0.0',
    installationNumber: '001',
    systemType: 'V',
  },
});

// 2. Build invoice
const invoice = InvoiceBuilder.create()
  .issuer('B12345678', 'My Company SL')
  .recipient('A87654321', 'Client SA')
  .type('F1') // Standard invoice
  .id('A', '001', new Date())
  .addVatBreakdown(1000, 21) // 1000 EUR base + 21% VAT
  .build();

// 3. Submit to AEAT
const response = await client.submitInvoice(invoice);

console.log(response);
// {
//   accepted: true,
//   state: 'Correcto',
//   csv: 'ABC123...',
//   invoice: { ...invoice, hash: '...' }
// }
```

## API

### VerifactuClient

Main client for communicating with AEAT services.

```typescript
const client = new VerifactuClient(config);
```

#### Configuration

| Property | Type | Description |
|----------|------|-------------|
| `environment` | `'sandbox' \| 'production'` | AEAT environment |
| `certificate` | `CertificateConfig` | Certificate configuration |
| `software` | `SoftwareInfo` | Software information |
| `timeout?` | `number` | Timeout in ms (default: 30000) |
| `chainState?` | `ChainState` | Initial chain state |
| `retry?` | `RetryOptions` | Retry configuration |
| `maxConcurrency?` | `number` | Maximum concurrent requests (default: unlimited) |
| `queueTimeout?` | `number` | Queue wait timeout in ms (default: 30000) |
| `logger?` | `Logger` | Logger for debugging (default: noop) |

#### Methods

##### `submitInvoice(invoice: Invoice): Promise<SubmitInvoiceResponse>`

Registers an invoice with AEAT.

```typescript
const response = await client.submitInvoice(invoice);

if (response.accepted) {
  console.log('CSV:', response.csv);
  console.log('Hash:', response.invoice.hash);
} else {
  console.error('Error:', response.errorCode, response.errorDescription);
}
```

##### `submitInvoiceWithRetry(invoice: Invoice, options?): Promise<SubmitInvoiceResponse>`

Registers an invoice with automatic retry on transient failures.

##### `cancelInvoice(invoiceId, issuer, reason?): Promise<SubmitCancellationResponse>`

Cancels a registered invoice.

```typescript
const response = await client.cancelInvoice(
  { series: 'A', number: '001', issueDate: new Date('2024-01-15') },
  { taxId: { type: 'NIF', value: 'B12345678' }, name: 'My Company SL' },
  'Error in invoice data'
);
```

##### `checkInvoiceStatus(invoiceId, issuerNif): Promise<InvoiceStatusResponse>`

Queries the status of an invoice.

```typescript
const status = await client.checkInvoiceStatus(
  { series: 'A', number: '001', issueDate: new Date('2024-01-15') },
  'B12345678'
);

if (status.found) {
  console.log('State:', status.state);
  console.log('CSV:', status.csv);
}
```

##### `getChainState(): ChainState`

Gets the current chain state (for persistence).

```typescript
const state = client.getChainState();
// Save to database for later recovery
saveToDatabase(state);

// Later, create client with saved state
const client2 = new VerifactuClient({
  ...config,
  chainState: loadFromDatabase(),
});
```

### InvoiceBuilder

Fluent builder for creating invoices.

```typescript
const invoice = InvoiceBuilder.create()
  // Issuer (required)
  .issuer('B12345678', 'My Company SL')

  // Recipient (optional for F2)
  .recipient('A87654321', 'Client SA')

  // Or foreign recipient
  .foreignRecipient('FR12345678901', 'Client SARL', 'FR', 'VAT')

  // Invoice type
  .type('F1')  // F1=Standard, F2=Simplified, F3=Rectifying

  // Identification
  .id('SERIES', '001', new Date())

  // Description (optional)
  .description('Consulting services')

  // VAT breakdown
  .addVatBreakdown(1000, 21)  // Base 1000 EUR, VAT 21%
  .addVatBreakdown(500, 10)   // Base 500 EUR, VAT 10%

  // Or exemption
  .addExemptBreakdown(200, 'E1')

  // Regime (default '01')
  .regime('01')

  // Build
  .build();
```

### Validation

#### Validate NIF/CIF/NIE

```typescript
import { validateSpanishTaxId, isValidSpanishTaxId } from 'verifactu';

// Simple validation
const isValid = isValidSpanishTaxId('B12345674');

// Validation with details
const result = validateSpanishTaxId('B12345674');
if (result.valid) {
  console.log('Type:', result.type); // 'CIF'
  console.log('Format:', result.format); // 'B12345674'
} else {
  console.log('Error:', result.error);
}
```

#### Validate Invoice

```typescript
import { validateInvoice, validateInvoiceBusinessRules } from 'verifactu';

// Schema validation
const schemaResult = validateInvoice(invoice);
if (!schemaResult.valid) {
  console.log('Errors:', schemaResult.violations);
}

// Business rules validation
const businessResult = validateInvoiceBusinessRules(invoice);
if (!businessResult.valid) {
  console.log('Errors:', businessResult.errors);
  console.log('Warnings:', businessResult.warnings);
}
```

### QR Code Generation

```typescript
import { generateQrCode, buildVerificationUrl } from 'verifactu';

// Generate verification URL
const url = buildVerificationUrl({
  nif: 'B12345678',
  invoiceNumber: 'A001',
  issueDate: new Date('2024-01-15'),
  totalAmount: 121.00,
});

// Generate QR as SVG
const svg = generateQrCode(url, {
  size: 200,
  margin: 4,
  errorCorrection: 'M',
});

// Use the SVG
document.getElementById('qr').innerHTML = svg;
```

## Invoice Types

| Code | Description |
|------|-------------|
| `F1` | Standard invoice |
| `F2` | Simplified invoice |
| `F3` | Rectifying invoice |
| `R1` | Rectifying invoice (legal error) |
| `R2` | Rectifying invoice (art. 80.3) |
| `R3` | Rectifying invoice (art. 80.4) |
| `R4` | Rectifying invoice (other) |
| `R5` | Simplified rectifying invoice |

## Certificate Configuration

> **Security**: Never include passwords or certificate paths directly in code.
> Use environment variables or a secrets manager.

### PFX/P12

```typescript
certificate: {
  type: 'pfx',
  path: process.env.CERT_PATH!,
  password: process.env.CERT_PASSWORD!,
}
```

### PEM

```typescript
certificate: {
  type: 'pem',
  certPath: process.env.CERT_PATH!,
  keyPath: process.env.KEY_PATH!,
  keyPassword: process.env.KEY_PASSWORD, // optional
  caPath: process.env.CA_PATH,           // optional
}
```

### Buffer (in-memory)

For cloud environments where certificates are injected as secrets:

```typescript
certificate: {
  type: 'pfx',
  data: Buffer.from(process.env.CERT_BASE64!, 'base64'),
  password: process.env.CERT_PASSWORD!,
}
```

## Record Chain

Verifactu maintains a hash chain where each record contains the hash of the previous record, similar to a blockchain. This ensures integrity and traceability of records.

```typescript
// Persist chain state
const state = client.getChainState();
// state = {
//   lastHash: 'abc123...',
//   lastNumber: '001',
//   lastDate: Date,
//   lastSeries: 'A',
//   recordCount: 5
// }

// Save to database
await db.save('verifactu_chain', state);

// Restore in a new session
const savedState = await db.load('verifactu_chain');
const client = new VerifactuClient({
  ...config,
  chainState: savedState,
});
```

## Error Handling

The library provides a typed error hierarchy:

```typescript
import {
  VerifactuError,      // Base error
  ValidationError,     // Validation errors
  CryptoError,         // Cryptographic errors
  NetworkError,        // Network errors
  AeatError,           // AEAT errors
  SoapError,           // SOAP errors
  TimeoutError,        // Timeout
  ConnectionError,     // Connection failed
} from 'verifactu';

try {
  await client.submitInvoice(invoice);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation error:', error.violations);
  } else if (error instanceof AeatError) {
    console.log('AEAT error:', error.message);
  } else if (error instanceof TimeoutError) {
    console.log('Timeout:', error.timeout, 'ms');
  } else if (error instanceof ConnectionError) {
    console.log('Could not connect to:', error.hostname);
  }
}
```

## Automatic Retries

The library provides automatic retries with exponential backoff for transient network errors:

```typescript
// Use methods with built-in retry
const response = await client.submitInvoiceWithRetry(invoice);

// Or configure default retry on client
const client = new VerifactuClient({
  ...config,
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
  },
});

// Also available as standalone utility
import { withRetry } from 'verifactu';

const result = await withRetry(
  () => someAsyncOperation(),
  {
    maxRetries: 3,
    initialDelayMs: 1000,
    onRetry: (attempt, error, delayMs) => {
      console.log(`Retry ${attempt} in ${delayMs}ms: ${error.message}`);
    },
  }
);
```

Retryable errors include:
- `NetworkError` - Transient network errors
- `TimeoutError` - Connection timeouts
- `ConnectionError` - Connection failures
- `AeatServiceUnavailableError` - AEAT service unavailable

## Concurrency Limiting

The library allows limiting concurrent requests to AEAT to avoid saturation or rate limiting:

```typescript
const client = new VerifactuClient({
  ...config,
  maxConcurrency: 5,   // Maximum 5 concurrent requests
  queueTimeout: 30000, // 30s timeout for queued requests
});

// Requests exceeding the limit are automatically queued
const results = await Promise.all([
  client.submitInvoice(invoice1),
  client.submitInvoice(invoice2),
  client.submitInvoice(invoice3),
  // ... more invoices
]);

// Get concurrency statistics
const stats = client.getConcurrencyStats();
console.log(stats);
// {
//   activeCount: 2,      // Active requests
//   queueLength: 3,      // Queued requests
//   maxConcurrency: 5,   // Configured limit
//   isAtCapacity: false  // At capacity?
// }
```

If a request exceeds `queueTimeout` while waiting in queue, `QueueTimeoutError` is thrown:

```typescript
import { QueueTimeoutError } from 'verifactu';

try {
  await client.submitInvoice(invoice);
} catch (error) {
  if (error instanceof QueueTimeoutError) {
    console.log('Queue timeout:', error.timeout, 'ms');
    console.log('Queue length:', error.queueLength);
  }
}
```

## Injectable Logger

The library allows injecting a custom logger for debugging and monitoring:

```typescript
import { VerifactuClient, consoleLogger } from 'verifactu';

// Use the included console logger
const client = new VerifactuClient({
  ...config,
  logger: consoleLogger,
});

// Or use pino/winston
import pino from 'pino';

const client = new VerifactuClient({
  ...config,
  logger: pino(),
});

// Or a custom logger
const client = new VerifactuClient({
  ...config,
  logger: {
    debug: (msg, meta) => myLogger.debug(msg, meta),
    info: (msg, meta) => myLogger.info(msg, meta),
    warn: (msg, meta) => myLogger.warn(msg, meta),
    error: (msg, meta) => myLogger.error(msg, meta),
  },
});
```

### Logged Events

| Level | Event |
|-------|-------|
| `debug` | Request/response XML (sanitized) |
| `info` | Invoice submitted, cancelled, queried |
| `warn` | Retry initiated, AEAT rejection |
| `error` | Network error, timeout, validation |

### Filter by Level

```typescript
import { createLevelFilteredLogger, consoleLogger } from 'verifactu';

// Only show warn and error
const logger = createLevelFilteredLogger(consoleLogger, 'warn');
```

## Advanced Examples

### Rectifying Invoice

```typescript
const rectifying = InvoiceBuilder.create()
  .issuer('B12345678', 'My Company SL')
  .recipient('A87654321', 'Client SA')
  .type('F3')
  .rectifiedInvoiceType('S') // Substitution
  .addRectifiedInvoice('B12345678', {
    series: 'A',
    number: '001',
    issueDate: new Date('2024-01-15'),
  })
  .id('A', '002', new Date())
  .addVatBreakdown(-100, 21) // Negative amounts to cancel
  .build();
```

### Invoice with Multiple VAT Rates

```typescript
const invoice = InvoiceBuilder.create()
  .issuer('B12345678', 'Supermarket SL')
  .recipient('12345678Z', 'John Smith')
  .type('F1')
  .id('T', '001', new Date())
  .addVatBreakdown(50, 21)   // General products
  .addVatBreakdown(30, 10)   // Reduced rate products
  .addVatBreakdown(20, 4)    // Super-reduced rate products
  .build();
```

### Invoice with Exemption

```typescript
const invoice = InvoiceBuilder.create()
  .issuer('B12345678', 'Academy SL')
  .recipient('A87654321', 'Company SA')
  .type('F1')
  .id('E', '001', new Date())
  .addExemptBreakdown(500, 'E1') // Exempt for training
  .description('Professional training course')
  .build();
```

## Scripts

```bash
# Build
npm run build

# Tests
npm test

# Tests with watch
npm run test:watch

# Coverage
npm run test:coverage

# Lint
npm run lint
npm run lint:fix

# Type check
npm run typecheck
```

## Requirements

- Node.js >= 18.0.0
- Valid digital certificate (FNMT, etc.)
- Registration in the AEAT Verifactu system

## Security

### Certificate Handling

1. **Never commit certificates or passwords** to the repository
2. **Use environment variables** for paths and passwords
3. **In production**, use a secrets manager (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault)

### Recommended Environment Variables

```bash
# .env (never commit this file)
VERIFACTU_ENV=sandbox
CERT_PATH=/secure/path/to/certificate.pfx
CERT_PASSWORD=your-secure-password
DEVELOPER_TAX_ID=B12345678
```

### CI/CD Configuration

```yaml
# GitHub Actions
- name: Run tests
  env:
    CERT_PATH: ${{ secrets.CERT_PATH }}
    CERT_PASSWORD: ${{ secrets.CERT_PASSWORD }}
  run: npm test
```

### Kubernetes / Docker

```yaml
# Mount certificate from Secret
volumes:
  - name: cert-volume
    secret:
      secretName: verifactu-cert
containers:
  - name: app
    env:
      - name: CERT_PATH
        value: /etc/certs/certificate.pfx
      - name: CERT_PASSWORD
        valueFrom:
          secretKeyRef:
            name: verifactu-secrets
            key: cert-password
```

### In-Memory Certificates (Cloud)

For environments where the certificate is injected as a base64 environment variable:

```typescript
const certBuffer = Buffer.from(process.env.CERT_BASE64!, 'base64');

const client = new VerifactuClient({
  certificate: {
    type: 'pfx',
    data: certBuffer,
    password: process.env.CERT_PASSWORD!,
  },
  // ...
});
```

## Contributing

Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a pull request.

## Resources

- [AEAT Verifactu Documentation](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html)
- [Technical Specifications](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/especificaciones-tecnicas.html)

## License

MIT
