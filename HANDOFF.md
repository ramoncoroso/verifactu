# Handoff

Librería TypeScript para el sistema **Veri\*Factu** de la AEAT. Node.js 18+.

> ## Estado: todos los issues técnicos cerrados, falta preproducción
>
> **Los once hallazgos bloqueantes y los doce issues técnicos abiertos están
> cerrados.** El XML valida contra el XSD oficial, la huella reproduce los
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
| Tests | **977** en verde (34 ficheros) |
| Cobertura | 93,5 % · umbrales 91/94/87/91, ajustados a la realidad |
| `typecheck` + `typecheck:tests` | limpios, ambos bloqueantes en CI |
| `lint:all` | limpio (14 warnings `no-console` intencionados) |
| Dependencias de runtime | **1** (`qrcode-generator`, MIT, 0 transitivas) |
| `npm audit --omit=dev` | 0 vulnerabilidades, puerta de tolerancia cero |
| Duración de la suite | 4,5 s |
| Issues abiertos | **1**, y es una decisión tuya: [#46](https://github.com/ramoncoroso/verifactu/issues/46) |
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
- **La auditoría de seguridad es de alcance, no de umbral.** Árbol de producción
  con tolerancia cero (bloqueante); árbol completo, informativo. No hay nivel que
  bajar la próxima vez.

### La publicación está desarmada a doble llave

1. La variable de repositorio `RELEASE_ENABLED` no está puesta.
2. `npmPublish: false` en la configuración de `semantic-release`.

**No pongas `NPM_TOKEN`** hasta resolver [#46](https://github.com/ramoncoroso/verifactu/issues/46).
El `ROADMAP.md` lo dice también, con esa misma redacción invertida a propósito.

---

## Cómo continuar

### 1. Resolver el nombre en npm — [#46](https://github.com/ramoncoroso/verifactu/issues/46) · **decisión tuya**

Es el único issue abierto y no se puede cerrar desde el código. `verifactu` está
ocupado en npm por un tercero. Opciones, de más a menos recomendable:

- **Alcance de organización**: `@ramoncoroso/verifactu` o `@<empresa>/verifactu`.
  Es gratis para paquetes públicos, no depende de nadie y no hay que renombrar
  nada dentro del código.
- **Otro nombre**: `verifactu-ts`, `verifactu-client`, `aeat-verifactu`. Hay que
  comprobar disponibilidad antes.
- **Reclamar el nombre** vía la política de disputas de npm. Lento, incierto y
  probablemente innecesario.

Mientras tanto, el README ya documenta la instalación desde GitHub.

### 2. Prueba contra preproducción · **el paso que falta**

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

### 3. Backlog opcional, por si aparece necesidad

Nada de esto bloquea nada, y ninguno tiene issue abierto:

- **`InvoiceBatcher`** — `enqueue()` + `flush()` automático al llegar a 1000
  registros o al vencer `t`, lo que ocurra primero. Hoy hay que orquestar el
  lote a mano con `submitInvoices()`.
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
