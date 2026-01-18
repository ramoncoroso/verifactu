# Roadmap

Mejoras planificadas para futuras versiones de Verifactu.

---

## Requisito Pendiente: Configurar NPM_TOKEN

Para activar la publicación automática a npm, configura el secreto `NPM_TOKEN` en GitHub:

1. Genera un token en [npmjs.com](https://www.npmjs.com/) > Access Tokens > Generate New Token (Automation)
2. Ve a GitHub > Settings > Secrets and variables > Actions
3. Añade un nuevo secreto llamado `NPM_TOKEN` con el valor del token

Una vez configurado, cada push a `master` con commits convencionales disparará automáticamente:
- Bump de versión según tipo de commit
- Generación de changelog
- Publicación a npm
- Creación de GitHub Release

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

### Sprint 5: Límite de Concurrencia (Completado)
- `ConcurrencyLimiter` con patrón semáforo
- Opciones `maxConcurrency` y `queueTimeout` en VerifactuClient
- `getConcurrencyStats()` para monitorización
- `QueueTimeoutError` para timeout en cola
- Tests completos (27 tests)

### Sprint 6: Logger Inyectable (Completado)
- Interfaz `Logger` compatible con pino, winston, console
- `noopLogger` por defecto (zero overhead)
- `consoleLogger` con prefijos
- `createLevelFilteredLogger()` para filtrar por nivel
- `sanitizeXmlForLogging()` para datos sensibles
- Logging en todas las operaciones del cliente
- Tests completos (25 tests)

### Sprint 7: Developer Experience (Completado)
- `scripts/generate-test-cert.sh` para certificados de prueba
- `.devcontainer/devcontainer.json` para Codespaces/VSCode
- `.env.example` con variables documentadas

### Sprint 8: Releases Automáticos (Completado)
- `semantic-release` configurado para publicación automática
- `commitlint` + `husky` para validar mensajes de commit
- `.github/workflows/release.yml` para CI/CD de releases
- `.releaserc.json` con configuración de plugins
- Generación automática de changelog
- Publicación automática a npm (requiere NPM_TOKEN)
