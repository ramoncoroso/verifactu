# Handoff

Librería TypeScript para el sistema **Veri\*Factu** de la AEAT. Node.js 18+.

> ## ⚠️ Estado: no apta para producción
>
> Un envío no sería aceptado por la AEAT. **El XML sigue sin validar** contra el
> esquema oficial, el generador de QR produce imágenes que ningún lector
> decodifica, y el parseo de respuestas busca elementos que no existen, de modo
> que toda respuesta real lanza una excepción aunque el registro haya sido
> aceptado.
>
> **Lo que ya sí es conforme:** la huella, el formateo de fechas e importes, los
> endpoints y la `SOAPAction`.

**Empieza por aquí:** [`docs/AUDITORIA_CONFORMIDAD.md`](docs/AUDITORIA_CONFORMIDAD.md)
(qué está mal) → [`docs/PLAN_CORRECCIONES.md`](docs/PLAN_CORRECCIONES.md) (cómo
arreglarlo, **y sobre todo su sección de enmiendas**) →
[las issues](https://github.com/ramoncoroso/verifactu/issues), que llevan el
enunciado verificado de cada hallazgo y **mandan sobre los documentos**.

---

## Estado

| | |
|---|---|
| Tests | 720 en verde, cobertura ~95 % |
| CI | 9 jobs, incluido `Conformidad AEAT` |
| Dependencias de runtime | ninguna · `npm audit --omit=dev` → 0 |
| Hallazgos | 39 catalogados · **30 abiertos, 9 cerrados** |
| Bloqueantes | **8 de los 11 iniciales** |
| Publicación | **desarmada** con dos cerrojos, ver más abajo |

### La métrica que importa

No es cuántos tests hay: es **cuántos `it.fails` quedan**. Cada uno documenta un
defecto abierto y se retira al corregirlo.

```
VF-001 (QR) · VF-005 (escapado) · VF-006 (estructura XML) · VF-012 · VF-023 (respuestas)
```

Se han retirado diez desde que se montó la red.

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

El orden está en
[`docs/PLAN_CORRECCIONES.md` § Enmiendas](docs/PLAN_CORRECCIONES.md#enmiendas-tras-la-revisión-del-2026-08-02).
Los cuatro primeros puntos están hechos. Lo siguiente:

| # | Trabajo | Cierra | Notas |
|---|---|---|---|
| **1** | **El XML conforme** | #15, #16, #19, #20, #34, #35, #43, #44 | Es el bloque grande, ~45 h. Un árbol que escapa siempre en la serialización y una tabla de orden derivada del XSD, para que el escapado olvidado y el orden incorrecto sean **inexpresables**, no corregidos |
| **2** | **El parseo de respuestas** | #33, #22 | ~7 h. **El oráculo ya está escrito** en `tests/conformance/respuesta.test.ts`, con respuestas validadas contra `RespuestaSuministro.xsd` |
| **3** | **El QR** | #10, #23 | ~18 h, **independiente del resto**: se puede hacer en paralelo desde hoy. El control positivo y el test de decodificación ya existen |

### Consejos de quien viene de arrastrarse por aquí

**Empieza por el test, y bórralo en vez de actualizarlo.** Si un test existente
contradice la norma, se borra. Actualizarlo al nuevo valor esperado lo convierte
otra vez en un test de caracterización, que es la razón de que 691 tests no
detectaran ninguno de los bloqueantes.

**La validación XSD tiene dos puntos ciegos medidos**, y están escritos como tests
afirmativos en `xsd.test.ts`: una huella en Base64 **valida** contra el esquema, y
un `FechaHoraHusoGenRegistro` sin huso **también**. No concluyas que basta con que
el documento valide.

**Pasa `timeZone` explícita** a los formateadores de `src/format/aeat.ts` siempre
que el determinismo importe. Sin ella se hereda la del proceso, y
`new Date('2024-01-15')` es medianoche **UTC**: en cualquier huso al oeste de
Greenwich sale el día 14.

**No mergees `vitest@4` suelto** ([#65](https://github.com/ramoncoroso/verifactu/pull/65)):
`@vitest/coverage-v8@4` viaja en [#59](https://github.com/ramoncoroso/verifactu/pull/59)
y esa pareja no puede aterrizar por separado. `eslint@10` exige migrar a flat
config y `typescript@7` es incompatible con `@typescript-eslint@6`. Los baratos
son `husky`, los de `commitlint` y los tres de actions.

### Trampas conocidas

**La publicación está desarmada, y el `ROADMAP` está invertido a propósito.**
Pedía configurar `NPM_TOKEN` como tarea pendiente, y eso era justo lo que
desatascaba la publicación automática de una librería no conforme, versionada como
«parche seguro» porque las correcciones son commits `fix:`. Hay dos cerrojos —la
variable de repositorio `RELEASE_ENABLED` y `npmPublish: false`— y la lista de
condiciones para abrirlos está en el `ROADMAP`.

**Los tests no se comprueban de tipos** ([#68](https://github.com/ramoncoroso/verifactu/issues/68)).
`npm run typecheck:tests` da hoy 169 errores y `npm run lint:all` otros 97. La
mayoría vive en ficheros que el bloque del XML reescribe, así que la puerta se
enchufa al CI **después**, no antes.

**Nada detecta que la AEAT publique una revisión de los esquemas.**
`npm run schemas:check` compara con los checksums registrados, pero solo descubre
un cambio si alguien ejecuta `schemas:fetch`, y nada lo programa. Un cron semanal
que abra un PR cuesta menos de una hora y no está en ninguna fase. La
especificación se movió dos veces mientras se escribía este código.

**Hay cuatro hallazgos del panel sin issue**, anotados al final de las enmiendas
del plan. El más serio: la cadena avanza *antes* del envío, `AeatError` no es
reintentable, y #33 hace que toda respuesta real lance — así que contra la AEAT
real la cadena avanzaría en cada envío que el llamante ve como fallido. Ninguna
issue describe esa composición.

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
