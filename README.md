# Verifactu

Librería TypeScript **production-ready** para integrar con el sistema **Verifactu de la AEAT** (Agencia Tributaria Española).

[![CI](https://github.com/your-username/verifactu/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/verifactu/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/your-username/verifactu/branch/master/graph/badge.svg)](https://codecov.io/gh/your-username/verifactu)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)]()

## Características

- **Zero-dependencies** en runtime (solo APIs nativas de Node.js)
- **Type-safe** con TypeScript strict mode
- **Dual build**: ESM y CommonJS
- **Cadena de integridad**: cada registro contiene el hash del anterior (blockchain-like)
- **Validación completa**: NIF/CIF/NIE, esquemas, reglas de negocio AEAT
- **Generación de QR**: códigos QR en SVG sin dependencias
- **Soporte sandbox y producción**: ambos entornos de AEAT
- **API fluida**: Builder pattern para construcción intuitiva de facturas

## Instalación

```bash
npm install verifactu
```

## Inicio Rápido

```typescript
import { VerifactuClient, InvoiceBuilder } from 'verifactu';

// 1. Crear cliente
const client = new VerifactuClient({
  environment: 'sandbox', // o 'production'
  certificate: {
    type: 'pfx',
    path: './certificado.pfx',
    password: 'tu-contraseña',
  },
  software: {
    name: 'Mi Aplicación',
    developerTaxId: 'B12345678',
    version: '1.0.0',
    installationNumber: '001',
    systemType: 'V',
  },
});

// 2. Construir factura
const invoice = InvoiceBuilder.create()
  .issuer('B12345678', 'Mi Empresa SL')
  .recipient('A87654321', 'Cliente SA')
  .type('F1') // Factura ordinaria
  .id('A', '001', new Date())
  .addVatBreakdown(1000, 21) // 1000€ base + 21% IVA
  .build();

// 3. Enviar a AEAT
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

Cliente principal para comunicarse con los servicios AEAT.

```typescript
const client = new VerifactuClient(config);
```

#### Configuración

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `environment` | `'sandbox' \| 'production'` | Entorno AEAT |
| `certificate` | `CertificateConfig` | Configuración del certificado |
| `software` | `SoftwareInfo` | Información del software |
| `timeout?` | `number` | Timeout en ms (default: 30000) |
| `chainState?` | `ChainState` | Estado inicial de la cadena |

#### Métodos

##### `submitInvoice(invoice: Invoice): Promise<SubmitInvoiceResponse>`

Registra una factura en AEAT.

```typescript
const response = await client.submitInvoice(invoice);

if (response.accepted) {
  console.log('CSV:', response.csv);
  console.log('Hash:', response.invoice.hash);
} else {
  console.error('Error:', response.errorCode, response.errorDescription);
}
```

##### `cancelInvoice(invoiceId, issuer, reason?): Promise<SubmitCancellationResponse>`

Anula una factura registrada.

```typescript
const response = await client.cancelInvoice(
  { series: 'A', number: '001', issueDate: new Date('2024-01-15') },
  { taxId: { type: 'NIF', value: 'B12345678' }, name: 'Mi Empresa SL' },
  'Error en los datos de la factura'
);
```

##### `checkInvoiceStatus(invoiceId, issuerNif): Promise<InvoiceStatusResponse>`

Consulta el estado de una factura.

```typescript
const status = await client.checkInvoiceStatus(
  { series: 'A', number: '001', issueDate: new Date('2024-01-15') },
  'B12345678'
);

if (status.found) {
  console.log('Estado:', status.state);
  console.log('CSV:', status.csv);
}
```

##### `getChainState(): ChainState`

Obtiene el estado actual de la cadena (para persistencia).

```typescript
const state = client.getChainState();
// Guardar en base de datos para recuperar después
saveToDatabase(state);

// Más tarde, crear cliente con estado guardado
const client2 = new VerifactuClient({
  ...config,
  chainState: loadFromDatabase(),
});
```

### InvoiceBuilder

Constructor fluido para crear facturas.

```typescript
const invoice = InvoiceBuilder.create()
  // Emisor (obligatorio)
  .issuer('B12345678', 'Mi Empresa SL')

  // Destinatario (opcional para F2)
  .recipient('A87654321', 'Cliente SA')

  // O destinatario extranjero
  .foreignRecipient('FR12345678901', 'Client SARL', 'FR', 'VAT')

  // Tipo de factura
  .type('F1')  // F1=Ordinaria, F2=Simplificada, F3=Rectificativa

  // Identificación
  .id('SERIE', '001', new Date())

  // Descripción (opcional)
  .description('Servicios de consultoría')

  // Desglose de IVA
  .addVatBreakdown(1000, 21)  // Base 1000€, IVA 21%
  .addVatBreakdown(500, 10)   // Base 500€, IVA 10%

  // O exención
  .addExemptBreakdown(200, 'E1')

  // Régimen (por defecto '01')
  .regime('01')

  // Construir
  .build();
```

### Validación

#### Validar NIF/CIF/NIE

```typescript
import { validateSpanishTaxId, isValidSpanishTaxId } from 'verifactu';

// Validación simple
const isValid = isValidSpanishTaxId('B12345674');

// Validación con detalles
const result = validateSpanishTaxId('B12345674');
if (result.valid) {
  console.log('Tipo:', result.type); // 'CIF'
  console.log('Formato:', result.format); // 'B12345674'
} else {
  console.log('Error:', result.error);
}
```

#### Validar factura

```typescript
import { validateInvoice, validateInvoiceBusinessRules } from 'verifactu';

// Validación de esquema
const schemaResult = validateInvoice(invoice);
if (!schemaResult.valid) {
  console.log('Errores:', schemaResult.violations);
}

// Validación de reglas de negocio
const businessResult = validateInvoiceBusinessRules(invoice);
if (!businessResult.valid) {
  console.log('Errores:', businessResult.errors);
  console.log('Advertencias:', businessResult.warnings);
}
```

### Generación de QR

```typescript
import { generateQrCode, buildVerificationUrl } from 'verifactu';

// Generar URL de verificación
const url = buildVerificationUrl({
  nif: 'B12345678',
  invoiceNumber: 'A001',
  issueDate: new Date('2024-01-15'),
  totalAmount: 121.00,
});

// Generar QR en SVG
const svg = generateQrCode(url, {
  size: 200,
  margin: 4,
  errorCorrection: 'M',
});

// Usar el SVG
document.getElementById('qr').innerHTML = svg;
```

## Tipos de Factura

| Código | Descripción |
|--------|-------------|
| `F1` | Factura ordinaria |
| `F2` | Factura simplificada |
| `F3` | Factura rectificativa |
| `R1` | Factura rectificativa (error fundado en derecho) |
| `R2` | Factura rectificativa (art. 80.3) |
| `R3` | Factura rectificativa (art. 80.4) |
| `R4` | Factura rectificativa (resto) |
| `R5` | Factura rectificativa simplificada |

## Configuración del Certificado

### PFX/P12

```typescript
certificate: {
  type: 'pfx',
  path: './certificado.pfx',
  password: 'contraseña',
}
```

### PEM

```typescript
certificate: {
  type: 'pem',
  certPath: './certificado.crt',
  keyPath: './clave-privada.key',
  keyPassword: 'contraseña', // opcional
  caPath: './ca-chain.crt',  // opcional
}
```

## Cadena de Registros

Verifactu mantiene una cadena de hashes donde cada registro contiene el hash del registro anterior, similar a una blockchain. Esto garantiza la integridad y trazabilidad de los registros.

```typescript
// Persistir el estado de la cadena
const state = client.getChainState();
// state = {
//   lastHash: 'abc123...',
//   lastNumber: '001',
//   lastDate: Date,
//   lastSeries: 'A',
//   recordCount: 5
// }

// Guardar en base de datos
await db.save('verifactu_chain', state);

// Restaurar en una nueva sesión
const savedState = await db.load('verifactu_chain');
const client = new VerifactuClient({
  ...config,
  chainState: savedState,
});
```

## Manejo de Errores

La librería proporciona una jerarquía de errores tipados:

```typescript
import {
  VerifactuError,      // Error base
  ValidationError,     // Errores de validación
  CryptoError,         // Errores criptográficos
  NetworkError,        // Errores de red
  AeatError,           // Errores de AEAT
  SoapError,           // Errores SOAP
  TimeoutError,        // Timeout
  ConnectionError,     // Conexión fallida
} from 'verifactu';

try {
  await client.submitInvoice(invoice);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Error de validación:', error.violations);
  } else if (error instanceof AeatError) {
    console.log('Error de AEAT:', error.message);
  } else if (error instanceof TimeoutError) {
    console.log('Timeout:', error.timeout, 'ms');
  } else if (error instanceof ConnectionError) {
    console.log('No se pudo conectar a:', error.hostname);
  }
}
```

## Reintentos Automáticos

La librería proporciona reintentos automáticos con backoff exponencial para errores de red transitorios:

```typescript
// Usar métodos con retry integrado
const response = await client.submitInvoiceWithRetry(invoice);

// O configurar retry por defecto en el cliente
const client = new VerifactuClient({
  ...config,
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
  },
});

// También disponible como utilidad independiente
import { withRetry } from 'verifactu';

const result = await withRetry(
  () => someAsyncOperation(),
  {
    maxRetries: 3,
    initialDelayMs: 1000,
    onRetry: (attempt, error, delayMs) => {
      console.log(`Reintento ${attempt} en ${delayMs}ms: ${error.message}`);
    },
  }
);
```

Los errores retryables incluyen:
- `NetworkError` - Errores de red transitorios
- `TimeoutError` - Timeouts de conexión
- `ConnectionError` - Fallos de conexión
- `AeatServiceUnavailableError` - Servicio AEAT no disponible

## Ejemplos Avanzados

### Factura Rectificativa

```typescript
const rectificativa = InvoiceBuilder.create()
  .issuer('B12345678', 'Mi Empresa SL')
  .recipient('A87654321', 'Cliente SA')
  .type('F3')
  .rectifiedInvoiceType('S') // Sustitución
  .addRectifiedInvoice('B12345678', {
    series: 'A',
    number: '001',
    issueDate: new Date('2024-01-15'),
  })
  .id('A', '002', new Date())
  .addVatBreakdown(-100, 21) // Importes negativos para anular
  .build();
```

### Factura con Múltiples Tipos de IVA

```typescript
const invoice = InvoiceBuilder.create()
  .issuer('B12345678', 'Supermercado SL')
  .recipient('12345678Z', 'Juan García')
  .type('F1')
  .id('T', '001', new Date())
  .addVatBreakdown(50, 21)   // Productos generales
  .addVatBreakdown(30, 10)   // Productos reducidos
  .addVatBreakdown(20, 4)    // Productos superreducidos
  .build();
```

### Factura con Exención

```typescript
const invoice = InvoiceBuilder.create()
  .issuer('B12345678', 'Academia SL')
  .recipient('A87654321', 'Empresa SA')
  .type('F1')
  .id('E', '001', new Date())
  .addExemptBreakdown(500, 'E1') // Exenta por formación
  .description('Curso de formación profesional')
  .build();
```

## Scripts

```bash
# Compilar
npm run build

# Tests
npm test

# Tests con watch
npm run test:watch

# Cobertura
npm run test:coverage

# Lint
npm run lint
npm run lint:fix

# Type check
npm run typecheck
```

## Requisitos

- Node.js >= 18.0.0
- Certificado digital válido (FNMT, etc.)
- Alta en el sistema Verifactu de AEAT

## Recursos

- [Documentación AEAT Verifactu](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html)
- [Especificaciones técnicas](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/especificaciones-tecnicas.html)

## Licencia

MIT
