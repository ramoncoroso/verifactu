# Roadmap

Mejoras planificadas para futuras versiones de Verifactu.

---

## Sprint Futuro: Límite de Concurrencia

**Prioridad:** Baja
**Impacto:** Medio
**Esfuerzo:** Medio

### Descripción

Implementar un sistema de límite de concurrencia para controlar el número de peticiones simultáneas a los servicios de AEAT, evitando posible rate limiting o bloqueo.

### Tareas

- [ ] Investigar límites reales de AEAT (si están documentados)
- [ ] Implementar pool de conexiones con límite configurable
- [ ] Añadir opción `maxConcurrency` a `VerifactuClientConfig`
- [ ] Implementar cola de peticiones con prioridad opcional
- [ ] Añadir tests para concurrencia
- [ ] Documentar uso en README

### Ejemplo de API propuesta

```typescript
const client = new VerifactuClient({
  // ...config
  maxConcurrency: 5, // Máximo 5 peticiones simultáneas
  queueTimeout: 30000, // Timeout para peticiones en cola
});
```

### Notas

- Considerar usar `p-limit` o implementación propia
- Los usuarios pueden resolver esto externamente con librerías como `bottleneck`
- Evaluar si realmente es necesario basándose en feedback de usuarios

---

## Sprint Futuro: Releases Automáticos (semantic-release)

**Prioridad:** Media
**Impacto:** Alto
**Esfuerzo:** Bajo

### Descripción

Configurar semantic-release para automatizar el versionado, generación de changelog y publicación a npm basándose en conventional commits.

### Tareas

- [ ] Configurar commitlint para validar formato de commits
- [ ] Crear `.github/workflows/release.yml`
- [ ] Configurar semantic-release en `package.json`
- [ ] Configurar token npm en GitHub Secrets (`NPM_TOKEN`)
- [ ] Actualizar CONTRIBUTING.md con guía de conventional commits
- [ ] Probar flujo completo en rama de prueba

### Archivos a crear/modificar

1. `.github/workflows/release.yml`
2. `.releaserc.json` o config en `package.json`
3. `commitlint.config.js`
4. `CONTRIBUTING.md`

### Ejemplo de workflow

```yaml
name: Release
on:
  push:
    branches: [master]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npm test
      - name: Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npx semantic-release
```

### Requisitos previos

- Cuenta npm con acceso de publicación
- Token npm configurado en GitHub Secrets
- Decisión sobre rama principal (master/main)
- Adoptar conventional commits en el equipo

### Conventional Commits

Formato: `<type>(<scope>): <description>`

| Tipo | Descripción | Versión |
|------|-------------|---------|
| `feat` | Nueva funcionalidad | MINOR |
| `fix` | Corrección de bug | PATCH |
| `docs` | Solo documentación | - |
| `chore` | Mantenimiento | - |
| `BREAKING CHANGE` | Cambio incompatible | MAJOR |

---

## Sprint Futuro: Logger Inyectable y Observabilidad

**Prioridad:** Media
**Impacto:** Medio
**Esfuerzo:** Bajo

### Descripción

Implementar un sistema de logging configurable que permita a los usuarios inyectar su propio logger sin añadir dependencias. No incluir telemetría por defecto, pero documentar cómo extenderlo.

### Tareas

- [ ] Definir interfaz `Logger` con métodos `debug`, `info`, `warn`, `error`
- [ ] Añadir opción `logger` a `VerifactuClientConfig`
- [ ] Implementar logger noop por defecto (sin output)
- [ ] Añadir logs en puntos clave: peticiones, respuestas, errores, reintentos
- [ ] Documentar integración con winston, pino, etc.
- [ ] Documentar cómo añadir métricas Prometheus externamente
- [ ] Añadir tests para logging

### Ejemplo de API propuesta

```typescript
// Interfaz del logger
interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// Uso con console
const client = new VerifactuClient({
  // ...config
  logger: {
    debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta),
    info: (msg, meta) => console.info(`[INFO] ${msg}`, meta),
    warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta),
    error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta),
  },
});

// Uso con pino
import pino from 'pino';
const pinoLogger = pino();

const client = new VerifactuClient({
  // ...config
  logger: pinoLogger,
});
```

### Puntos de logging sugeridos

| Nivel | Evento |
|-------|--------|
| `debug` | Request/response XML (sanitizado) |
| `info` | Factura enviada, cancelada, consultada |
| `warn` | Retry iniciado, timeout cercano |
| `error` | Error de red, error AEAT, validación fallida |

### Notas

- NO incluir telemetría ni tracking por defecto
- Mantener zero-dependencies
- El logger debe ser opcional (noop por defecto)

---

## Sprint Futuro: Developer Experience (Local Dev)

**Prioridad:** Baja
**Impacto:** Medio
**Esfuerzo:** Bajo

### Descripción

Mejorar la experiencia de desarrollo local con scripts de utilidad y configuración de entorno reproducible.

### Tareas

- [ ] Crear script `scripts/generate-test-cert.sh` para generar certificado self-signed
- [ ] Crear `.devcontainer/devcontainer.json` para GitHub Codespaces / VSCode
- [ ] Añadir `docker-compose.yml` opcional para desarrollo
- [ ] Crear archivo `.env.example` con variables de entorno documentadas
- [ ] Documentar setup local en README o CONTRIBUTING.md

### Script de certificado de prueba

```bash
#!/bin/bash
# scripts/generate-test-cert.sh

openssl req -x509 -newkey rsa:4096 \
  -keyout test-key.pem \
  -out test-cert.pem \
  -days 365 \
  -nodes \
  -subj "/CN=localhost/O=Test/C=ES"

openssl pkcs12 -export \
  -out test-cert.pfx \
  -inkey test-key.pem \
  -in test-cert.pem \
  -passout pass:test-password

echo "Certificado de prueba generado: test-cert.pfx (password: test-password)"
```

### devcontainer.json

```json
{
  "name": "Verifactu Dev",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20",
  "features": {
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "postCreateCommand": "npm install",
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode"
      ]
    }
  }
}
```

### .env.example

```bash
# Entorno (sandbox | production)
VERIFACTU_ENV=sandbox

# Certificado
CERT_PATH=./certs/certificate.pfx
CERT_PASSWORD=your-password
# O en base64 para cloud
# CERT_BASE64=base64-encoded-certificate

# Software
DEVELOPER_TAX_ID=B12345678
SOFTWARE_NAME=Mi Aplicación
SOFTWARE_VERSION=1.0.0
```

---

## Historial de Sprints Completados

### Sprint 1: CI/CD y Calidad (Completado)
- GitHub Actions con matrix Node 18/20/22
- Dependabot configurado
- npm audit en CI
- Codecov integrado

### Sprint 2: Retry Automático (Completado)
- `withRetry()` con backoff exponencial
- Métodos `*WithRetry()` en VerifactuClient
- Restauración de chain state en reintentos
- Validación de inputs

### Sprint 3: Seguridad y Documentación (Completado)
- README con ejemplos seguros (env vars)
- Sección Security con guías CI/CD, K8s
- Soporte Buffer para certificados en memoria
- CHANGELOG.md

### Sprint 4: Comunidad y Accesibilidad (Completado)
- README.en.md (traducción al inglés)
- CODE_OF_CONDUCT.md (Contributor Covenant 2.1)
- CONTRIBUTING.md con guía completa
- Templates de issues (bug_report, feature_request)
- PULL_REQUEST_TEMPLATE.md
