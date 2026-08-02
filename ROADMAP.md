# Roadmap

Mejoras planificadas para futuras versiones de Verifactu.

---

## Prioridad actual: conformidad con la especificación de la AEAT

Antes de cualquier mejora nueva hay que cerrar los 37 hallazgos de la auditoría, once de ellos
bloqueantes. El detalle y el orden de ataque recomendado están en
[`docs/AUDITORIA_CONFORMIDAD.md`](docs/AUDITORIA_CONFORMIDAD.md).

---

## ⛔ NO configures NPM_TOKEN todavía

> Esta sección decía lo contrario: pedía configurar `NPM_TOKEN` como la tarea que
> desbloqueaba las publicaciones automáticas. **Era una trampa**, y está invertida a
> propósito.

El pipeline de release dispara en cada push a `main`. Hasta ahora no publicaba nada
porque fallaba en `verifyConditions` con `EINVALIDNPMTOKEN`, antes siquiera de analizar
los commits. Eso es un atasco, no un seguro: **configurar el token era exactamente lo
que lo desatascaría**, y lo que saldría publicado es una librería que emite QR que
ningún lector decodifica y huellas en Base64, versionada como «parche seguro» porque
las correcciones son commits `fix:`.

Hay dos cerrojos, y cada uno exige un acto deliberado y visible:

1. **`.github/workflows/release.yml`** — el job se salta salvo que exista la variable
   de repositorio `RELEASE_ENABLED` con valor `'true'`.
2. **`.releaserc.json`** — `"npmPublish": false`.

### Qué tiene que ocurrir antes de abrirlos

- [ ] El job **`Conformidad AEAT`** en verde **sin ningún test marcado `it.fails`**.
      Mientras quede uno, hay un bloqueante abierto.
- [ ] Resuelto el nombre del paquete: `verifactu` pertenece a un tercero en npm desde
      enero de 2024. Hay que decidir entre un scope propio (`@ramoncoroso/verifactu`) o
      una disputa de nombres. Ninguna fase del plan posee esta decisión.
- [ ] Decidido si los esquemas de la AEAT y el `xmldsig-core-schema.xsd` del W3C deben
      viajar dentro del tarball: hoy `files: ["dist", "schemas"]` los redistribuye en un
      paquete que se anuncia MIT, y solo los necesita el helper de tests.
- [ ] Verificado contra el entorno de preproducción de la AEAT que un registro es
      aceptado. Requiere un certificado, y su tramitación tiene plazo: conviene iniciarla
      cuanto antes porque no consume horas de ingeniería y bloquea el final.

### Cuando llegue el momento

1. Genera un token de automatización en [npmjs.com](https://www.npmjs.com/) y añádelo como
   secreto `NPM_TOKEN` en *Settings → Secrets and variables → Actions*.
2. Pon `"npmPublish": true` en `.releaserc.json`.
3. Crea la variable de repositorio `RELEASE_ENABLED` con valor `true`.

El primer release será un **`2.0.0`**: desaparecen `sha256`, `formatXmlDate`,
`SOAP_ACTIONS`, `RecordChain.processInvoice` y varios tipos más de la API pública.

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
