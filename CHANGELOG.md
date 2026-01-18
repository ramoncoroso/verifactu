## 1.0.0 (2026-01-18)


### Features

* Add CI/CD, automatic retry, and documentation improvements ([a2b0769](https://github.com/ramoncoroso/verifactu/commit/a2b0769fab9bd262a3a57b7c316635b75625bf25))
* Add comprehensive test suite with 97.74% coverage ([af0e9be](https://github.com/ramoncoroso/verifactu/commit/af0e9be2442378bbad88039a764ecdf76c8ef222))
* Add concurrency limiting for AEAT requests ([cb02fb9](https://github.com/ramoncoroso/verifactu/commit/cb02fb9080aaf0c431f237442f779d18782481e0))
* Add logger interface and developer experience improvements ([dd24e6a](https://github.com/ramoncoroso/verifactu/commit/dd24e6a2b55b88b3af5bf86929f81981e3bfc73b))
* Add semantic-release for automated versioning and publishing ([0db3a23](https://github.com/ramoncoroso/verifactu/commit/0db3a230e0b530f3d5536462224178eb7ea00f45))
* Improve security documentation and add Buffer support for certificates ([7eebf87](https://github.com/ramoncoroso/verifactu/commit/7eebf87cf8f5a8729a39f8fb510cc80bcaf0070f))
* Initial implementation of Verifactu TypeScript library ([1a16096](https://github.com/ramoncoroso/verifactu/commit/1a16096b7d29f4c5b4827451eecb15d1ef7e3fb0))


### Bug Fixes

* Address code review issues for security and correctness ([289ebc8](https://github.com/ramoncoroso/verifactu/commit/289ebc86e4e3286eb27b408dcb8697ef2e28e713))
* change npm audit level from high to critical ([44bce0b](https://github.com/ramoncoroso/verifactu/commit/44bce0be910b6611246dd4879982f0caf5ba7518))
* disable body-max-line-length for semantic-release commits ([2f752a4](https://github.com/ramoncoroso/verifactu/commit/2f752a450ef86c443ea9193ab075eaaa856a6ed3))
* Resolve ESLint errors in verifactu-client and logger ([01d09de](https://github.com/ramoncoroso/verifactu/commit/01d09de8046888036b2e61f9fb26e4a64bf7a7cc))
* update package-lock.json for semantic-release dependencies ([cc9968e](https://github.com/ramoncoroso/verifactu/commit/cc9968e229f9b0cfe2cc88531f7514f33e3b8866))

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

- **Buffer Certificate Support**: In-memory certificate handling for cloud environments
  - `PfxCertificateBufferConfig` - Load PFX certificates from Buffer
  - `PemCertificateBufferConfig` - Load PEM certificates from Buffer
  - Ideal for AWS Secrets Manager, Azure Key Vault, HashiCorp Vault

- **Community & Contribution**
  - `README.en.md` - Full English documentation
  - `CODE_OF_CONDUCT.md` - Contributor Covenant 2.1
  - `CONTRIBUTING.md` - Comprehensive contribution guide
  - Issue templates (bug report, feature request)
  - Pull request template

- **Concurrency Limiting**: Control concurrent requests to AEAT services
  - `maxConcurrency` - Limit simultaneous requests (default: unlimited)
  - `queueTimeout` - Timeout for queued requests (default: 30000ms)
  - `getConcurrencyStats()` - Get active/queued request counts
  - `QueueTimeoutError` - Thrown when queue timeout exceeded
  - Semaphore-based implementation with zero dependencies

- **Injectable Logger**: Structured logging for debugging and monitoring
  - `Logger` interface compatible with pino, winston, console
  - `noopLogger` - Default silent logger (zero overhead)
  - `consoleLogger` - Simple console logger with prefixes
  - `createLevelFilteredLogger()` - Filter logs by level
  - `sanitizeXmlForLogging()` - Remove sensitive data from XML
  - Logs at key points: requests, responses, errors, retries

- **Developer Experience**
  - `scripts/generate-test-cert.sh` - Generate self-signed test certificates
  - `.devcontainer/devcontainer.json` - GitHub Codespaces / VSCode Dev Containers
  - `.env.example` - Documented environment variables template

- **Automated Releases with semantic-release**
  - Automatic version bumping based on conventional commits
  - Automatic changelog generation
  - Automatic npm publishing on merge to master
  - Automatic GitHub releases with release notes
  - Commitlint + Husky for commit message validation

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
