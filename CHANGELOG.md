# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Automatic Retry with Exponential Backoff**: New retry functionality for network operations
  - `withRetry()` - Execute async operations with automatic retry on transient failures
  - `withRetryAndMetadata()` - Same as above but returns attempt count and timing metadata
  - `submitInvoiceWithRetry()` - Submit invoices with automatic retry
  - `cancelInvoiceWithRetry()` - Cancel invoices with automatic retry
  - `checkInvoiceStatusWithRetry()` - Check invoice status with automatic retry
  - Configurable retry options: `maxRetries`, `initialDelayMs`, `maxDelayMs`, `backoffMultiplier`, `jitterFactor`
  - Respects error-specific retry information (e.g., AEAT service unavailable suggests 30s delay)

- **CI/CD Pipeline**: GitHub Actions workflow for automated testing and quality assurance
  - Multi-version Node.js testing (18, 20, 22)
  - ESLint and TypeScript type checking
  - Test coverage reporting with Codecov integration
  - Security audit with `npm audit`
  - Build verification

- **Dependabot**: Automatic dependency updates
  - Weekly npm dependency updates
  - Weekly GitHub Actions updates
  - Grouped dev dependency updates

## [0.1.0] - 2024-01-XX

### Added

- **Core Functionality**
  - `VerifactuClient` - Main client for AEAT Verifactu communication
  - `InvoiceBuilder` - Fluent builder for creating invoices
  - Support for all invoice types: F1, F2, F3, R1-R5
  - Invoice submission (alta) to AEAT
  - Invoice cancellation (anulacion)
  - Invoice status queries (consulta)

- **Record Chain Integrity**
  - Blockchain-like hash chain for invoice records
  - Chain state persistence and recovery
  - Automatic hash calculation for each record

- **Certificate Support**
  - PFX/P12 certificate support
  - PEM certificate support
  - Automatic TLS configuration for AEAT endpoints

- **Validation**
  - NIF/CIF/NIE validation with detailed error messages
  - Invoice schema validation
  - Business rule validation
  - Tax breakdown validation

- **QR Code Generation**
  - AEAT-compliant verification URL generation
  - SVG QR code generation without external dependencies
  - Configurable size, margin, and error correction

- **Error Handling**
  - Typed error hierarchy for all error types
  - Detailed error context (field, value, expected)
  - Retry information for transient errors
  - `toDetailedString()` and `toJSON()` for debugging

- **Developer Experience**
  - Zero runtime dependencies (pure Node.js)
  - Dual ESM/CJS build
  - Full TypeScript support with strict mode
  - Type declarations included
  - Sourcemaps for debugging

### Technical Details

- Node.js >= 18.0.0 required
- TypeScript 5.3+ with strict configuration
- 97%+ test coverage
- ESLint configured
