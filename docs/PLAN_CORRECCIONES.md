# Plan de corrección

> Plan de ejecución derivado de [`AUDITORIA_CONFORMIDAD.md`](AUDITORIA_CONFORMIDAD.md).
> Mientras la auditoría responde *qué está mal*, este documento responde **cómo arreglarlo de forma
> demostrable** y en qué orden.

| | |
|---|---|
| **Base** | Auditoría del commit `7d707bd`, revisada y ampliada |
| **Fecha** | 2026-08-02 |
| **Esfuerzo estimado** | ≈ 220 h netas |
| **Consecuencia de versión** | Los cambios obligan a un `2.0.0`; ver [§7](#7-decisiones-abiertas) |

> ### ⚠️ Verificado el 2026-08-02 — las issues mandan sobre este documento
>
> Todos los hallazgos se sometieron a verificación adversarial: fuente oficial redescargada, código
> comprobado línea a línea y demostración ejecutable exigida. Ninguno se cayó del todo, pero **once
> tenían afirmaciones falsas o refutables** y aparecieron **seis hallazgos más** (VF-032 … VF-036,
> incluido uno bloqueante que invalida cualquier factura por una errata de mayúscula).
>
> Cada hallazgo tiene su **[issue](https://github.com/ramoncoroso/verifactu/issues) con el enunciado
> corregido**, la fuente citada, la demostración y el criterio de aceptación. Donde una issue y este
> documento difieran, manda la issue. Índice en
> [`AUDITORIA_CONFORMIDAD.md`](AUDITORIA_CONFORMIDAD.md#índice-de-issues).
>
> Correcciones que afectan a este documento en particular:
>
> - **§2.1** — «el QR impreso lleva uno de los dos [huellas]» es incorrecto y se contradice con §2.2:
>   la huella **no** es uno de los 4 parámetros del QR. Y la divergencia de huellas en el reintento
>   requiere que este cruce una frontera de segundo (el timestamp tiene resolución de un segundo);
>   ocurre casi siempre porque el retardo por defecto es de 1000 ms, pero hay que declararlo.
> - **§2.2** — el fragmento Java de la AEAT está **incrustado como imagen** en la página 9 del PDF;
>   `pdftotext` no lo extrae y hay que recuperarlo con `pdfimages -f 9 -l 9 -png`. La transcripción se
>   verificó por OCR y ejecutando el código en OpenJDK 21. Además la norma dice «únicamente los
>   siguientes **4 parámetros obligatorios**»: el §7 define dos opcionales más (`idioma`, `formato`).
> - **§3, VF-024** — el código **no** declara un `ClaveRegimen 16`; los sobrantes son solo `12` y `13`.
> - **§3, VF-026** — «limita a 1 factura cada 60 segundos» es una **proyección**, no una medición: hoy
>   no hay control de flujo alguno, y la norma solo fija 60 s como valor *inicial*.
> - **§3, VF-029** — `TimeoutError` usa 5000 ms, no 1000; y `calculateBackoffDelay` sí se ejecuta para
>   errores ajenos a la jerarquía `NetworkError`.
> - **§3** — el discriminante para elegir entre `ValidarQR` y `ValidarQRNoVerifactu` **no** puede ser
>   `SoftwareInfo.systemType`: ese campo alimenta `TipoUsoPosibleSoloVerifactu` (si el software *solo*
>   puede usarse en modo Veri\\*Factu), que es otra cosa, y además sus valores `'V'|'N'` son ilegales.
>   Hace falta un discriminante nuevo.
> - **§4.4 / §6, capa 2** — la herramienta recomendada es **`libxml2-wasm`** (2,4 ms por documento).
>   `xmllint-wasm`, que se mencionó al principio, no permite reutilizar el esquema compilado y es
>   460× más lento por documento.
> - **§0.9** — las cifras «7 falsos negativos y 9 falsos positivos sobre 42 vectores» **no son
>   reproducibles**: los 42 vectores no se publicaron. Una batería independiente de 62 da 8 y 9, y
>   solo 11 de esos 17 resisten el contraste con dos implementaciones de referencia.
> - **§0.10** — «los 17 tests engañosos»: en `nif-validator.test.ts` solo **4** fijan explícitamente
>   comportamiento contrario a la corrección propuesta. Falta el desglose por fichero.

---

## 1. La restricción que gobierna este plan

El repositorio tiene 691 tests en verde, ~94 % de cobertura, y no detectó ninguno de los siete
fallos bloqueantes. Antes de planificar nada hay que entender por qué, porque de lo contrario el
plan reproduce el mismo resultado.

El diagnóstico es medible. Aplicando **una sola corrección aislada** sobre una copia del
repositorio y contando qué se rompe:

| Corrección aplicada | Tests que fallan (de 691) | ¿Fallan por el motivo correcto? |
|---|---:|---|
| VF-002 · huella a hexadecimal | **1** | No — es `'should return base64 encoded string'` |
| VF-004 · fecha a `dd-mm-yyyy` | **6** | No — los 6 afirman el formato ISO |
| VF-013 · quitar `huella` del QR | **2** | No — los 2 afirman que la huella va en la URL |
| VF-005 · aplicar `escapeXml()` | **0** | — |

Y en sentido inverso, inyectando regresiones evidentes:

| Regresión inyectada | Tests que fallan |
|---|---:|
| El generador de QR produce una imagen **completamente en blanco** | **1** |
| Los endpoints de la AEAT apuntan a `example.com` | **0** |

**21 de los 22 tests de QR pasan con una imagen en blanco.** Corregir cuatro bloqueantes rompe
nueve tests, y los nueve rompen porque afirmaban lo incorrecto: ni uno rompe por el motivo
correcto.

La causa raíz no es la falta de tests, es la **falta de oráculo**. El 94 % de cobertura significa
que el 94 % de las líneas se ejecutó comparando el resultado contra la propia implementación. Los
siete bloqueantes son propiedades comprobables contra una fuente externa —un XSD, un vector
publicado, un decodificador— y no existía un solo test con una fuente externa.

> **Regla que estructura todo el plan: cada corrección se demuestra contra una fuente externa a
> este repositorio, y el test que la demuestra se escribe *antes* que la corrección.**

Consecuencia práctica: la fase 0 entrega una batería de tests marcados `it.fails()` que
documentan cada bloqueante. A partir de ahí, **corregir un hallazgo consiste en quitar un
`.fails`**. Esa es la garantía concreta de que el arreglo funciona.

---

## 2. Correcciones a la auditoría

Dos hallazgos estaban mal analizados. Antes de tocar código hay que rectificarlos, porque
implementar lo que decían habría causado daño.

### 2.1 VF-011 — refutado. La cadena **debe** avanzar aunque la AEAT rechace

La auditoría prescribía revertir la cadena ante un `EstadoRegistro` de rechazo. **Es incorrecto y
constituiría una no conformidad normativa.** Cinco líneas de evidencia independientes:

1. **La verificación de encadenamiento que exige la norma es puramente local.** OM HAC/1177/2024
   art. 7.i, aclarado en la FAQ de desarrolladores §15: se comprueba que el RF n−1 encadena con el
   RF n−2 *en el propio SIF*. La AEAT no aparece en la comprobación. Y literalmente: *«será
   preciso generar el siguiente RF, ya que la facturación por este motivo NUNCA debe
   interrumpirse»*.
2. **La AEAT define explícitamente el caso «existe en el SIF pero no en la AEAT»**: es el valor
   `X` de `RechazoPrevioType`, documentado en el propio XSD.
3. **El remedio normativo ante un rechazo es un registro NUEVO**, no rehacer el anterior: un alta
   de subsanación con `Subsanacion="S"` y `RechazoPrevio="X"` (FAQ §17, caso 2.b).
4. **No existe ningún código de error que rechace por encadenar contra una huella desconocida.**
   Los códigos 2002/2003 (huella del registro anterior) están en la lista de los que producen
   *aceptación* del registro. La «cascada de rechazos» que predecía la auditoría no ocurre.
5. **Revertir violaría la inalterabilidad.** El RF ya generado lleva su huella impresa en el QR
   de una factura probablemente ya entregada.

**Pero hay un bug real en esa misma zona, y es peor que el descrito.**
`submitInvoiceWithRetry` restaura el estado de la cadena en `onRetry` (`verifactu-client.ts:399`)
y `withRetry` reinvoca `submitInvoice`, que en `:151` hace `const timestamp = new Date()` y vuelve
a calcular la huella. Como `FechaHoraHusoGenRegistro` entra en el cálculo, **cada reintento produce
un registro distinto, con huella distinta, para la misma factura** — y los reintentos se disparan
justamente ante errores de red, que es cuando el primer envío pudo haber llegado. Resultado:
la AEAT registra H1, el SIF conserva H2, el QR impreso lleva uno de los dos, y la cadena local es
irreconciliable.

Lo comete el código que la auditoría citaba como mitigación (*«IMPORTANT: This method safely
handles chain state on retry failures»*).

→ **VF-011 queda anulado y sustituido por VF-011R** (bloqueante): *el reintento regenera el
registro en lugar de reenviar los mismos bytes*.

### 2.2 VF-013 — la mitad sobre el `%20` es incorrecta

La auditoría decía que `URLSearchParams` codifica mal el espacio (como `+` en vez de `%20`) y
proponía usar `encodeURIComponent`. **Falso.** La especificación oficial del QR (v0.5.0, §4.1)
adjunta su implementación de referencia:

```java
public static String encodeParam(String param) {
    return java.net.URLEncoder.encode(param, "UTF-8");
}
```

`java.net.URLEncoder` es el serializador `x-www-form-urlencoded`: **codifica el espacio como `+`**.
Contrastado carácter a carácter sobre todo ASCII 32-126: `URLSearchParams` coincide con la
referencia en **0 diferencias**; `encodeURIComponent` diverge en **6** (` `, `!`, `'`, `(`, `)`,
`~`). El comportamiento actual es el correcto y aplicar la corrección propuesta lo habría roto.

**Lo que sí falla en su lugar**, y la auditoría no vio: §4 exige que las cadenas contengan
únicamente **ASCII 32-126**, y §10 tipifica el error **2003** («el número de serie contiene
caracteres no permitidos»). Hoy una serie con `Ñ` se codifica alegremente como `%C3%91` y la Sede
la rechaza. Además `validateQrParams` **nunca se invoca desde `buildQrUrl`**: los datos inválidos
llegan al QR impreso sin un aviso.

La mitad correcta de VF-013 (el parámetro `huella` sobra) queda confirmada: la especificación dice
*«deberá incorporar **únicamente** los siguientes 4 parámetros»*. Coste medido de llevarlo: la URL
pasa de 133 a 205 caracteres, el QR de versión 8 a 10, y el módulo impreso encoge un 12 % en un
código que debe caber en 30-40 mm.

---

## 3. Hallazgos nuevos

Nueve, encontrados al diseñar las correcciones. Cuatro son bloqueantes.

| ID | Sev. | Hallazgo |
|---|---|---|
| **VF-023** | 🔴 | `parseAltaResponse` busca `RespuestaRegFactura`/`Respuesta`; los nombres reales son `RespuestaRegFactuSistemaFacturacion` y `RespuestaLinea`. **Toda respuesta real de la AEAT lanza `AeatError`, incluso si el registro fue aceptado.** `parseConsultaResponse` está igual de roto, y `buildConsultaSoapBody` omite `PeriodoImputacion`, que es obligatorio. Los 28 tests del cliente pasan porque se les da un formato inventado. |
| **VF-024** | 🔴 | Los enums no coinciden con el XSD. `TaxIdType` está **desplazado una posición** (`Passport:'02'` cuando es `03`, y así todos); `NonSubjectCause` (`OT`/`RL`) **no existe**; `OperationRegime` incluye `12`,`13`,`16` inexistentes y le faltan `18`,`20`,`21`; `SoftwareInfo.systemType: 'V'` es un valor **ilegal** en un campo `S`/`N`. |
| **VF-025** | 🔴 | `PrimerRegistro` es una enumeración de **un solo valor: `S`**. El patrón `<PrimerRegistro>N</PrimerRegistro><RegistroAnterior>…` que emiten *ambas* implementaciones es inválido por partida doble. Cuando no es el primer registro **no se emite `PrimerRegistro` en absoluto**. |
| **VF-026** | 🔴 | Sin envío por lotes, el control de flujo limita a **1 factura cada 60 segundos**. La norma (art. 16.2) obliga a esperar *t* segundos **o** a acumular 1.000 registros, *lo que ocurra primero*: el patrón obligado es acumular y enviar por lotes, no una petición por factura. |
| **VF-027** | 🟠 | El parser XML propio rompe con comentarios, CDATA, `DOCTYPE`, atributos sin valor y referencias numéricas. Un `<!DOCTYPE html>` (página de error HTTP) **no lanza**: devuelve un árbol basura y el fallo emerge como «missing RespuestaRegFactura». Encontrado por *property testing* en 14 iteraciones. |
| **VF-028** | 🟠 | Las fechas dependen de la zona horaria del proceso. `new Date('2024-01-15')` es medianoche **UTC**; `getDate()` devuelve `15` en Madrid y `14` en Nueva York. Afecta al XML, a la huella y al QR simultáneamente. Toda la suite lo hereda vía `invoice-fixtures.ts:29`. |
| **VF-029** | 🟠 | `DEFAULT_RETRY_INFO.retryAfterMs = 1000` hace que `withRetry` use **siempre 1000 ms fijos** para todos los errores de red. `calculateBackoffDelay` —44 tests -— nunca se ejecuta en el camino real. Y todos los `SoapError` se marcan no reintentables, en contra de la instrucción expresa de la AEAT para faults `soapenv:Server`. |
| **VF-030** | 🟠 | `ConcurrencyLimiter` puede **sobresuscribir**: la comprobación `activeCount >= max`, el `await` y el incremento no son atómicos, así que una llamada nueva puede robar el hueco de un encolado ya despertado. |
| **VF-031** | 🟡 | **No existe fichero `LICENSE`** pese a `"license": "MIT"`. El tarball se publica sin licencia. Y `.gitignore` excluye `*.p12`/`*.pem`, así que los futuros fixtures de certificado quedarían fuera del repositorio en silencio. |

Correcciones menores adicionales, todas verificadas contra el XSD oficial:

- `BaseImponibleOImporteNoSujeto` lleva **`i` minúscula** en «Oimporte». Ambas implementaciones y sus tests usan la mayúscula.
- `Cabecera` pertenece al namespace de **`SuministroLR`**, no al de `SuministroInformacion` como decía VF-006(g). Solo sus *hijos* son de `SuministroInformacion`.
- `FechaHoraHusoGenRegistro` sin huso **sí valida** contra el XSD (`xs:dateTime` admite el offset ausente). Es obligatorio por validación de negocio y por coherencia con la huella, no por esquema — importa porque determina qué tipo de test lo detecta.
- `SOAPAction` es la **cadena vacía** (`soapAction=""` en las tres operaciones del WSDL), no `RegFactuSistemaFacturacion`.
- No hay endpoint separado de consulta ni de anulación: **una sola URL**, `VerifactuSOAP`, con dos operaciones. Existen además los hosts de sello (`www10`/`prewww10`).
- `K`, `L` y `M` **no son CIF**: son NIF de persona física con control por módulo 23. Hoy `M1234567L` (el ejemplo canónico) se rechaza y `M1234567D` se acepta.
- La copia de los XSD de `hectorsipe/aeat-verifactu` está **desactualizada**: le faltan `E7`/`E8` en `OperacionExentaType` y `ClaveRegimen 21`. Hay que vendorizar la oficial.
- El QR tiene **cuatro** URLs de cotejo, no dos: existe `ValidarQRNoVerifactu` para SIF no verificables. El modelo ya tiene el discriminante (`systemType`) y no lo usa.

---

## 4. Fuentes externas localizadas

Lo que hace este plan ejecutable. Todo verificado, no citado de oídas.

### 4.1 Vectores oficiales de la huella — el oráculo que faltaba

Del apartado 6 del PDF *«Detalle de las especificaciones técnicas para generación de la huella o
hash de los registros de facturación»* (v0.1.2, 27/08/2024). **Los tres ejecutados y confirmados
con SHA-256:**

```
IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&
TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&
FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00

→ 3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60   ✅ coincide
   lo que emite hoy la librería:  PEZNr2GsuCfGX9oZ81Kk473CxkDp6fxMwFgHPzjxL2A=
```

Los tres vectores forman **una cadena real** (alta → alta encadenada → anulación): el digest de
uno es la `Huella` del siguiente. Permite un test de encadenamiento extremo a extremo con datos
publicados por el regulador.

Dos asertos —la cadena concatenada carácter a carácter y el digest— habrían detectado
**VF-002, VF-003 y VF-004 a la vez**. Coste: tres líneas, menos de 1 ms.

Reglas derivadas del código Java de referencia del propio PDF: `valor.trim()` sobre cada campo
(los espacios internos se conservan), campo ausente ⇒ `Nombre=` vacío, **sin URL-encoding**
(la `/` viaja cruda), UTF-8, y salida `Base16(false)` = hexadecimal **en mayúsculas**.

### 4.2 XSD y WSDL oficiales

`https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/`
— `SuministroLR.xsd`, `SuministroInformacion.xsd`, `RespuestaSuministro.xsd`, `ConsultaLR.xsd`,
`RespuestaConsultaLR.xsd`, `SistemaFacturacion.wsdl`, `errores.properties`.

Compilados con libxml2 y usados para **validar hipótesis**, no para razonar sobre ellas. De ahí
salen el orden completo de los 31 hijos de `RegistroAlta`, la regla de namespaces, el `choice` de
`Encadenamiento`, el límite de 12 líneas de `Desglose` y el de 1.000 registros por envío.

**Trampa que hay que planificar:** `SuministroInformacion.xsd:3` importa la firma XML por HTTP
(`http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd`). Sin parchear ese `schemaLocation`
a una copia local, **el esquema no compila en un CI sin red**, y falla con un mensaje engañoso.

### 4.3 Especificación del QR

PDF *«Detalle de las especificaciones técnicas del código QR de la factura»* v0.5.0 (10/12/2025).
Nivel de corrección **M**, ISO/IEC 18004:2015, 30×30 a 40×40 mm, zona de silencio ≥ 2 mm
(recomendado 6) — **en milímetros, no en módulos**, algo que la API actual ni siquiera modela.

Las cuatro imágenes QR del anexo se extrajeron con `pdfimages` y se decodificaron: versiones 7-8,
nivel M confirmado en los bits de formato. Sirven como vectores de prueba.

Y los literales que la norma exige junto al código, que la librería debería exponer como
constantes en vez de dejar que cada integrador los teclee mal: `QR tributario:` encima, y
`Factura verificable en la sede electrónica de la AEAT` o `VERI*FACTU` debajo.

### 4.4 Herramientas de verificación — comparadas con datos medidos

| Necesidad | Herramienta | Medición |
|---|---|---|
| Validación XSD | **`libxml2-wasm@0.7.1`** | Compila el esquema en 21 ms (reutilizable), valida en **2,4 ms**. 1,4 MB, **0 dependencias**, WASM puro |
| | ~~`xmllint-wasm`~~ | 107 ms **por documento**: no permite reutilizar el esquema compilado. 460× más lento |
| | ~~`libxmljs2`~~ | +123 paquetes, bindings nativos, empaqueta libxml de 2019 |
| | ~~`xsd-schema-validator`~~ | Requiere una JVM |
| Decodificar QR | **`jsqr@1.4.0`** | Apache-2.0, 360 KB, 0 deps. 8 ms por decodificación. **Sin rasterizador**: se construye el RGBA a mano desde la matriz |
| Codificar QR | **`qrcode-generator@2.0.4`** | MIT, **1 solo paquete, 0 transitivas**, 7,6 KB gzip, 2,1 M descargas/semana |
| Property testing | **`fast-check@4.9.0`** | 2000 iteraciones de 4 propiedades en ~70 ms |

Las cuatro van a `devDependencies`. **`dependencies` pasa de `{}` a exactamente una entrada**
(`qrcode-generator`), sin dependencias transitivas.

Sobre el codificador de QR, corrigiendo mi recomendación anterior: no pesa «~10 KB» sino **556 KB
en disco** (publica una carpeta `experiment/` de 337 KB porque no declara `files`), de los que se
cargan 51,9 KB. Y su `stringToBytes` por defecto es **latin-1, no UTF-8** — irrelevante si se
valida ASCII 32-126 antes de codificar, que es obligatorio de todas formas, pero hay que validar
**antes**.

---

## 5. La pirámide de verificación

Cada capa detecta una clase de fallo y es ciega a otras. Ninguna es redundante: se comprobó
inyectando cada defecto por separado.

| Capa | Herramienta | Coste | Detecta | **Ciega a** |
|---|---|---|---|---|
| 1 · Vectores de huella | ninguna | < 1 ms | VF-002, VF-003, VF-004, VF-015 | XML, QR, red |
| 2 · Validación XSD | `libxml2-wasm` | 21 ms + 2,4 ms/doc | VF-004, VF-005, VF-006, VF-009, VF-010, VF-024, VF-025 | **huella en Base64**, **huso ausente** |
| 3 · Decodificación QR | `jsqr` | 8 ms | VF-001, VF-013 | zona de silencio, tamaño físico |
| 4 · Property-based | `fast-check` | 70 ms | escapado XML, robustez del parser, cadena | lo que no sea invariante |
| 5 · Servidor SOAP mock | `node:https` + capa 2 | ~1 s | VF-007, VF-011R, VF-023, VF-026, VF-029 | URL real, semántica AEAT |
| 6 · Preproducción | certificado real | ~5 s, no determinista | VF-007 completo, códigos reales | nada, pero no es reproducible |

**El punto que justifica tener las capas 1 y 2 a la vez:** el XSD de la AEAT es permisivo justo
donde más duele. Comprobado — **la huella en Base64 valida contra el XSD** (`TextMax64Type` es
solo `maxLength=64`, sin patrón: 44 caracteres pasan) y **`FechaHoraHusoGenRegistro` sin huso
valida**. Dos de los siete bloqueantes son invisibles para la validación de esquema y necesitan
asertos explícitos que no salen del XSD.

### Snapshots de XML: no

Un snapshot convierte la salida actual en la especificación, y `vitest -u` la actualiza sin
fricción. En este repositorio, un snapshot tomado en enero habría «documentado» la fecha ISO y la
huella en Base64 como el comportamiento correcto, y cada corrección de esta auditoría habría sido
un `-u` de un comando.

Única excepción: ficheros XML fijos **procedentes de la AEAT o validados contra el XSD**, usados
como *entrada* del parser. Eso no es un snapshot, es un vector de prueba — la diferencia decisiva
es que no se regenera desde el código.

### El criterio objetivo de suficiencia

Terminada cada fase, se introducen mutaciones a mano y se comprueba que **cada una** rompe al
menos un test. Si alguna no rompe nada, falta un test. Para la fase 1, por ejemplo: pasar el
digest a Base64, quitar el `toUpperCase()`, quitar el `trim`, invertir el formato de fecha, quitar
el offset del timestamp, intercambiar `CuotaTotal` con `ImporteTotal`, renombrar `Huella`, y
cambiar el separador `&` por `;`.

---

## Enmiendas tras la revisión del 2026-08-02

> Terminada la fase 0, un panel de revisión sometió este plan a crítica. **El orden
> que propone §6 es incorrecto en su arranque.** Lo que sigue lo sustituye; el resto
> del documento se conserva porque el análisis de fondo es válido.

### Por qué la fase 1, tal y como está escrita, no puede ejecutarse

**1. Su oráculo no puede ponerse en verde.** Los tests de vectores de
`tests/conformance/huella-vectores.test.ts` construyen un `Date` y esperan que la
librería emita `2024-01-01T19:20:30+01:00`. Con el formateador que propone §6
(`Intl` + `longOffset`, sin zona explícita), medido:

```
Europe/Madrid     2024-01-01T19:20:30+01:00    OK
UTC               2024-01-01T18:20:30+00:00    ≠ vector oficial
America/New_York  2024-01-01T13:20:30-05:00    ≠ vector oficial
```

El CI corre en UTC y no hay `TZ` fijada en `ci.yml`, `vitest.config.ts` ni
`package.json`. Una implementación **correcta** dejaría esos tests en rojo. Y como
están marcados `it.fails`, hoy pasan y seguirían pasando después del arreglo:
`it.fails` no distingue «falla por el defecto» de «falla porque el test es
dependiente del huso».

**2. Su criterio de aceptación es inobservable.** §6 dice que la señal de éxito es
que `alta-template.test.ts` y `anulacion-template.test.ts` «dejen de compilar».
`tsconfig.json` excluye `**/*.test.ts` y vitest transpila sin comprobar tipos: ya
no compilan hoy (169 errores, VF-037) y el CI está verde.

**3. Cambia la firma que su propio oráculo invoca.** Convertir `AltaHashFields` a
`Record<campo, string>` borra la API que los tests de vectores llaman. No son «un
oráculo escrito y esperando»: hay que reescribirlos dentro de la propia fase.

### Agujeros de la red de conformidad, medidos

- **`xsd.test.ts:124`** — el test titulado `'detecta la fecha en formato ISO'`
  valida `<x/>`. Su único error es «no matching global declaration»: pasaría contra
  un esquema vacío o mal cargado. No prueba nada sobre fechas.
- **Nada compara `src/client/endpoints.ts` con `schemas/SistemaFacturacion.wsdl`**,
  que ya está vendorizado y contiene la verdad. La demostración de §1 —«apuntar los
  endpoints a `example.com` no rompe ningún test»— **sigue siendo cierta**.
- **`validateRespuestaSuministro` está exportada y no la usa ningún test**, así que
  VF-023 (bloqueante: toda respuesta real lanza `AeatError`) no tiene oráculo.

### Orden corregido

> **Estado al 2026-08-02: los puntos 1 a 4 están hechos.** Ver `HANDOFF.md`.

| # | Trabajo | h | Estado |
|---|---|---:|---|
| **1** | Tapar los agujeros de la red: fijar el huso, control negativo real, test `endpoints`↔WSDL, fixture de respuesta validado | ~1 | ✅ #71 |
| **2** | Desarmar el release: `RELEASE_ENABLED` y `npmPublish: false`, e invertir la instrucción del `ROADMAP.md` | ~1 | ✅ #71 |
| **3** | Demoler `xml/templates/` y los tests anti-norma | ~8 | ✅ #73 |
| **4** | Formato unificado y huella conforme, **con VF-007 dentro** | ~21 | ✅ #72, #74 |
| **5** | **El XML conforme** — árbol que escapa siempre, tabla de orden derivada del XSD, uniones discriminadas para los `choice` | ~45 | ✅ #77 |
| **6** | **El parseo de respuestas** | ~7 | ✅ #78 |
| **7** | **El QR** | ~18 | ✅ #76 |

**Los once bloqueantes están cerrados y no queda ningún `it.fails`.** Lo que sigue
ya no es conformidad de formato: es la parte de diseño con estado, más lo que solo
se puede cerrar contra el servicio real.

| # | Trabajo | Cierra | Notas |
|---|---|---|---|
| ~~8~~ | ~~Cadena append-only y reenvío de bytes~~ | #21 | ✅ #79. Pendiente aparte: **persistencia** del estado, que hoy vive en memoria |
| **9** | **Control de flujo y envío por lotes** | #22, #36 | ~14 h. `SubmissionPacer` persistente y `BatchQueue` hasta 1000 registros. **Los datos llegan parseados** desde #78 y el envío ya es una operación separable desde #79 |
| **10** | **Endurecer transporte y parser** | #30, #37, #39, #40 | ~14 h. Comprobar el estado HTTP, comentarios y CDATA en el parser, backoff real, sobresuscripción del limitador |
| **11** | **Puerta de calidad** | #28, #68 | ~8 h. `typecheck:tests` y `lint:all` al CI, ya sobre ficheros definitivos |
| **12** | **Preproducción** | — | Requiere certificado. Es lo único que confirma que la AEAT acepta un registro |

Lo que quedó fuera de los puntos 1-4, y por qué:

- **`schema-validator.ts` no se borró.** Son 407 líneas sin consumidores que
  reimplementan el XSD a mano, pero borrarlas sustituye validación local previa al
  envío por «que lo diga la AEAT». Es una decisión de producto: si la validación
  local es un requisito, hay que **sustituirla** validando contra el XSD, no
  borrarla. Sigue siendo un multiplicador de retrabajo mientras exista.
- **VF-014 (tabla de CIF) tampoco.** No bloquea a nadie y es un `good first issue`
  con matiz: la Orden EHA/451/2008 **no contiene** la tabla de controles que se le
  atribuye, y las implementaciones de referencia discrepan.

### Correcciones al grafo de dependencias de §6

- **«La fase 2 depende de la fase 1»** — cierto solo para el formateador de fechas
  (~3 h, no 21). VF-005, VF-006, VF-024, VF-025, VF-033, VF-034 y VF-009 no tocan
  la huella.
- **«La fase 3 depende de la fase 1»** — falso para VF-007, VF-020, VF-023, VF-027,
  VF-029 y VF-030. Son ~25 h entregables desde hoy.
- **Arista no vista: VF-023 → VF-012 → VF-026.** `RespuestaSuministro.xsd:25-26`
  declara `TiempoEsperaEnvio` y `EstadoEnvio` como obligatorios: **los datos que
  gobiernan el control de flujo llegan en la respuesta que hoy no se sabe parsear.**
  Implementar el pacer o los lotes antes que VF-023 es hacerlo contra datos
  inventados.
- **Arista no vista: `schema-validator.ts` y `business-validator.ts` son entrantes
  de las fases 1, 2 y 3.** §7.3 los trata como decisión posterior; son un impuesto
  de retrabajo de 10-15 h repartido por todas las fases.
- **VF-013 antes que VF-002 elimina una arista**: mientras `huella` siga en la URL
  del QR, pasar el digest de Base64 (44 car.) a hexadecimal (64) cambia la versión
  del código.
- **El certificado de preproducción es un artículo con plazo de aprovisionamiento**
  (FNMT: solicitud, acreditación, alta en preproducción). Consume cero horas de
  ingeniería y bloquea el final: hay que iniciarlo el día 0, no cuando toque.

### Hallazgos nuevos del panel, pendientes de issue

- **Composición peligrosa que ninguna issue describe**, porque cada pieza está
  catalogada por separado: la cadena avanza *antes* del envío
  (`verifactu-client.ts:155`), `AeatError` no es reintentable, y VF-023 hace que
  **toda** respuesta real lance `AeatError`. Contra la AEAT real, la cadena local
  avanza en cada envío que el llamante ve como fallido.
- **El tarball redistribuye documentos normativos de terceros.**
  `files: ["dist", "schemas"]` mete los XSD de la AEAT y el `xmldsig-core-schema.xsd`
  del W3C en un paquete que se anuncia MIT. Los esquemas solo los necesita el helper
  de tests.
- **Nada detecta la deriva de los esquemas.** `schemas:check` compara con los
  checksums registrados, pero solo descubre un cambio si alguien ejecuta
  `schemas:fetch`, y nada lo programa. El día que la AEAT publique `tikeV1.1`, el CI
  seguirá verde con un job llamado «Conformidad AEAT» dando fe. La especificación se
  movió dos veces mientras se escribía este código.
- **La estimación de ~212 h no es defendible** con el único punto de calibración
  disponible: la fase 0 se entregó en 37 minutos de reloj.

### Decisión que hay que tomar antes del punto 3

Borrar `schema-validator.ts` sustituye validación local por «que lo diga la AEAT».
El reemplazo natural —validar contra el XSD en runtime con `libxml2-wasm`— rompería
el compromiso de dependencias mínimas. **Si la validación previa al envío es un
requisito de producto, hay que sustituir en vez de borrar** (≈ +12 h en el bloque
siguiente).

---

## 6. Las fases

Cinco fases. El orden importa: la fase 1 fija el formateo del que dependen la 2 y la 3, y la 0
entrega los esquemas y los vectores que las demás consumen.

```
Fase 0 ─── Fase 1 ─┬─ Fase 2 ─┐
(20 h)     (21 h)  │  (60 h)  ├─ Fase 5
                   └─ Fase 3 ─┘  (15 h)
                      (78 h)
Fase 4 (18 h) ── independiente, paralelizable desde el primer día
```

### Fase 0 · Red de conformidad y quick wins — 20 h, sin dependencias

Todo esto se puede hacer hoy, y es lo que protege el trabajo de las demás fases.

| # | Acción | h |
|---|---|---:|
| 0.1 | Badge de Codecov `master` → `main` (VF-022) | 0,1 |
| 0.2 | `.releaserc.json` y `release.yml` a `main` (VF-016) | 0,5 |
| 0.3 | `npm audit fix` + subir `vitest@^3`, `semantic-release@^24` y demás → **0 críticas, 691/691 tests, `tsc` limpio, sin tocar configuración** | 0,5 |
| 0.4 | Política de auditoría de dos alcances: `npm audit --omit=dev --audit-level=low` **bloqueante** (hoy ya devuelve 0), auditoría de desarrollo informativa con `audit-ci` y allowlist caducable | 2 |
| 0.5 | `package.json` completo, fichero `LICENSE`, `tsconfig.test.json`, excepción en `.gitignore` para fixtures de certificado (VF-017, VF-031) | 2 |
| 0.6 | **`schemas/` con los XSD oficiales**, `scripts/fetch-schemas.mjs` con verificación SHA-256 y parche del `schemaLocation` de xmldsig, `CHECKSUMS` | 3 |
| 0.7 | **Vectores oficiales de la huella + helper de validación XSD**, tests marcados `it.fails()` | 3 |
| 0.8 | **Test de decodificación de QR**, marcado `it.fails()` (ya ejecutado: falla con `decoded = null`) | 3 |
| 0.9 | VF-014 · tabla correcta de prefijos de CIF + K/L/M por módulo 23 + 42 vectores reales | 3 |
| 0.10 | Borrar los 17 tests que afirman lo contrario de la norma | 3 |

Sobre 0.4: el commit de enero *«fix: change npm audit level from high to critical»* acertó en el
diagnóstico y erró en el remedio — en vez de **acotar el alcance**, bajó **el umbral**. La puerta
correcta es de alcance, no de umbral: para una librería con `dependencies` casi vacío,
`--omit=dev --audit-level=low` es «cero o falla», y no hay umbral que bajar la próxima vez.
Conviene además separar los grupos de Dependabot: hoy agrupa **todas** las devDependencies en un
único PR que mezcla parches con majors, y por eso nunca se mergea — es la causa de fondo de que se
acumularan 35 vulnerabilidades.

Sobre 0.9, el impacto medido de la tabla actual sobre 42 vectores: **7 falsos negativos**
(identificadores válidos rechazados, incluidos `G2802964C` y `M1234567L`) y **9 falsos positivos**
(entre ellos `Q28260008`, que es el NIF de la propia AEAT con el control del tipo equivocado). Los
51 tests actuales no detectan ninguno de los 16.

**Entregable de la fase:** un PR titulado *«test: red de conformidad — falla a propósito»*. A
partir de ahí, corregir cada hallazgo es quitar un `.fails`.

### Fase 1 · Formatos primitivos y huella — 21 h · VF-002, VF-003, VF-004, VF-015, VF-028

El arreglo no es «corregir los dos formateadores para que coincidan» — eso es plausible pero no
demostrable, y volverá a divergir. Hay **tres** formateadores de fecha y **dos** de marca
temporal, y `models/invoice.ts:160` ya contiene uno correcto que **nadie llama** (exactamente el
mismo patrón que `sha256Hex`).

El arreglo es eliminar la duplicación:

1. **`src/format/aeat.ts` como única fuente de formateo.** Fechas con `Intl.DateTimeFormat` y
   `timeZoneName: 'longOffset'` en lugar de aritmética sobre `getTimezoneOffset()`. Verificado en
   Node 22: produce el offset correcto para husos de media hora (Kolkata `+05:30`), de cuarto
   (Kathmandu `+05:45`, Chatham `+12:45`), UTC (`+00:00`, nunca `Z`) y DST. VF-015 y VF-028 dejan
   de ser bugs corregibles y pasan a ser **estados inalcanzables**, y los tests de huso se vuelven
   deterministas sin mutar `process.env.TZ`.
2. **La huella deja de ver `Date` y `number`.** `AltaHashFields` es `Record<campo, string>`: los
   valores entran ya formateados. Es imposible que la huella use un formato distinto del XML,
   porque la huella ya no sabe formatear. Y como los nombres de campo son claves del tipo,
   **renombrar mal un campo de anulación pasa a ser un error de compilación** — VF-003 se vuelve
   irrepetible.
3. **`computeHuella` es la única función que llama a `createHash`.** `sha256()` (base64) y
   `sha256Hex()` (minúsculas) se eliminan: no son utilidades, son la causa directa de VF-002.
4. **`PreparedRecord`**: el instante se formatea una vez y se propaga como cadena. El generador de
   XML cambia de firma para no poder inventarse un `new Date()`.
5. **`calculateCuotaTotal` en un solo sitio**, incluyendo el recargo de equivalencia. El código de
   error oficial 2006 lo confirma, y como `CuotaTotal` es el campo 5 de la huella, esto es
   **bloqueante para la huella**, no solo para el XML — la auditoría lo clasificaba solo como
   problema de desglose.

Añadir además blindaje a `toFixed(2)`, que hoy emite `"NaN"`, `"Infinity"`, `"1e+21"` y `"-0.00"`
sin un aviso.

**Señal de que funciona:** al aplicar la fase, `alta-template.test.ts` y `anulacion-template.test.ts`
**dejan de compilar** por el cambio de firma. Es la confirmación de que esos ficheros ya no pueden
generar su propio instante.

### Fase 2 · Generación del XML — 60 h · VF-005, VF-006, VF-008, VF-009, VF-010, VF-024, VF-025

Objetivo de diseño: que los fallos actuales sean **imposibles por construcción**, no simplemente
corregidos.

| Fallo | Mecanismo que lo hace imposible |
|---|---|
| Escapado olvidado | El generador **nunca produce `string`**, produce un árbol. El único punto donde un valor se vuelve texto es el serializador, que escapa siempre. No existe API que acepte XML crudo — se eliminan `xml()` y `fragment()`, que son la puerta de atrás. |
| Orden de hijos incorrecto | El orden **no depende del orden de llamadas**. Cada tipo declara una tabla ordenada según el XSD; un `AssertSameKeys` en tiempo de compilación garantiza que la tabla cubre todas las claves de la interfaz. |
| Campo obligatorio omitido | Los obligatorios del XSD son propiedades **no opcionales**. Omitir `TipoHuella` pasa a ser un error de `tsc`. |
| `PrimerRegistro=N` + `RegistroAnterior` | `encadenamiento` es una **unión discriminada**: refleja el `choice` del XSD en el sistema de tipos y hace el estado inexpresable. |
| Dos implementaciones | Una sola. Se eliminan `templates/alta.ts` y `anulacion.ts`; `VerifactuClient` deja de construir XML. |

Se separa `xml/verifactu/` (transcripción mecánica y auditable del XSD, revisable línea a línea)
de `xml/mapping/` (lógica de negocio opinable). Hoy están mezclados, y por eso nadie detectó que
falta `IDVersion`.

Sobre eliminar `templates/`: la auditoría lo frenaba por compatibilidad de API. **El argumento no
se sostiene** — `npm view verifactu` devuelve un paquete de otro autor publicado en enero de 2024;
este proyecto nunca se ha publicado (coherente con VF-016), así que no hay consumidores. Y aunque
los hubiera, preservar la compatibilidad de una función cuya salida la AEAT rechaza en el 100 % de
los casos no protege a nadie.

Esta fase incluye el trabajo de modelo que la auditoría no dimensionó: **17 campos del XSD que el
modelo ni siquiera representa** (`RefExterna`, `FechaOperacion`, `Macrodato`, `ImporteRectificacion`,
`FacturasSustituidas`, `Tercero`…) y los enums de VF-024. También corregir `business-validator.ts`,
que trata `F3` como rectificativa cuando las rectificativas son `R1`–`R5`: hoy una `R1` con importe
negativo se rechaza localmente y una `R1` sin `TipoRectificativa` pasa la validación para ser
rechazada por la AEAT.

**Test que cierra la clase de bug permanentemente:** el invariante huella ↔ XML. Para un corpus de
~20 facturas, cada campo de la cadena de la huella debe ser **byte a byte idéntico** al nodo XML
correspondiente. Falla ante cualquier reaparición de VF-004 o VF-015 aunque el formato concreto
sea otro.

### Fase 3 · Red y cadena — 78 h · VF-007, VF-011R, VF-012, VF-020, VF-021, VF-023, VF-026, VF-027, VF-029, VF-030

El error estructural es fusionar **generación** y **remisión** en `submitInvoice`. Son dos ciclos
de vida con reglas opuestas:

| | Cadena / generación | Entrega / remisión |
|---|---|---|
| Disparador | Expedición de la factura | Vencimiento del temporizador o lote lleno |
| Reversible | **Nunca** (append-only) | Sí, se reintenta |
| Depende de la AEAT | No | Sí |
| Puede interrumpirse | No | Sí |
| Persistencia | Antes de imprimir la factura | Antes de escribir en el socket |

De ahí el diseño:

- **`RecordChain` como log append-only.** `append()` en vez de `processInvoice()`, y **sin
  `revert()`, `rollback()` ni `restore()` en la API pública** — si el método no existe, nadie lo
  llama por error. `RecordChain.fromState()` se conserva solo para rehidratar desde
  almacenamiento, documentado como tal.
- **Reintentar reenvía los bytes almacenados**, nunca un registro regenerado. Es la corrección de
  VF-011R. Reintentar es seguro porque la AEAT identifica el registro por
  `IDEmisorFactura + NumSerieFactura + FechaExpedicionFactura` (no por la huella) y devuelve
  `3000` + bloque `RegistroDuplicado`, que hay que interpretar como **éxito**, no como fracaso.
- **`SubmissionPacer` + `BatchQueue`** para el control de flujo, con responsabilidades sin solape
  respecto al `ConcurrencyLimiter` y al retry existentes. El temporizador cuenta **desde el envío,
  no desde la respuesta**, y corre igual si el envío falla: reintentar antes de *t* sería una
  segunda violación encima de la primera. El estado del pacer debe persistirse, o un proceso que
  reinicia cada 5 segundos no está protegido de nada.
- **Máquina de estados de entrega con reconciliación.** El caso peor —el proceso muere después de
  enviar y antes de recibir— se resuelve persistiendo antes del `write()`, promoviendo a
  `SENT_UNKNOWN` al arrancar, y consultando. Si la consulta falla, se reenvía: el peor resultado
  posible es un `3000` que ya sabemos interpretar, **así que la corrección no depende de que la
  consulta funcione**.
- **Taxonomía de errores real**, derivada de `errores.properties`: faults `soapenv:Server`
  reintentables (instrucción expresa de la AEAT), `4141` (acceso suspendido) como parada en seco
  con el buzón de soporte en el mensaje, y arreglo de VF-029.

Se opta por **endurecer el parser propio** en vez de adoptar una librería: el dominio de entrada
es acotado (respuestas SOAP de un único emisor) y el presupuesto de dependencias ya se gasta en el
QR, donde el riesgo es mayor. Pero la decisión debe quedar documentada, no tomarse por inercia.

### Fase 4 · QR — 18 h · VF-001, VF-013 · **paralelizable desde el día uno**

Solo dos hilos la conectan con el resto: `formatAeatDate` (fase 1) y `totalAmount` (fase 2).

Se sustituye el motor por `qrcode-generator` manteniendo **la API pública intacta al 100 %**:
`QrOptions`, `QrResult`, `QrGenerator` y `generateQrCode` conservan sus firmas; todo lo nuevo es
aditivo y opcional. Se tiran ~190 líneas (`generateQrMatrix`, `fillDataArea`, `simpleHash`,
`isReservedModule`…) y las tablas de capacidad, que además estaban en modo **alfanumérico**
aplicadas a datos que van en modo **byte**: para la URL oficial de 115 caracteres devuelven
versión 5 cuando la real es la 7.

Añadidos que valen la pena:

- `QrResult.modules` — expone la matriz. Es lo que hace trivial el test de decodificación sin
  parsear el SVG con regex.
- `unit: 'mm'` — hoy no hay forma de expresar el tamaño físico, que es donde está el requisito legal.
- `optimize` — emitir un `<path>` fusionando tiradas en vez de un `<rect>` por módulo:
  **8.709 bytes frente a 76.544, un 87 % menos** por factura.
- `ValidarQRNoVerifactu` y las constantes de los literales obligatorios.

En `url-builder`: quitar `huella`, **conservar `URLSearchParams`** con un comentario que cite §4.1
para que nadie lo «arregle» en el futuro, validar ASCII 32-126, e invocar la validación desde
`buildQrUrl` (hoy nunca se llama).

### Fase 5 · Cierre — 15 h

Puerta de calidad en CI (job `Conformidad AEAT` **antes** que los demás, `CODEOWNERS` sobre
`workflows/`, `schemas/` y `tests/conformance/`, protección de rama con checks requeridos, umbrales
de cobertura **por encima** del estado actual y no 24 puntos por debajo), test de integración
opcional contra preproducción, `docs/ESTRATEGIA_DE_PRUEBAS.md`, y actualización de la auditoría con
todo lo de §2 y §3.

Sobre la puerta: el historial demuestra que se puede bajar con un commit de una línea. Un check
requerido no se elimina cambiando el YAML — hay que desmarcarlo en la configuración del
repositorio, que es un acto visible y deliberado.

---

## 7. Decisiones abiertas

Cinco cosas que conviene que decidas antes de empezar.

**7.1 · Una dependencia en runtime.** El plan asume `qrcode-generator`. Vendorizarlo (copiar sus
2.237 líneas dentro de `src/`) es legal pero cambia una dependencia auditable por una invisible,
solo para conservar un badge — es el mismo tipo de decisión que produjo VF-001. Escribir el
codificador a mano son ~14 h adicionales; ahora sería viable porque el oráculo bit-exacto existe
(los QR del anexo oficial), pero no con siete bloqueantes por delante. **Recomiendo asumir la
dependencia y reformular el badge a «1 dependencia (0 transitivas)»**, con un test que falle si
aparece una segunda.

**7.2 · `2.0.0`.** Cualquiera de las fases 1, 2 o 3 por sí sola fuerza un major: desaparecen
`sha256`, `formatXmlDate`, `SOAP_ACTIONS`, `ServiceEndpoints`, `RecordChain.processInvoice`, y
`SubmitInvoiceResponse.state` cambia `'Rechazado'` por `'Incorrecto'`. No hay nada que migrar en la
práctica: las huellas emitidas por la `1.0.0` son incorrectas y la AEAT las habría marcado. Y el
nombre `verifactu` está ocupado en npm por otro autor, así que el primer publish exige renombrar de
todos modos.

**7.3 · `schema-validator.ts`.** Son 479 líneas que reimplementan a mano las restricciones del XSD
con constantes propias, y su test es el fichero más grande del repositorio (72 tests, 118 asertos).
Un validador inventado, validado contra reglas inventadas, con cobertura perfecta. Con la capa 2 en
su sitio, o sus reglas se derivan del XSD o el módulo sobra (−479 líneas de fuente, −703 de test).

**7.4 · API de lotes.** `submitInvoice()` puede seguir existiendo, pero con el control de flujo
correcto queda limitado a una factura cada 60 s. La API real es `enqueue()` + `flush()`. Si se
recorta el alcance y no se hace el envío por lotes, esa limitación hay que documentarla de forma
prominente en el README, no dejar que se descubra en producción.

**7.5 · Certificado de preproducción.** Es lo único que cierra VF-007 con certeza y lo único que
confirma que las reglas de `trim` y de formato son las correctas. Basta un certificado de persona
jurídica o de representante de la FNMT dado de alta en preproducción — no hace falta uno de
producción. Sin él, el plan llega hasta «conforme según el XSD y los vectores publicados», que es
mucho más de lo que hay hoy pero no es «probado contra la AEAT».

---

## 8. Lo que seguirá sin cubrirse

Aunque se aplique todo:

1. **Semántica que el XSD no expresa.** Ya está dicho, pero conviene repetirlo: la huella en Base64
   valida contra el esquema. El XSD es un cedazo, no un tamiz.
2. **Reglas de negocio no publicadas como esquema**: coherencia de `CuotaTotal` con el desglose,
   combinaciones válidas de `ClaveRegimen`/`CalificacionOperacion`, umbral de `Macrodato`. Se
   materializan como `CodigoErrorRegistro` y solo se descubren contra el servicio real.
3. **El QR impreso.** `jsQR` decodifica un bitmap perfecto — y lo hace **incluso sin zona de
   silencio**, cuando un escáner real no. No dice nada del contraste sobre papel térmico, de la
   impresión a 203 dpi ni del tamaño físico final. Reduce el riesgo de «ilegible por diseño» a
   prácticamente cero; no lo elimina en la práctica de impresión.
4. **La cadena de confianza TLS.** Que la AEAT acepte un certificado concreto y que no haya un
   proxy interpuesto en la red del cliente no se simula.
5. **Firma XAdES y modo «sello».** `ds:Signature` es opcional y en modo Veri\*Factu **no hace
   falta** —lo confirma tanto el XSD (`minOccurs="0"`) como la norma—, pero el modo no verificable
   sí la exige y queda fuera de alcance.
6. **La mutación mide el oráculo sobre el código que hay.** No detecta un requisito **ausente**:
   que no se emita `TipoHuella` en absoluto, por ejemplo.

---

## 9. Resumen de esfuerzo

| Fase | Horas | Dependencias | Paralelizable |
|---|---:|---|---|
| 0 · Red de conformidad y quick wins | 20 | — | Sí, en gran parte |
| 1 · Formatos y huella | 21 | 0.6, 0.7 | Parcialmente |
| 2 · Generación del XML | 60 | 1 | Sí, entre subtareas |
| 3 · Red y cadena | 78 | 1, y coordinación con 2 | Camino crítico largo |
| 4 · QR | 18 | mínimas | **Sí, desde el día uno** |
| 5 · Cierre | 15 | todas | No |
| | **≈ 212 h** | | |

Descontados ya los solapes: los clusters de XML, red y pruebas incluían por separado el mismo
trabajo de vendorizar esquemas y montar el servidor mock. La cifra bruta sumada era de 247 h.

En jornadas: **unas seis semanas a tiempo completo**, o tres meses a media jornada. Con dos
personas, la fase 4 y buena parte de la 0 salen del camino crítico y quedan ≈ 160 h de cadena
estricta.

**Si hay que recortar**, el mínimo que deja la librería funcional es fase 0 + 1 + 2 + 4 y los
puntos 1-9 de la fase 3 (≈ 180 h): conforme al esquema, con huella y QR correctos, capaz de enviar
e interpretar respuestas. Lo que se sacrifica es el envío por lotes, con la limitación de una
factura por minuto que hay que documentar.

---

## 10. Fuentes

- [AEAT · Especificaciones técnicas para generación de la huella o hash, v0.1.2 (PDF)](https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Veri-Factu_especificaciones_huella_hash_registros.pdf) — vectores oficiales del apartado 6
- [AEAT · Especificaciones técnicas del código QR de la factura, v0.5.0 (PDF)](https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/DetalleEspecificacTecnCodigoQRfactura.pdf)
- [AEAT · Descripción del servicio web Veri\*Factu v1.0.3 (PDF)](https://sede.agenciatributaria.gob.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Veri-Factu_Descripcion_SWeb.pdf) — §5.1 faults, §6.4.4.1 control de flujo, §6.5.2 listas L18-L22
- [AEAT · Aclaraciones a dudas de los desarrolladores v1.3 (PDF)](https://sede.agenciatributaria.gob.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/FAQs-Desarrolladores.pdf) — §15 encadenamiento, §17 subsanación
- [AEAT · XSD y WSDL oficiales (`tikeV1.0`)](https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl)
- [AEAT · Catálogo de códigos de error (`errores.properties`)](https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/errores.properties)
- [BOE · Orden EHA/451/2008](https://www.boe.es/buscar/act.php?id=BOE-A-2008-3580) — composición del NIF
- [python-stdnum · `stdnum/es/cif.py`](https://github.com/arthurdejong/python-stdnum/blob/master/stdnum/es/cif.py) — implementación de referencia del CIF
- Implementaciones independientes contrastadas para la huella: [mdiago/VeriFactu](https://github.com/mdiago/VeriFactu) (C#), [EduardoRuizM/verifactu-api-php](https://github.com/EduardoRuizM/verifactu-api-php) (PHP)
- Herramientas: [`libxml2-wasm`](https://github.com/jiangwenz/libxml2-wasm) · [`qrcode-generator`](https://github.com/kazuhikoarase/qrcode-generator) · [`jsqr`](https://github.com/cozmo/jsQR) · [`fast-check`](https://github.com/dubzzz/fast-check)
