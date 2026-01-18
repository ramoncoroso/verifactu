# Roadmap

Mejoras planificadas para futuras versiones de Verifactu.

---

## Sprint Futuro 1: Límite de Concurrencia

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

## Sprint Futuro 2: Releases Automáticos (semantic-release)

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
