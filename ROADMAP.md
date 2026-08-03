# Roadmap

Mejoras planificadas para futuras versiones de Verifactu.

---

## Prioridad actual: conformidad con la especificación de la AEAT

Antes de cualquier mejora nueva hay que cerrar los 37 hallazgos de la auditoría, once de ellos
bloqueantes. El detalle y el orden de ataque recomendado están en
[`docs/AUDITORIA_CONFORMIDAD.md`](docs/AUDITORIA_CONFORMIDAD.md).

---

## ⛔ La publicación sigue desarmada, y hay que abrirla a mano

> Esta sección llegó a pedir `NPM_TOKEN` como la tarea que desbloqueaba las
> publicaciones automáticas. **Era una trampa** —lo que habría salido publicado era una
> librería que emitía QR ilegibles— y sigue invertida a propósito: nada de esto se abre
> solo.

El pipeline de release dispara en cada push a `main`. Durante meses no publicó nada, pero
no por seguridad: fallaba en `verifyConditions` con `EINVALIDNPMTOKEN` antes siquiera de
analizar los commits. Eso es un atasco, y **configurar el token era exactamente lo que lo
habría desatascado** —publicando una librería que emitía QR que ningún lector decodifica y
huellas en Base64, versionada además como «parche seguro» porque las correcciones son
commits `fix:`—. Los cerrojos de abajo sustituyen ese atasco por una decisión.

Hay dos cerrojos, y cada uno exige un acto deliberado y visible:

1. **`.github/workflows/release.yml`** — el job se salta salvo que exista la variable
   de repositorio `RELEASE_ENABLED` con valor `'true'`.
2. **`.releaserc.json`** — `"npmPublish": false`.

### Qué tiene que ocurrir antes de abrirlos

- [x] El job **`Conformidad AEAT`** en verde **sin ningún test marcado `it.fails`**.
      No queda ninguno: los once bloqueantes están cerrados.
- [x] Resuelto el nombre del paquete. Se adopta el alcance de usuario
      **`@ramoncoroso/verifactu`**: está disponible, conserva la marca y no depende de una
      disputa con el titular de `verifactu` —una versión de 223 bytes publicada en enero
      de 2024 y nunca actualizada—. `publishConfig.access: "public"` va puesto, porque npm
      publica los paquetes con alcance como privados por defecto y sin eso el `publish`
      falla con un 402.
- [x] Decidido lo del tarball: los esquemas **ya no viajan dentro**. Ningún módulo de
      `src/` los lee en tiempo de ejecución —solo se citan en comentarios—, así que
      redistribuir documentos de la AEAT y del W3C en un paquete que se anuncia MIT no
      aportaba nada. `files: ["dist"]`.
- [ ] Verificado contra el entorno de preproducción de la AEAT que un registro es
      aceptado. **Es la única casilla que queda.** Requiere un certificado de representante
      o de sello de entidad, y su tramitación tiene plazo: conviene iniciarla cuanto antes
      porque no consume horas de ingeniería y bloquea el final.

      Lo verificable **sin** certificado ya está hecho (2026-08-03): los cuatro endpoints
      del WSDL responden, el servidor presenta el certificado de la AEAT y las dos URLs de
      cotejo del QR aceptan nuestros parámetros. Y **no hay certificado de prueba**: uno
      autofirmado recibe el mismo 403 que no enviar ninguno.

### Cuando llegue el momento

Queda **una** casilla: la prueba contra preproducción. Cuando esté, y solo entonces, hacen
falta tres actos deliberados —ninguno lo puede hacer nadie desde el código, y ese es el
objetivo—:

1. Genera un token de automatización en [npmjs.com](https://www.npmjs.com/) y añádelo como
   secreto `NPM_TOKEN` en *Settings → Secrets and variables → Actions*.
2. Pon `"npmPublish": true` en `.releaserc.json`.
3. Crea la variable de repositorio `RELEASE_ENABLED` con valor `true`.

El primer release será un **`2.0.0`**: desaparecen `sha256`, `formatXmlDate`,
`SOAP_ACTIONS`, `RecordChain.processInvoice` y varios tipos más de la API pública.

---

## Historial de Sprints Completados

### Sprint 1: CI/CD y Calidad (Completado)
- GitHub Actions con matrix Node 18/20/22 *(hoy 20/22/24, ver #92)*
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
