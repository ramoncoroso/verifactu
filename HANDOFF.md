# Handoff: Librería Verifactu TypeScript

## Resumen

Librería TypeScript **production-ready** para el sistema Verifactu de la AEAT. Zero-dependencies, compatible con Node.js 18+, Deno y Bun.

## Estado: Proyecto Completado ✅

### Módulos Implementados

| Módulo | Archivos | Descripción |
|--------|----------|-------------|
| **Setup** | `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts` | Configuración proyecto |
| **Models** | `src/models/*.ts` | Invoice, Party, Tax, Enums AEAT |
| **Errors** | `src/errors/*.ts` | Jerarquía errores tipados |
| **Validation** | `src/validation/*.ts` | NIF/CIF, Schema, Business rules |
| **XML** | `src/xml/*.ts` | Builder, Parser, Templates SOAP |
| **Crypto** | `src/crypto/*.ts` | SHA-256, Chain, Certificates |
| **QR** | `src/qr/*.ts` | Generator SVG, URL builder |
| **Client** | `src/client/*.ts` | SOAP client, VerifactuClient |
| **Builders** | `src/builders/*.ts` | InvoiceBuilder fluido |
| **Tests** | `tests/unit/*.ts` | 490 tests, 94% coverage |
| **Docs** | `README.md` | Documentación completa |

## API Principal

```typescript
const client = new VerifactuClient({
  environment: 'sandbox',
  certificate: { type: 'pfx', path: './cert.pfx', password: 'xxx' },
  software: { name: 'Mi App', developerTaxId: 'B12345678', version: '1.0', installationNumber: '001', systemType: 'V' }
});

const invoice = InvoiceBuilder.create()
  .issuer('B12345678', 'Mi Empresa SL')
  .recipient('A87654321', 'Cliente SA')
  .type('F1')
  .id('A', '001')
  .addVatBreakdown(100, 21)
  .build();

const response = await client.submitInvoice(invoice);
```

## Uso

```bash
npm install        # Instalar dependencias
npm run build      # Compilar
npm test           # Ejecutar tests
npm run test:coverage  # Tests con cobertura
```

## Recursos

- [AEAT Verifactu](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html)
