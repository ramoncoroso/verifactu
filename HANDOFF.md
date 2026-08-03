# Handoff

Librería TypeScript para el sistema **Veri\*Factu** de la AEAT. Node.js 18+.

> ## Estado: todos los issues cerrados, falta la prueba contra preproducción
>
> **Todos los issues están cerrados**: los once hallazgos bloqueantes y los
> trece issues del backlog. El XML valida contra el XSD oficial, la huella reproduce los
> vectores publicados por la AEAT, el QR lo decodifica un lector independiente,
> los endpoints salen del WSDL, las respuestas se parsean con los nombres reales,
> el control de flujo del art. 16.2 está implementado y el envío por lotes
> también.
>
> **Pero nadie ha enviado nunca nada a la AEAT con esto.** Todo se ha verificado
> contra los esquemas, los vectores y el catálogo de errores oficiales, que es
> mucho más de lo que había, pero no contra el servicio real. Ese es el único
> paso que queda, y necesita un certificado electrónico válido.

**Empieza por aquí:** [`docs/AUDITORIA_CONFORMIDAD.md`](docs/AUDITORIA_CONFORMIDAD.md)
(qué estaba mal, con la prueba de mutación al final de «Metodología») →
[`docs/PLAN_CORRECCIONES.md`](docs/PLAN_CORRECCIONES.md) (cómo se arregló, **y
sobre todo su sección de enmiendas**) →
[las issues cerradas](https://github.com/ramoncoroso/verifactu/issues?q=is%3Aissue+is%3Aclosed),
que llevan el enunciado verificado de cada hallazgo y **mandan sobre los
documentos**.

---

## Estado

| | |
|---|---|
| Tests | **1017** en verde (37 ficheros) |
| Cobertura | 93,5 % · umbrales 91/94/87/91, ajustados a la realidad |
| `typecheck` + `typecheck:tests` | limpios, ambos bloqueantes en CI |
| `lint:all` | limpio (14 warnings `no-console` intencionados) |
| Dependencias de runtime | **1** (`qrcode-generator`, MIT, 0 transitivas) |
| `npm audit --omit=dev` | 0 vulnerabilidades, puerta de tolerancia cero |
| Duración de la suite | 5,6 s |
| Jobs del CI | 11, incluido el humo sobre el paquete instalado |
| Issues abiertos | **0** · PRs abiertos: **0** · ramas: solo `main` |
| Publicación en npm | **desarmada** a doble llave (ver abajo) |

---

## Lo hecho en esta sesión

Trece PR, cada uno con su CI en verde antes de mergear, y cada corrección
precedida de **un test que falla**. Regla de la casa: *corregir un hallazgo es
quitar un `.fails`*; los tests que contradicen la norma **se borran, no se
actualizan**.

### El diagnóstico de fondo

El repositorio tenía 691 tests y 94 % de cobertura, y **cero** detectaban los
once defectos bloqueantes. La causa no era falta de tests: era la **ausencia de
un oráculo externo**. Cada test comparaba el código consigo mismo.

Medido por mutación sobre el estado inicial: cambiar los endpoints a
`example.com` no rompía **ningún** test, y 21 de los 22 tests de QR pasaban con
una imagen en blanco.

La respuesta fue construir el oráculo antes que las correcciones: vectores de
huella oficiales, validación XSD real con `libxml2-wasm`, decodificación de QR
con `jsqr`, comparación contra el WSDL y contra `errores.properties`. Todo
vendorizado en `schemas/` y **congelado por sha256**.

### Los PR, por orden

| PR | Qué cierra | Lo esencial |
|---|---|---|
| Fase 0 | infraestructura | `schemas/` congelado, helpers de XSD, red de tests de conformidad |
| Huella | VF-002/003/004/015 | `src/format/aeat.ts` como única fuente de formato; `computeHuella` con hex en mayúsculas |
| XML | VF-005/006/009/033/034 | Serializador de árbol, espacios de nombres correctos, `BaseImponibleOimporteNoSujeto` |
| QR | VF-013/025 | Motor `qrcode-generator`, cuatro parámetros, SVG en milímetros |
| Cliente | VF-007/023/011R | Endpoints del WSDL, parser de respuestas real, reintento que no regenera el registro |
| [#80](https://github.com/ramoncoroso/verifactu/pull/80) | #30 #31 #37 #39 #40 | Parser XML robusto, estado HTTP, gzip, backoff real, carrera de concurrencia |
| [#81](https://github.com/ramoncoroso/verifactu/pull/81) | #45 | Régimen, calificación e impuesto **por línea** + 13 reglas de coherencia |
| [#82](https://github.com/ramoncoroso/verifactu/pull/82) | #24 | `K`/`L`/`M` son persona física (módulo 23), no CIF |
| [#83](https://github.com/ramoncoroso/verifactu/pull/83) | #22 #36 | `SubmissionPacer` (art. 16.2) + `submitInvoices()` hasta 1000 registros |
| [#84](https://github.com/ramoncoroso/verifactu/pull/84) | #29 | Diagnóstico accionable de los `.p12` heredados, también en el camino real |
| [#85](https://github.com/ramoncoroso/verifactu/pull/85) | #68 #28 | Los tests entran en la puerta de calidad; prueba de mutación documentada |
| [#86](https://github.com/ramoncoroso/verifactu/pull/86) | — | README en ambos idiomas, con los 24 ejemplos compilados antes de publicarlos |
| [#87](https://github.com/ramoncoroso/verifactu/pull/87) | #46 | Alcance `@ramoncoroso/verifactu`, acceso público y esquemas fuera del tarball |
| [#88](https://github.com/ramoncoroso/verifactu/pull/88) | — | Los ejemplos del README **se ejecutan**, no solo compilan |
| [#89](https://github.com/ramoncoroso/verifactu/pull/89) | — | El humo sobre el paquete instalado entra en el CI |
| [#90](https://github.com/ramoncoroso/verifactu/pull/90) | 15 PR de dependabot | Dependencias de desarrollo al día y migración a *flat config* |
| [#91](https://github.com/ramoncoroso/verifactu/pull/91) | — | El error del QR deja de mentir sobre la causa; test intermitente a reloj falso |

### La prueba de humo sobre el paquete instalado

```bash
npm run smoke
```

**Es la única capa que valida el artefacto publicado.** Todo lo demás —tests,
typecheck, lint— importa `src/`, así que es ciego a lo que ocurre al empaquetar:
qué entra en `files`, si el campo `exports` resuelve, si el build de CommonJS
carga, si los `.d.ts` que salen tipan. Compila, empaqueta, instala el tarball en
un proyecto temporal y lo usa como lo usaría cualquiera.

Corre en el CI como job **«Humo · paquete instalado»**. Se comprobó que detecta
regresiones de verdad, con tres mutaciones: devolver `schemas/` al tarball, dejar
el QR en blanco y romper la ruta del `require` en `exports`. Las tres lo ponen
rojo.

Lo que comprueba: instalación limpia (2 paquetes, 1 dependencia, 0
vulnerabilidades), contenido del tarball, **ESM** y **CommonJS**, los `.d.ts`
publicados bajo `--strict`, el vector de huella 6.1 de la AEAT, el QR
decodificado con `jsqr` coincidiendo carácter a carácter con la URL de cotejo,
los endpoints del WSDL y el rechazo local de lo que la AEAT rechazaría.

Lo que encontró la primera vez que se ejecutó, con la suite entera en verde. Los
dos en el README y los dos míos:

1. **Tres ejemplos por idioma reventaban al ejecutarse** —construían la factura
   sin `.type()`—, incluido el de «Inicio rápido». **Compilaban perfectamente**:
   el tipo de factura se valida en tiempo de ejecución, no en el de tipos, y la
   verificación del #86 solo comprobó que compilaran. Compilar no es ejecutar.
2. **El ejemplo de exentas no era conforme**: `E2` con régimen general, que la
   AEAT rechaza con el error 1199. Lo cazó la validación de #81 —la librería
   tenía razón y la documentación no—. De paso, el comentario llamaba a `E2`
   «entrega intracomunitaria» cuando es el art. 21, exportaciones.

El arreglo duradero está en `tests/unit/ejemplos-del-readme.test.ts`, que extrae
del README las cadenas del builder y **las ejecuta**.

### Limpieza del repositorio · 2026-08-03

Estaba en **15 PR abiertos y una rama huérfana**. Ahora: 0 PR, 0 issues y solo
`main`.

Las quince eran de dependabot y **todas estaban en rojo**: su CI fallaba en
`npm ci` a los diez segundos porque el lockfile cambió de nombre al adoptar el
alcance en #87, y su base era anterior a trece PR de trabajo. Rebasarlas una a
una son quince ciclos de CI, así que se subió todo junto en #90 y se cerraron en
bloque con el motivo escrito en cada una.

Se borró también `master`, un resto de la renombrada: ancestro de `main` y sin un
solo commit propio. El CI dejó de dispararse en ella.

Tres hallazgos del linter al subir. **Dos de ellos escondían defectos de verdad**,
que se corrigieron después en #91 al mirarlos a fondo:

- `soap-client.ts` rechazaba promesas con un `unknown`; ahora garantiza `Error`.
- El `catch` sin usar de `qr/generator.ts` no era cosmético: atribuía **cualquier**
  fallo de `qrcode-generator` a «datos demasiado grandes» con un máximo cableado
  a 2331 —la capacidad del nivel M—. Con nivel `H` producía «1400 bytes exceeds
  maximum 2331», un mensaje que se contradice a sí mismo, y un nivel de
  corrección ilegal se disfrazaba de datos grandes. Además la librería lanza
  **cadenas**, no `Error`, así que el `catch` tiraba el único texto útil.
- `retry.test.ts` cronometraba con el reloj real. Ensanchar el margen reducía la
  intermitencia sin quitar la causa; ahora usa temporizadores falsos y la medida
  es exacta.

Y un aviso para el próximo que mire la cobertura: si alguien sube
`@vitest/coverage-v8` a la 4, `branches` cae del 89,6 al 84,6 **sin que cambie
una línea de código** —mide las ramas de otra forma—. No es una regresión; hay
que rebasear. Queda escrito en `vitest.config.ts`.

### Decisiones que conviene no revertir sin leer el porqué

- **La cadena no retrocede ante un rechazo.** Era la prescripción original de
  VF-011 y la verificación adversarial demostró que revertir sería una **no
  conformidad**: el registro ya está generado y su huella impresa en el QR de
  una factura entregada (arts. 7 y 10 del RRSIF). El remedio es un **alta de
  subsanación**. `RecordChain` no expone `revert`, `rollback` ni `restore`, y
  hay un test que lo comprueba.
- **`URLSearchParams` en el QR es correcto.** La corrección propuesta
  (`encodeURIComponent`) era errónea: la implementación de referencia de la AEAT
  usa `URLEncoder.encode`, que codifica el espacio como `+`.
- **El control de flujo va activo por defecto.** El art. 16.2 dice «deberán
  implementar». Se desactiva con `flowControl: false` y la responsabilidad pasa a
  quien lo desactiva.
- **Los prefijos de CIF admiten ambos controles.** Se leyó entera la Orden
  EHA/451/2008: su art. 2 dice solo «un carácter de control», sin precisar el
  tipo. El reparto que circula —Wikipedia incluida— no tiene respaldo normativo y
  las implementaciones de referencia discrepan entre sí.
- **La validación se ejecuta antes de mover la cadena.** `prepareAlta` avanzaba
  el estado antes de construir el XML; una factura no serializable dejaba la
  cadena apuntando a un registro fantasma.
- **El paquete va con alcance.** `verifactu` a secas pertenece a un tercero desde
  2024 —223 bytes, nunca actualizado—. Reclamarlo era lento e incierto y habría
  bloqueado la publicación mientras tanto; el alcance está disponible hoy y
  conserva la marca.
- **TypeScript se queda en la 5.9 y vitest en la 3.** No es dejadez: `typescript-eslint@8`
  declara `peer typescript ">=4.8.4 <6.1.0"`, así que la 7 desactivaría las reglas
  con información de tipos —las que cazaron varios defectos de esta auditoría—. Y
  vitest 4 exige `node ^20 || ^22 || >=24`, mientras la librería promete `>=18`;
  subirlo obligaría a dejar Node 18 sin probar o a romper la compatibilidad. Las
  dos PR de dependabot se cerraron con ese motivo escrito.
- **La auditoría de seguridad es de alcance, no de umbral.** Árbol de producción
  con tolerancia cero (bloqueante); árbol completo, informativo. No hay nivel que
  bajar la próxima vez.

### La publicación está desarmada a doble llave

1. La variable de repositorio `RELEASE_ENABLED` no está puesta.
2. `npmPublish: false` en la configuración de `semantic-release`.

Sigue así **a propósito**, aunque el nombre ya esté resuelto: falta la prueba contra
preproducción, y abrir la publicación son tres actos deliberados que nadie puede hacer
desde el código. El `ROADMAP.md` lleva la lista, con dos de sus tres casillas ya marcadas.

El paquete se publica como **`@ramoncoroso/verifactu`**, con
`publishConfig.access: "public"` —npm publica los paquetes con alcance como privados por
defecto y sin eso el `publish` falla con un 402—. Y el tarball ya **no** lleva `schemas/`:
ningún módulo de `src/` los lee en tiempo de ejecución, así que redistribuir documentos de
la AEAT y del W3C en un paquete que se anuncia MIT no aportaba nada. El tarball bajó a 10
ficheros.

---

## Cómo continuar

### 1. Prueba contra preproducción · **el único paso que falta**

Es lo único que separa a la librería de estar verificada de punta a punta.
Necesita un certificado electrónico de representante o de sello válido.

```
Host sandbox: prewww1.aeat.es (representante) · prewww10.aeat.es (sello)
```

Qué comprobar, por orden:

1. Que el handshake TLS funciona con el certificado real.
2. Que un alta mínima devuelve `EstadoEnvio = Correcto` y un CSV.
3. Que el `TiempoEsperaEnvio` que devuelve la AEAT es el que el pacer aplica.
4. Que una segunda factura encadena y se acepta.
5. Que un lote de 3 se acepta en una sola petición.
6. Que una anulación de la primera factura se acepta.
7. Que el QR generado se coteja de verdad en `prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR`.

Los tres primeros fallos que aparezcan probablemente sean de datos censales
(NIF no identificado, certificado no apoderado), no de la librería: los errores
`4104`, `4107` y `4112` de `schemas/errores.properties` son justo eso.

### 2. Backlog opcional, por si aparece necesidad

Nada de esto bloquea nada, y ninguno tiene issue abierto:

- **`InvoiceBatcher`** — `enqueue()` + `flush()` automático al llegar a 1000
  registros o al vencer `t`, lo que ocurra primero. Hoy hay que orquestar el
  lote a mano con `submitInvoices()`.
- **Decidir si se sube el mínimo a Node 20** — Node 18 está en EOL desde abril
  de 2025, y mantenerlo bloquea vitest 4 y arrastrará más herramientas. Es un
  cambio incompatible para quien instala la librería, así que la decisión es del
  propietario, no de una limpieza de dependencias.
- **Persistencia de la cadena** — la librería expone `getChainState()` y acepta
  `chainState`, pero no trae adaptador. Un `ChainStore` con implementación en
  fichero y en Postgres ahorraría a cada usuario escribirlo.
- **Property testing con `fast-check`** — sobre `formatAeatAmount` y el
  encadenamiento. Estaba en el plan y no llegó a hacerse.
- **`RefExterna` y `FacturaSimplificadaArticulos7273`** — campos opcionales del
  XSD que el modelo no expresa.
- **Consulta paginada** — `checkInvoiceStatus` consulta una factura; la operación
  `ConsultaFactuSistemaFacturacion` admite filtros por rango de fechas y devuelve
  hasta 10.000 registros con paginación por `ClavePaginacion`.

---

## Mapa del código

| Ruta | Qué vive ahí |
|---|---|
| `src/format/aeat.ts` | **Única** fuente de formato: fechas, importes, tipos, `trim` con semántica Java |
| `src/crypto/hash.ts` | Huella. `computeHuella` es el único que llama a `createHash` |
| `src/crypto/chain.ts` | Cadena. Sin operaciones de retroceso, a propósito |
| `src/xml/serializer.ts` | Árbol de nodos → XML. `escapeText` no se exporta |
| `src/xml/verifactu/registro.ts` | Transcripción mecánica del XSD, revisable línea a línea |
| `src/xml/mapping/` | Donde vive la lógica opinable, separada de la transcripción |
| `src/client/pacer.ts` | Control de flujo del art. 16.2 |
| `src/client/respuesta.ts` | Parser de respuestas. Usa `getChild`, nunca `findNode`, dentro de `RespuestaLinea` |
| `schemas/` | XSD, WSDL y `errores.properties` oficiales, congelados por sha256 |
| `tests/conformance/` | La capa que contrasta con la AEAT. **Si tocas algo, empieza por aquí** |
| `tests/helpers/` | `xsd.ts` (validación real), `mutable.ts` (`Mutable<T>` e `invalido<T>`) |

---

## Comandos

```bash
npm test                 # 977 tests
npm run test:conformance # solo la capa con oráculo externo
npm run test:coverage    # con umbrales
npm run typecheck        # src
npm run typecheck:tests  # tests
npm run lint:all         # src + tests
npm run schemas:check    # integridad de los esquemas, sin red
npm run build            # ESM + CJS + tipos
```

## Recursos

- [Orden HAC/1177/2024](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-22138) — arts. 16.2, 20 y 21
- [RD 1007/2023 (RRSIF)](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2023-24840) — arts. 7 y 10
- [RD 1065/2007 (RGAT)](https://www.boe.es/buscar/act.php?id=BOE-A-2007-15984) — arts. 19.2 y 20.2, los NIF `K`/`L`/`M`
- [Especificaciones y XSD de la AEAT](https://www.agenciatributaria.es/AEAT.desarrolladores/Desarrolladores/_menu_/Documentacion/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU.html)

> Descargar las fuentes de la AEAT falla con `curl` por defecto en sistemas con
> OpenSSL 3 (*CA signature digest algorithm too weak*): hay que forzar
> `--ciphers 'DEFAULT@SECLEVEL=0'`. `scripts/fetch-schemas.mjs` ya lo contempla.
