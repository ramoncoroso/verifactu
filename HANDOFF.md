# Handoff

Librería TypeScript para el sistema **Veri\*Factu** de la AEAT. Node.js 18+.

> ## ⚠️ Estado: no apta para producción
>
> Un envío no sería aceptado por la AEAT. El generador de QR produce imágenes que
> ningún lector decodifica, la huella se emite en Base64 en vez de hexadecimal, el
> XML no valida contra el XSD oficial, los endpoints son los del SII y el parseo de
> respuestas busca elementos que no existen — de modo que toda respuesta real
> lanza una excepción aunque el registro haya sido aceptado.
>
> La arquitectura, los modelos, la jerarquía de errores, el retry, el limitador de
> concurrencia y el logger sí están consolidados.

**Empieza por aquí:** [`docs/AUDITORIA_CONFORMIDAD.md`](docs/AUDITORIA_CONFORMIDAD.md)
(qué está mal) → [`docs/PLAN_CORRECCIONES.md`](docs/PLAN_CORRECCIONES.md) (cómo
arreglarlo y en qué orden) → [las issues](https://github.com/ramoncoroso/verifactu/issues)
(el enunciado verificado de cada hallazgo, que **manda sobre los documentos**).

---

## Dónde está el proyecto

| | |
|---|---|
| Tests | 721 en verde, cobertura 94,88 % |
| CI | 9 jobs en verde, incluido `Conformidad AEAT` |
| Dependencias de runtime | ninguna · `npm audit --omit=dev` → 0 |
| Hallazgos | 38 catalogados · **30 issues abiertas** |
| Versión | 1.0.0 (nunca publicada bajo este nombre, ver #46) |

### Lo que se hizo en la sesión del 2026-08-02

**Auditoría de conformidad.** 37 hallazgos contra la especificación de la AEAT,
cada uno con archivo, línea, cita de la fuente oficial y criterio de aceptación.

**Verificación adversarial de la propia auditoría.** Cada hallazgo se sometió a un
verificador con el encargo de *refutarlo*: fuente oficial redescargada, código
comprobado línea a línea y demostración ejecutable exigida. **Once tenían
afirmaciones falsas o refutables** y aparecieron seis hallazgos más. Dos
rectificaciones importantes, por si alguien lee una versión antigua del documento:

- **VF-011 quedó refutado.** La cadena *debe* avanzar aunque la AEAT rechace el
  registro; revertirla sería una no conformidad. Sustituido por VF-011R (#21).
- **VF-013 era correcto a medias.** El parámetro `huella` sobra, sí; pero
  codificar el espacio como `+` es lo que prescribe la implementación de
  referencia de la AEAT, y la «corrección» original habría roto lo que funcionaba.

**Fase 0 del plan**, en tres PRs (#67, #70 y #52):

- `schemas/` con los ocho esquemas oficiales, byte a byte y congelados por sha256.
  `npm run schemas:check` no toca la red y falla si la AEAT publica una revisión.
- Una red de tests de conformidad en `tests/conformance/`: vectores oficiales de la
  huella, validación contra XSD con `libxml2-wasm` y decodificación real de QR con
  `jsqr`. Los defectos abiertos van marcados `it.fails`, de modo que al corregirlos
  el test se invierte y obliga a quitar el `.fails`.
- Puerta de auditoría de seguridad **por alcance, no por umbral**:
  `npm audit --omit=dev --audit-level=low` bloqueante (hoy da cero, y al ser «cero o
  falla» no queda ningún umbral que bajar la próxima vez) y la del árbol completo
  como job informativo.
- Grupos de Dependabot separados por área, con los majors en PRs individuales y las
  actualizaciones de seguridad nunca agrupadas.
- `LICENSE`, `package.json` completo, rama de release a `main`, `tsconfig.test.json`.

---

## Cómo continuar

**No arranques por la fase 1 tal y como está escrita en el plan.** Un panel de
revisión la desmontó y el orden correcto está en
[`docs/PLAN_CORRECCIONES.md` § Enmiendas](docs/PLAN_CORRECCIONES.md#enmiendas-tras-la-revisión-del-2026-08-02).
Resumen:

| # | Trabajo | h | Por qué va antes |
|---|---|---:|---|
| 1 | **Tapar los agujeros de la red de conformidad** | ~1 | Sin esto la fase 1 no tiene criterio de aceptación observable |
| 2 | **Desarmar el pipeline de release** | ~1 | Es la única acción irreversible disponible en el repositorio |
| 3 | **Demoler** `templates/`, `schema-validator.ts` y los tests anti-norma | ~8 | 2.099 líneas sin llamantes que obligan a edición sincronizada en cada fase |
| 4 | **Fase 1 enmendada**, con VF-007 dentro | ~21 | Ya con el oráculo arreglado y sin código condenado que mantener |

### Trampas conocidas

**Los tests de vectores de la huella dependen del huso horario.** Verificado: el
formateador que propone la fase 1 emite `…T19:20:30+01:00` en `Europe/Madrid` y
`…T18:20:30+00:00` en UTC. El CI corre en UTC y no hay `TZ` fijada en ninguna
parte, así que **una implementación perfecta de la fase 1 dejaría esos tests en
rojo**. Hay que fijar la zona antes de tocar nada.

**El criterio de aceptación que promete el plan para la fase 1 no existe.** Dice
que los tests de `templates/` «dejarán de compilar». No lo harán: `tsconfig.json`
excluye los tests y vitest transpila sin comprobar tipos. De hecho ya no compilan
hoy (169 errores de tipos, #68) y el CI está verde.

**La demostración estelar de la auditoría sigue siendo cierta.** Apuntar los
endpoints a `example.com` no rompe ningún test, porque nada compara
`src/client/endpoints.ts` con `schemas/SistemaFacturacion.wsdl`, que ya está
vendorizado y contiene la verdad. Lo mismo con las respuestas:
`validateRespuestaSuministro` está exportada y no la usa nadie, así que VF-023
—un bloqueante— tampoco tiene oráculo. Es el punto 1 de la tabla.

**El pipeline de release está armado.** Dispara desde `main` y falla en
`verifyConditions` por `NPM_TOKEN` inválido, antes de analizar commits: no crea
tag ni publica. Pero el `ROADMAP.md` pedía configurar `NPM_TOKEN` como tarea
pendiente, y hacerlo detonaría la publicación automática de una librería no
conforme con semver diciendo «parche seguro». **No configures `NPM_TOKEN` hasta
que la puerta de conformidad esté verde.**

**El nombre `verifactu` está ocupado en npm** por un tercero desde enero de 2024
(#46). Ninguna fase del plan lo posee, y condiciona cualquier publicación. Es una
decisión del mantenedor: scope propio (`@ramoncoroso/verifactu`) o disputa de
nombres.

### Lo que queda pendiente de la fase 0

- **#24** — tabla de prefijos de CIF. `K`, `L` y `M` no son CIF sino NIF de persona
  física con control por módulo 23. Cuidado: la Orden EHA/451/2008 **no contiene**
  la tabla de controles que se le suele atribuir, y las implementaciones de
  referencia discrepan entre sí. Buen `good first issue`.
- Purga de los tests que afirman lo contrario de la norma. Conviene hacerla pegada
  a cada corrección, no en bloque, para no dejar huecos sin cobertura.

### Dependabot

15 PRs abiertos, casi todos majors, tras separar los grupos. **No mergees
`vitest@4` (#65) suelto**: `@vitest/coverage-v8@4` viaja en el #59 y esa pareja no
puede aterrizar por separado. `eslint@10` (#55) exige migrar a flat config, y
`typescript@7` (#56) es incompatible con `@typescript-eslint@6`. Los baratos son
`husky` (#64), los de `commitlint` (#57, #58) y los tres de actions (#53, #54, #8).

---

## Comandos

```bash
npm ci
npm test                  # 721 tests
npm run test:conformance  # solo la red de conformidad
npm run schemas:check     # integridad de los esquemas oficiales, sin red
npm run schemas:fetch     # redescargar de la AEAT y regenerar checksums
npm run typecheck         # solo src (los tests no se comprueban todavía, ver #68)
npm run lint
npm run build
```

## Recursos

- [AEAT · Sistemas informáticos de facturación y Veri\*Factu](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html)
- [AEAT · Portal de desarrolladores](https://www.agenciatributaria.es/AEAT.desarrolladores/Desarrolladores/_menu_/Documentacion/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU.html)
- Esquemas y WSDL vendorizados con su procedencia: [`schemas/PROVENANCE.md`](schemas/PROVENANCE.md)
