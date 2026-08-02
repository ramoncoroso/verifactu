# Handoff

Librería TypeScript para el sistema **Veri\*Factu** de la AEAT. Node.js 18+.

> ## ⚠️ Estado: conforme en formato, sin verificar contra la AEAT
>
> **Los once hallazgos bloqueantes están cerrados.** El XML valida contra el XSD
> oficial, la huella reproduce los vectores publicados por la AEAT, el QR lo
> decodifica un lector, los endpoints salen del WSDL y las respuestas se parsean
> con los nombres reales.
>
> **Pero nadie ha enviado nunca nada a la AEAT con esto.** Todo se ha verificado
> contra los esquemas y los vectores oficiales, que es mucho más de lo que había,
> pero no contra el servicio. Falta además la parte con estado: la cadena sigue
> avanzando antes del envío, no hay control de flujo ni envío por lotes, y sin
> ellos el caudal quedaría en una factura por minuto.

**Empieza por aquí:** [`docs/AUDITORIA_CONFORMIDAD.md`](docs/AUDITORIA_CONFORMIDAD.md)
(qué está mal) → [`docs/PLAN_CORRECCIONES.md`](docs/PLAN_CORRECCIONES.md) (cómo
arreglarlo, **y sobre todo su sección de enmiendas**) →
[las issues](https://github.com/ramoncoroso/verifactu/issues), que llevan el
enunciado verificado de cada hallazgo y **mandan sobre los documentos**.

---

## Estado

| | |
|---|---|
| Tests | 740 en verde |
| CI | 9 jobs, incluido `Conformidad AEAT` |
| Dependencias de runtime | 1 (`qrcode-generator`, 0 transitivas) · `npm audit --omit=dev` → 0 |
| Hallazgos | 39 catalogados · **20 abiertos, 20 cerrados** |
| Bloqueantes | **0 de los 11 iniciales** |
| Publicación | **desarmada** con dos cerrojos, ver más abajo |

### La métrica que importa

No es cuántos tests hay: es **cuántos `it.fails` quedan**. Cada uno documentaba un
defecto abierto y se retiraba al corregirlo.

```
it.fails pendientes: 0
```

Se retiraron los quince. Cuando aparezca un hallazgo nuevo, el patrón es el mismo:
se escribe el test que lo documenta marcado `it.fails`, y corregirlo consiste en
quitarlo.

---

## Lo hecho, por si hay que auditarlo

**Auditoría y verificación.** 37 hallazgos contra la especificación, y después una
verificación adversarial de la propia auditoría: cada hallazgo se sometió a un
verificador con el encargo de *refutarlo*. **Once tenían afirmaciones falsas o
refutables** y aparecieron seis hallazgos más. Dos rectificaciones que conviene
conocer si se lee una versión antigua del documento:

- **VF-011 quedó refutado.** La cadena *debe* avanzar aunque la AEAT rechace el
  registro. Sustituido por VF-011R ([#21](https://github.com/ramoncoroso/verifactu/issues/21)).
- **VF-013 era correcto a medias.** Codificar el espacio como `+` es lo que
  prescribe la implementación de referencia de la AEAT; la «corrección» original
  habría roto lo que funcionaba.

**Red de conformidad** ([#70](https://github.com/ramoncoroso/verifactu/pull/70),
[#71](https://github.com/ramoncoroso/verifactu/pull/71)). Ocho esquemas oficiales
vendorizados y congelados por sha256, vectores de la huella, validación XSD con
`libxml2-wasm`, decodificación real de QR con `jsqr`, y comparación de los
endpoints contra el WSDL.

Un panel de revisión encontró tres agujeros en esa red y se taparon: los vectores
dependían del huso horario y no habrían podido ponerse en verde en el CI; el
control negativo del XSD validaba `<x/>` bajo el título «detecta la fecha en
formato ISO»; y no había oráculo ni para los endpoints ni para las respuestas, de
modo que *apuntar los endpoints a `example.com` seguía sin romper ningún test*.

**Correcciones** ([#72](https://github.com/ramoncoroso/verifactu/pull/72),
[#73](https://github.com/ramoncoroso/verifactu/pull/73),
[#74](https://github.com/ramoncoroso/verifactu/pull/74)):

- Endpoints y `SOAPAction` reales, con la dimensión del certificado de sello que
  faltaba —cambia el host, no es un detalle de autenticación—.
- Demolición del segundo generador de XML, muerto y divergente, y purga de nueve
  tests que afirmaban lo contrario de la norma. 1.184 líneas menos.
- **La huella reproduce los tres vectores oficiales**, incluido el extremo a
  extremo desde el modelo de dominio.

**Infraestructura.** Auditoría de seguridad **por alcance y no por umbral**
(`npm audit --omit=dev --audit-level=low`, que da cero y al ser «cero o falla» no
deja umbral que bajar la próxima vez), grupos de Dependabot separados con los
majors en PRs individuales, `LICENSE`, y la rama de release apuntando a `main`.

---

## Cómo continuar

Los siete primeros puntos del
[orden enmendado](docs/PLAN_CORRECCIONES.md#enmiendas-tras-la-revisión-del-2026-08-02)
están hechos. Lo que queda **ya no es conformidad de formato**: es diseño con
estado, más lo que solo se cierra contra el servicio real.

| # | Trabajo | h | Cierra |
|---|---|---:|---|
| **8** | **Cadena append-only y reenvío de bytes** | ~20 | #21 |
| **9** | **Control de flujo y envío por lotes** | ~14 | #22, #36 |
| **10** | **Endurecer transporte y parser** | ~14 | #30, #37, #39, #40 |
| **11** | **Puerta de calidad al CI** | ~8 | #28, #68 |
| **12** | **Preproducción** | — | requiere certificado |

**Empieza por el 8**, y con cuidado, porque es el que más fácilmente se hace mal:

- La cadena **debe avanzar** aunque la AEAT rechace el registro. Revertirla sería
  una no conformidad: el remedio normativo ante un rechazo es un alta de
  subsanación con `Subsanacion="S"` y `RechazoPrevio="X"`, no rehacer el anterior.
  Esto ya se documentó mal una vez, se refutó, y está en #21.
- El bug real está en el reintento: `submitInvoice` genera un `new Date()` nuevo
  en cada intento, así que produce **dos huellas distintas para la misma factura**
  justo cuando el primer envío pudo haber llegado. El arreglo es reenviar los
  bytes almacenados.
- Reintentar es seguro: la AEAT identifica el registro por
  `IDEmisorFactura + NumSerieFactura + FechaExpedicionFactura`, **no por la
  huella**, y devuelve el código `3000` con el bloque `RegistroDuplicado`. Ya se
  interpreta como éxito (`esRegistroYaPresentado` en `src/client/respuesta.ts`).

El **9** se apoya en el **8** y ya tiene los datos: `tiempoEsperaEnvioSeconds` y
`estadoEnvio` se parsean desde #78. Sin envío por lotes, respetar el art. 16.2
dejaría el caudal en **una factura cada 60 segundos**.

### Consejos de quien viene de arrastrarse por aquí

**Empieza por el test, y bórralo en vez de actualizarlo.** Si un test contradice
la norma, se borra. Actualizarlo al nuevo valor esperado lo convierte otra vez en
un test de caracterización, que es la razón de que 691 tests no detectaran ninguno
de los bloqueantes. En esta tanda cayeron 11 tests del cliente porque sus fixtures
construían facturas sin descripción, y 28 porque alimentaban al parser un formato
de respuesta inventado: eso era la señal de que el arreglo funcionaba.

**La validación XSD tiene dos puntos ciegos medidos**, escritos como tests
afirmativos en `xsd.test.ts`: una huella en Base64 **valida** contra el esquema, y
un `FechaHoraHusoGenRegistro` sin huso **también**. No concluyas que basta con que
el documento valide.

**Y hay defectos que ningún esquema detecta.** `TaxIdType` estaba desplazado una
posición: un destinatario con pasaporte se declaraba como NIF-IVA, y el XSD lo
acepta porque ambos son valores legales del enumerado. Contra eso solo sirve leer
el esquema, no validarlo.

**Dentro de `RespuestaLinea`, usa hijo directo y nunca búsqueda recursiva.**
`CodigoErrorRegistro` y `DescripcionErrorRegistro` aparecen dos veces —una en la
línea y otra dentro de `RegistroDuplicado`—, así que un `findNode` global mezcla el
error del registro con el del duplicado.

**Pasa `timeZone` explícita** a los formateadores de `src/format/aeat.ts` siempre
que el determinismo importe. Sin ella se hereda la del proceso, y
`new Date('2024-01-15')` es medianoche **UTC**: al oeste de Greenwich sale el día 14.

**No mergees `vitest@4` suelto** ([#65](https://github.com/ramoncoroso/verifactu/pull/65)):
`@vitest/coverage-v8@4` viaja en [#59](https://github.com/ramoncoroso/verifactu/pull/59)
y esa pareja no puede aterrizar por separado. `eslint@10` exige flat config y
`typescript@7` es incompatible con `@typescript-eslint@6`.

### Trampas conocidas

**La publicación está desarmada, y el `ROADMAP` está invertido a propósito.**
Pedía configurar `NPM_TOKEN` como tarea pendiente, y eso era justo lo que
desatascaba la publicación automática de una librería no conforme, versionada como
«parche seguro» porque las correcciones son commits `fix:`. Hay dos cerrojos —la
variable de repositorio `RELEASE_ENABLED` y `npmPublish: false`— y la lista de
condiciones para abrirlos está en el `ROADMAP`.

**Los tests no se comprueban de tipos** ([#68](https://github.com/ramoncoroso/verifactu/issues/68)).
`npm run typecheck:tests` y `npm run lint:all` siguen en rojo. Ahora con más
motivo, porque los enumerados cambiaron y varias fixtures arrastran valores
antiguos. Es el punto 11 del plan, y ya se puede hacer: los ficheros que faltaban
por reescribir ya están reescritos.

**Nada detecta que la AEAT publique una revisión de los esquemas.**
`npm run schemas:check` compara con los checksums registrados, pero solo descubre
un cambio si alguien ejecuta `schemas:fetch`, y nada lo programa. Un cron semanal
que abra un PR cuesta menos de una hora y no está en ninguna fase. La
especificación se movió dos veces mientras se escribía este código.

**Hay cuatro hallazgos del panel sin issue**, anotados al final de las enmiendas
del plan. Uno de ellos ha perdido la mitad de su gravedad al cerrarse #33 —las
respuestas ya no lanzan—, pero la otra mitad sigue viva: **la cadena avanza antes
del envío** y no se revierte ante un error no reintentable. Es lo primero que hay
que resolver en el punto 8.

**Y aparecen PRs de bots.** Cinco en una tarde, tres arreglos duplicados dos
veces, de una cuenta sin nombre con 67 repos y cero seguidores, minutos después de
publicar las issues. Uno de los arreglos era correcto. Si molesta, en
*Settings → Actions* se puede exigir aprobación para ejecutar workflows de
colaboradores externos.

### Decisiones pendientes, y son del mantenedor

- **El nombre del paquete** ([#46](https://github.com/ramoncoroso/verifactu/issues/46)).
  `verifactu` pertenece a un tercero en npm desde enero de 2024. Scope propio o
  disputa de nombres. Bloquea cualquier publicación.
- **Si los esquemas deben viajar en el tarball.** Hoy `files: ["dist", "schemas"]`
  redistribuye documentos de la AEAT y del W3C en un paquete que se anuncia MIT, y
  solo los necesita el helper de tests.
- **Si `schema-validator.ts` se borra o se sustituye.** Son 407 líneas sin
  consumidores que reimplementan el XSD a mano, pero borrarlas cambia validación
  local previa al envío por «que lo diga la AEAT». Si la validación local es un
  requisito de producto, hay que **sustituirla**, no borrarla.
- **El certificado de preproducción.** Es lo único que confirma que un registro es
  aceptado de verdad. Tiene plazo de tramitación y no consume horas de ingeniería:
  conviene iniciarlo cuanto antes porque bloquea el final.

---

## Comandos

```bash
npm ci
npm test                  # 720 tests
npm run test:conformance   # solo la red de conformidad
npm run schemas:check      # integridad de los esquemas oficiales, sin red
npm run schemas:fetch      # redescargar de la AEAT y regenerar checksums
npm run typecheck          # solo src
npm run typecheck:tests    # src y tests — hoy en rojo, ver #68
npm run lint
npm run build
```

## Recursos

- [AEAT · Sistemas informáticos de facturación y Veri\*Factu](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html)
- [AEAT · Portal de desarrolladores](https://www.agenciatributaria.es/AEAT.desarrolladores/Desarrolladores/_menu_/Documentacion/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU.html)
- Esquemas y WSDL vendorizados, con su procedencia: [`schemas/PROVENANCE.md`](schemas/PROVENANCE.md)
