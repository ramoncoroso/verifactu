# Roadmap

Mejoras planificadas para futuras versiones de Verifactu.

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
