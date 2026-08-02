# Auditoría de conformidad con la especificación Veri\*Factu de la AEAT

> **Fuente única de verdad** para el trabajo pendiente de conformidad de esta librería.
> Cada hallazgo tiene un identificador estable (`VF-0xx`) que se usa en las issues de GitHub,
> en los mensajes de commit y en los tests de regresión.

| | |
|---|---|
| **Commit auditado** | `7d707bd` (`main`) |
| **Fecha de la auditoría** | 2026-08-02 |
| **Alcance** | `src/**` completo, configuración de build/CI/release, documentación |
| **Estado del build** | `tsc --noEmit` ✅ · `eslint` 8 warnings · `npm audit` 0 vulnerabilidades · **691/691 tests ✅** |

> ### ⚠️ Revisión de 2026-08-02
>
> Un análisis posterior en profundidad, contrastado contra los XSD oficiales, el WSDL vigente y
> los vectores de prueba publicados por la AEAT, ha **rectificado dos hallazgos** de este
> documento y ha encontrado **nueve más**, cuatro de ellos bloqueantes.
>
> - **[VF-011](#vf-011) queda refutado.** La cadena *debe* avanzar aunque la AEAT rechace el
>   registro; revertirla sería una no conformidad. El bug real es el contrario y está en el
>   camino de reintento.
> - **[VF-013](#vf-013) es correcto a medias.** El parámetro `huella` sobra, sí; pero la
>   codificación del espacio como `+` es la que prescribe la implementación de referencia de la
>   AEAT — la corrección que se proponía habría roto el comportamiento correcto.
>
> El detalle de ambas rectificaciones, los nueve hallazgos nuevos y el plan de ejecución completo
> están en **[`PLAN_CORRECCIONES.md`](PLAN_CORRECCIONES.md)**. Léelo antes de coger cualquier
> hallazgo de este documento.

---

## Resumen ejecutivo

La ingeniería periférica de esta librería es sólida: jerarquía de errores tipados, retry con
backoff exponencial y jitter, limitador de concurrencia con semáforo, logger inyectable,
matriz de CI en Node 18/20/22, TypeScript en modo estricto con `noUncheckedIndexedAccess`.

El problema está en el núcleo. **Los tres elementos que definen la conformidad con Veri\*Factu
—el código QR, el cálculo de la huella y la estructura del XML— no se ajustan a la
especificación de la AEAT.** En su estado actual la librería no completaría un envío contra el
entorno de preproducción.

Los 691 tests pasan porque verifican el comportamiento de la implementación, no lo que exige la
norma. El caso más claro es el generador de QR: su test comprueba que la salida contiene la
cadena `<svg`, y nunca que el código resultante sea legible por un escáner.

### Hallazgos

| ID | Sev. | Área | Hallazgo |
|----|------|------|----------|
| [VF-001](#vf-001) | 🔴 Bloqueante | QR | El generador de QR es un placeholder; la salida no es escaneable |
| [VF-002](#vf-002) | 🔴 Bloqueante | Huella | La huella se emite en Base64 en lugar de hexadecimal en mayúsculas |
| [VF-003](#vf-003) | 🔴 Bloqueante | Huella | Los campos de la huella de anulación no son los `*Anulada` |
| [VF-004](#vf-004) | 🔴 Bloqueante | Fechas | Las fechas se formatean como `YYYY-MM-DD` en vez de `dd-mm-yyyy` |
| [VF-005](#vf-005) | 🔴 Bloqueante | Seguridad | XML construido por interpolación sin escapado (inyección / XML malformado) |
| [VF-006](#vf-006) | 🔴 Bloqueante | XML | La estructura del registro no se corresponde con el XSD oficial |
| [VF-007](#vf-007) | 🔴 Bloqueante | Red | Endpoints y `SOAPAction` son los del SII, no los de Veri\*Factu |
| [VF-008](#vf-008) | 🟠 Alta | XML | Dos implementaciones de XML divergentes; la exportada públicamente no se usa |
| [VF-009](#vf-009) | 🟠 Alta | Desglose | El cliente descarta las operaciones exentas y no sujetas |
| [VF-010](#vf-010) | 🟠 Alta | Desglose | El recargo de equivalencia no llega al XML ni a `CuotaTotal` |
| ~~[VF-011](#vf-011)~~ | ⬛ Refutado | Cadena | ~~La cadena avanza aunque la AEAT rechace el registro~~ · **sustituido por VF-011R** en el plan |
| [VF-012](#vf-012) | 🟠 Alta | Red | No se implementa el control de flujo (`EstadoEnvio` / `TiempoEsperaEnvio`) |
| [VF-013](#vf-013) | 🟠 Alta | QR | La URL del QR lleva un parámetro de más ~~y codifica mal los espacios~~ · **parcialmente rectificado** |
| [VF-014](#vf-014) | 🟡 Media | Validación | La tabla de prefijos de CIF rechaza identificadores válidos |
| [VF-015](#vf-015) | 🟡 Media | Huella | El offset horario se calcula mal en husos de media hora |
| [VF-016](#vf-016) | 🟡 Media | Release | El pipeline de release apunta a `master`; la rama por defecto es `main` |
| [VF-017](#vf-017) | 🟡 Media | Empaquetado | `package.json` incompleto y `files` referencia una carpeta inexistente |
| [VF-018](#vf-018) | 🟡 Media | Tests | No hay validación contra XSD ni tests de integración |
| [VF-019](#vf-019) | 🟡 Media | Certificados | Los `.p12` heredados de la FNMT fallan en OpenSSL 3 sin mensaje útil |
| [VF-020](#vf-020) | 🟢 Baja | Red | El cliente SOAP ignora el código de estado HTTP |
| [VF-021](#vf-021) | 🟢 Baja | Red | Sin soporte de compresión gzip |
| [VF-022](#vf-022) | 🟢 Baja | Docs | Badge de Codecov apuntando a la rama `master` |
| **VF-023 … VF-031** | 🔴🟠🟡 | varias | **Nueve hallazgos añadidos en la revisión.** Cuatro bloqueantes: el parseo de respuestas busca elementos inexistentes (toda respuesta real lanza `AeatError`); los enums no coinciden con el XSD; `PrimerRegistro` solo admite `S`; sin envío por lotes el control de flujo limita a 1 factura/minuto. Detalle en [`PLAN_CORRECCIONES.md` §3](PLAN_CORRECCIONES.md#3-hallazgos-nuevos) |

**Severidades.** 🔴 Bloqueante: impide que un envío sea aceptado por la AEAT. 🟠 Alta: produce
rechazos, pérdida de datos o corrupción de la cadena en casos reales. 🟡 Media: fallos
concretos o deuda que bloquea la evolución. 🟢 Baja: robustez y pulido.

### Orden de ataque sugerido

> **Superado por [`PLAN_CORRECCIONES.md` §6](PLAN_CORRECCIONES.md#6-las-fases)**, que desarrolla
> este esbozo en cinco fases con esfuerzo estimado, dependencias y estrategia de verificación por
> fase. Lo de abajo se conserva porque el razonamiento sobre dependencias sigue siendo válido.

Las dependencias importan. VF-004 (formato de fecha) alimenta tanto el XML como la cadena de la
huella, así que arreglarlo aisladamente rompe los tests de ambos módulos a la vez.

1. **Formato de datos primitivos** — VF-002, VF-003, VF-004, VF-015. Tocan `hash.ts` y
   `builder.ts`; son la base de todo lo demás.
2. **Estructura del XML** — VF-005, VF-006, VF-008, VF-009, VF-010. Se hacen juntos: la
   reescritura del generador de XML resuelve los cinco de una vez.
3. **Capa de red** — VF-007, VF-011, VF-012, VF-020, VF-021.
4. **QR** — VF-001, VF-013. Independiente del resto; se puede paralelizar.
5. **Resto** — VF-014, VF-016 a VF-019, VF-022.

### Metodología y reproducción

```bash
git clone https://github.com/ramoncoroso/verifactu && cd verifactu
npm ci
npx tsc --noEmit      # sin errores
npm run lint          # 8 warnings (no-console en logger.ts, intencionados)
npm run test:coverage # 691 tests, ~94% de cobertura
npm audit --omit=dev  # 0 vulnerabilidades
```

La conformidad se contrastó contra el XSD oficial `SuministroInformacion.xsd` y contra la
documentación pública de la AEAT enlazada en [Referencias](#referencias). **Ningún hallazgo se ha
verificado todavía contra el entorno real de preproducción**, porque hacerlo requiere un
certificado electrónico válido; ver [VF-018](#vf-018).

---

## Detalle de los hallazgos

### VF-001

**El generador de QR es un placeholder; la salida no es escaneable** · 🔴 Bloqueante · `src/qr/generator.ts`

El propio código lo declara, en `src/qr/generator.ts:95`:

```ts
/**
 * Generate a simple QR code matrix using a basic algorithm
 * This is a simplified implementation for demonstration purposes
 */
function generateQrMatrix(data: string, version: number): boolean[][] {
```

La función dibuja los patrones de localización, separadores y sincronismo correctamente, pero a
partir de ahí (`fillDataArea`, `src/qr/generator.ts:216`) rellena el área de datos con los bits
crudos de la cadena más los de un `simpleHash()` de 32 bits. Faltan **todos** los elementos que
convierten esa matriz en un código QR válido:

- corrección de errores Reed-Solomon (obligatoria: el nivel M implica ~15% de redundancia),
- indicador de modo y de longitud al inicio del flujo de bits,
- los patrones de máscara y la selección de la máscara óptima por penalización,
- la información de formato y de versión con su BCH,
- el patrón de alineación en las posiciones reales (`getAlignmentPosition` devuelve una
  aproximación con el comentario `// Simplified`, `src/qr/generator.ts:172`).

**Impacto.** El SVG generado no lo lee ningún escáner. El QR es obligatorio en toda factura
emitida por un SIF, así que cualquier documento impreso con esta salida es no conforme.

**Por qué no lo detectan los tests.** `tests/unit/qr-generator.test.ts` solo comprueba
propiedades superficiales de la cadena de salida:

```ts
expect(result.data).toContain('<svg');
expect(result.data).toContain('#FF0000');
```

**Cómo arreglarlo.** Sustituir el codificador. La recomendación es apoyarse en un encoder
probado en vez de reimplementar Reed-Solomon: `qrcode-generator` (MIT) es el port canónico del
encoder de Kazuhiko Arase, pesa ~10 KB y **no arrastra dependencias transitivas**, con lo que el
coste de instalación sigue siendo mínimo. La alternativa —escribirlo a mano para mantener el
claim de cero dependencias— es viable pero son ~600 líneas de código criptográficamente
delicado, y hoy ese claim es precisamente la causa de que el módulo esté roto.

**Criterio de aceptación.** Un test que **decodifique** el QR generado (por ejemplo con `jsqr`
en `devDependencies`, rasterizando la matriz) y compruebe que devuelve exactamente la URL de
cotejo. Sin ese test el hallazgo puede reaparecer.

---

### VF-002

**La huella se emite en Base64 en lugar de hexadecimal en mayúsculas** · 🔴 Bloqueante · `src/crypto/hash.ts`

`src/crypto/hash.ts:17-28` define la función que usan `calculateAltaHash` y
`calculateAnulacionHash`:

```ts
export function sha256(data: string): string {
  const hash = createHash('sha256');
  hash.update(data, 'utf8');
  return hash.digest('base64');   // ← 44 caracteres en Base64
}
```

La AEAT especifica que el resultado es *«una cadena hexadecimal de 64 caracteres […] la cual se
representa en mayúsculas»*, por ejemplo
`3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60`.

Curiosamente `sha256Hex()` ya existe en `src/crypto/hash.ts:33`, pero devuelve minúsculas y
**ninguna función la invoca**.

**Impacto.** El sistema de la AEAT recalcula la huella de cada registro recibido; si no coincide
con la informada, marca el registro como *«Aceptado con errores»*. Con este defecto, eso ocurre
en el 100% de los envíos. Además propaga el error al QR, que incluye la huella.

**Cómo arreglarlo.** Que `calculateAltaHash` / `calculateAnulacionHash` devuelvan
`createHash('sha256').update(data, 'utf8').digest('hex').toUpperCase()`. Conviene mantener
`sha256()` en Base64 solo si algún consumidor externo la usa; si no, eliminarla para que no
vuelva a colarse.

**Criterio de aceptación.** `expect(huella).toMatch(/^[0-9A-F]{64}$/)` y un test de vector
conocido contra un ejemplo publicado por la AEAT.

---

### VF-003

**Los campos de la huella de anulación no son los `*Anulada`** · 🔴 Bloqueante · `src/crypto/hash.ts`

`src/crypto/hash.ts:130-140` construye la cadena a hashear para un registro de anulación:

```ts
const parts = [
  `IDEmisorFactura=${input.issuerNif}`,
  `NumSerieFactura=${input.invoiceNumber}`,
  `FechaExpedicionFactura=${formatXmlDate(input.issueDate)}`,
  `Huella=${input.previousHash}`,
  `FechaHoraHusoGenRegistro=${formatTimestamp(input.generationTimestamp)}`,
];
```

Para `RegistroAnulacion` los nombres de campo son `IDEmisorFacturaAnulada`,
`NumSerieFacturaAnulada` y `FechaExpedicionFacturaAnulada` — así se llaman en el tipo
`IDFacturaExpedidaBajaType` del XSD, y así deben aparecer en la cadena concatenada.

**Impacto.** Toda anulación se marca como aceptada con errores.

**Criterio de aceptación.** Un test sobre `buildAnulacionHashInput()` que compruebe la cadena
completa carácter a carácter, no con `toContain`.

---

### VF-004

**Las fechas se formatean como `YYYY-MM-DD` en vez de `dd-mm-yyyy`** · 🔴 Bloqueante · `src/xml/builder.ts`

`src/xml/builder.ts:66-71`:

```ts
/** Format a date for XML (ISO format: YYYY-MM-DD) */
export function formatXmlDate(date: Date): string {
  return `${year}-${month}-${day}`;
}
```

En el XSD, `FechaExpedicionFactura` es una cadena de longitud fija 10 con
`pattern="\d{2,2}-\d{2,2}-\d{4,4}"`, es decir **día-mes-año**. El mismo formato aplica a
`FechaOperacion` y a la fecha dentro de `RegistroAnterior`.

El defecto se propaga a dos sitios a la vez, porque `formatXmlDate` la consumen tanto el
generador de XML como el constructor de la cadena de la huella
(`src/crypto/hash.ts:85` y `:134`).

Relacionado y en el mismo fichero: `formatXmlDateTime` (`src/xml/builder.ts:76-82`) emite
`2026-08-02T14:30:00` **sin designador de huso horario**, cuando `FechaHoraHusoGenRegistro` es
un `xs:dateTime` que debe llevarlo (`2026-08-02T14:30:00+02:00`). Nótese que
`formatTimestamp` en `hash.ts:206` **sí** lo incluye: las dos representaciones del mismo
instante no coinciden entre el XML y la huella.

**Impacto.** Rechazo por validación de esquema, y huella incorrecta.

**Cómo arreglarlo.** Renombrar a algo explícito (`formatAeatDate` / `formatAeatDateTime`) para
que el formato quede claro en el punto de uso, y unificar el formateo de la marca temporal en
una sola función usada por ambos módulos.

---

### VF-005

**XML construido por interpolación sin escapado** · 🔴 Bloqueante · `src/client/verifactu-client.ts`

Los tres métodos que generan el SOAP que realmente se envía —`buildAltaSoapBody`
(`src/client/verifactu-client.ts:535`), `buildAnulacionSoapBody` (`:662`) y
`buildConsultaSoapBody` (`:736`)— interpolan datos de entrada directamente en plantillas de
cadena, **sin escapar ningún carácter**:

```ts
<sum:NombreRazon>${invoice.issuer.name}</sum:NombreRazon>
...
<sum:DescripcionOperacion>${invoice.description}</sum:DescripcionOperacion>
```

Afecta a razón social del emisor, razón social de cada destinatario, descripción de la
operación, número de serie, y a los campos del sistema informático.

**Impacto.** Doble:

- *Funcional, y trivial de provocar:* una razón social tan común como `Pepe & Hijos, S.L.`
  genera XML no válido y el envío falla. Basta un `&`, `<` o `>`.
- *Seguridad:* cualquier campo que provenga de datos de cliente permite inyectar elementos XML
  arbitrarios en el registro —incluida la posibilidad de cerrar el elemento en curso y añadir
  otros—, lo que en un sistema de facturación con valor probatorio es un riesgo real.

Lo llamativo es que `escapeXml()` ya existe y es correcta (`src/xml/builder.ts:40-47`); esta
ruta de código simplemente no la usa. Ver [VF-008](#vf-008), que es la causa de fondo.

**Cómo arreglarlo.** Eliminar la construcción por plantillas de cadena y generar el XML con el
builder de `src/xml/builder.ts`, que escapa en la serialización. No basta con envolver las
interpolaciones en `escapeXml()`: mientras existan dos generadores, el arreglo se volverá a
perder.

**Criterio de aceptación.** Un test que emita una factura con `& < > " '` en razón social,
descripción y serie, y valide que el XML resultante parsea y que los valores se recuperan
intactos.

---

### VF-006

**La estructura del registro no se corresponde con el XSD oficial** · 🔴 Bloqueante · `src/client/verifactu-client.ts`

Contrastado elemento a elemento contra `SuministroInformacion.xsd`. El orden de los hijos de
`RegistroFacturacionAltaType` es:

```
IDVersion, IDFactura, RefExterna, NombreRazonEmisor, Subsanacion, RechazoPrevio, TipoFactura,
TipoRectificativa, FacturasRectificadas, FacturasSustituidas, ImporteRectificacion,
FechaOperacion, DescripcionOperacion, FacturaSimplificadaArt7273,
FacturaSinIdentifDestinatarioArt61d, Macrodato, EmitidaPorTerceroODestinatario, Tercero,
Destinatarios, Cupon, Desglose, CuotaTotal, ImporteTotal, Encadenamiento, SistemaInformatico,
FechaHoraHusoGenRegistro, NumRegistroAcuerdoFacturacion, IdAcuerdoSistemaInformatico,
TipoHuella, Huella, Signature
```

y el de `RegistroFacturacionAnulacionType`:

```
IDVersion, IDFactura, RefExterna, SinRegistroPrevio, RechazoPrevio, GeneradoPor, Generador,
Encadenamiento, SistemaInformatico, FechaHoraHusoGenRegistro, TipoHuella, Huella, Signature
```

Divergencias detectadas en `buildAltaSoapBody` / `buildAnulacionSoapBody`:

| # | Qué ocurre | Qué debería ocurrir |
|---|---|---|
| a | El registro cuelga directamente de `<sum:RegistroFactura>` (`:561`) | `RegistroFactura` es un envoltorio; dentro va `<RegistroAlta>` o `<RegistroAnulacion>` |
| b | No se emite `IDVersion` | Obligatorio y primer hijo del registro |
| c | No se emite `TipoHuella` | Obligatorio, valor `01` (SHA-256), justo antes de `Huella` |
| d | `RegistroAnterior` lleva `Huella, FechaExpedicionFactura, NumSerieFactura` (`:626-630`) | `IDEmisorFactura, NumSerieFactura, FechaExpedicionFactura, Huella` — falta el emisor y el orden es otro |
| e | La anulación usa una raíz propia `<sum:AnulaFactuSistemaFacturacion>` (`:675`) y un endpoint distinto | Las anulaciones viajan en el **mismo** `RegFactuSistemaFacturacion`, como `RegistroFactura/RegistroAnulacion` |
| f | La anulación identifica la factura con `IDEmisorFactura` / `NumSerieFactura` / `FechaExpedicionFactura` (`:684-686`) | `IDEmisorFacturaAnulada` / `NumSerieFacturaAnulada` / `FechaExpedicionFacturaAnulada` (mismo defecto que [VF-003](#vf-003)) |
| g | Todo el documento usa el prefijo `sum:` | La cabecera y el contenido del registro pertenecen a `SuministroInformacion.xsd` (habitualmente `sum1:`); solo el elemento raíz y `RegistroFactura` son de `SuministroLR.xsd` |

Además, `src/xml/templates/alta.ts:17-20` modela `IDEmisorFactura` como un elemento complejo con
un hijo `<NIF>`, que es la forma del SII; en Veri\*Factu es un valor simple.

**Cómo arreglarlo.** Reescribir el generador partiendo del XSD, no de un ejemplo. Merece la pena
incorporar los `.xsd` al repositorio (`schemas/`, que además ya está declarado en
`package.json`, ver [VF-017](#vf-017)) y validar contra ellos en los tests ([VF-018](#vf-018)).

---

### VF-007

**Endpoints y `SOAPAction` son los del SII, no los de Veri\*Factu** · 🔴 Bloqueante · `src/client/endpoints.ts`

`src/client/endpoints.ts:26-38` apunta a `.../TIKE-CONT/ws/SistemaFacturacion/SuministroLR`, y
`SOAP_ACTIONS` (`:50-57`) declara `SuministroLRFacturasEmitidas` / `BajaLRFacturasEmitidas` /
`ConsultaLRFacturasEmitidas`, que son las operaciones del Suministro Inmediato de Información.

Para Veri\*Factu el endpoint es `.../TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP`
(`prewww1.aeat.es` en preproducción, `www1.agenciatributaria.gob.es` en producción) y la
operación es `RegFactuSistemaFacturacion`. Existe además una variante `VerifactuSelloSOAP` para
el envío con sello, que la librería no contempla.

**Nota.** Verificar las URLs exactas contra el WSDL vigente antes de cerrar la issue; la AEAT ha
publicado revisiones y este documento no ha podido comprobarlas contra el servicio real.

---

### VF-008

**Dos implementaciones de XML divergentes; la exportada no se usa** · 🟠 Alta · `src/xml/templates/`

`src/xml/templates/alta.ts` y `anulacion.ts` implementan un generador de XML completo, con el
builder seguro, y tienen 99-100% de cobertura de tests. `src/xml/index.ts:8-9` los reexporta, y
`src/index.ts` reexporta `src/xml/index.js`, así que **forman parte de la API pública**.

Pero `VerifactuClient` no los importa: construye su propio XML por concatenación de cadenas.
Un `grep` lo confirma —ningún fichero fuera de `src/xml/templates/` importa de ese directorio.

Consecuencias:

- Quien use `buildAltaSoapEnvelope()` obtiene un envelope con forma de SII
  (`<sum:SuministroLRFacturasEmitidas>`, `src/xml/templates/alta.ts:291`), distinto del que
  envía el cliente.
- La cobertura de tests da una falsa sensación de seguridad: el código bien testeado es
  precisamente el que nunca se ejecuta en producción.
- Es la causa raíz de [VF-005](#vf-005): la ruta con escapado existe, pero el cliente no la usa.
- Hay un defecto adicional solo en la ruta de templates: `buildAltaRecordXml`
  (`src/xml/templates/alta.ts:263`) genera `FechaHoraHusoGenRegistro` con un `new Date()` propio,
  **distinto del instante con el que se calculó la huella**, de modo que nunca podrían coincidir.

**Cómo arreglarlo.** Una sola implementación. Consolidar sobre `src/xml/templates/` (corregida
según [VF-006](#vf-006)) y hacer que `VerifactuClient` la consuma, o eliminar el directorio y
quedarse con una única fachada. Lo que no puede quedar es la duplicidad.

---

### VF-009

**El cliente descarta las operaciones exentas y no sujetas** · 🟠 Alta · `src/client/verifactu-client.ts`

`buildAltaSoapBody` solo itera sobre `invoice.taxBreakdown.vatBreakdowns`
(`src/client/verifactu-client.ts:597`). Los campos `exemptBreakdowns` y `nonSubjectBreakdowns`
—que el modelo define, el `InvoiceBuilder` deja rellenar y el validador de negocio comprueba— no
llegan nunca al XML.

**Impacto.** En cualquier factura con líneas exentas o no sujetas, el `Desglose` enviado no
cuadra con el `ImporteTotal`, y el registro es rechazado. Los datos se pierden en silencio: no
hay error ni aviso.

(La ruta de `src/xml/templates/alta.ts:110-135` **sí** los contempla — otra manifestación de
[VF-008](#vf-008).)

---

### VF-010

**El recargo de equivalencia no llega al XML ni a `CuotaTotal`** · 🟠 Alta · `src/client/verifactu-client.ts`

Tres sitios en desacuerdo sobre qué es el total:

- `src/validation/business-validator.ts:199-201` **suma** `equivalenceSurchargeAmount` al
  total calculado, y valida `invoice.totalAmount` contra él.
- `buildAltaSoapBody` (`src/client/verifactu-client.ts:599-606`) **no emite** ni
  `TipoRecargoEquivalencia` ni `CuotaRecargoEquivalencia`.
- `CuotaTotal` se calcula como la suma de `vatAmount` (`:540-543`), **sin** el recargo, tanto
  para el XML como para la huella (`src/crypto/hash.ts:158-161`).

**Impacto.** Una factura con recargo de equivalencia pasa la validación local y es rechazada por
la AEAT, porque el desglose enviado no justifica el `ImporteTotal`.

**Cómo arreglarlo.** Definir `CuotaTotal` en un único sitio, incluyendo el recargo, y consumirlo
desde el XML y desde la huella.

---

### VF-011

**~~La cadena avanza aunque la AEAT rechace el registro~~** · ⬛ **REFUTADO** · `src/client/verifactu-client.ts`

> **Este hallazgo es incorrecto. No lo implementes.**
>
> El síntoma descrito abajo es cierto, pero es el **comportamiento correcto**: la cadena es local,
> se genera al expedir la factura, y un registro rechazado permanece en ella. Revertirla sería una
> no conformidad — la huella del registro ya va impresa en el QR de una factura probablemente
> entregada, y suprimir un RF generado es justo lo que prohíben los arts. 7 y 10 del RRSIF. El
> remedio normativo ante un rechazo es un alta de **subsanación** (`Subsanacion="S"`,
> `RechazoPrevio="X"`), no rehacer el registro anterior. Tampoco se produce la cascada de rechazos
> que este hallazgo predice: los códigos 2002/2003 relativos a la huella anterior están en la lista
> de los que producen *aceptación*.
>
> El bug real está en el camino de reintento y es más grave: `submitInvoiceWithRetry` regenera el
> registro con un `new Date()` nuevo, produciendo **dos huellas distintas para la misma factura**
> justo cuando el primer envío pudo haber llegado. Ver **VF-011R** en
> [`PLAN_CORRECCIONES.md` §2.1](PLAN_CORRECCIONES.md#21-vf-011--refutado-la-cadena-debe-avanzar-aunque-la-aeat-rechace),
> con las cinco líneas de evidencia.
>
> Lo único que se salva de la propuesta original es separar `prepare()` de `commit()`, pero por
> durabilidad frente a caídas del proceso, no por el rechazo.

<details><summary>Análisis original (conservado por trazabilidad)</summary>

`submitInvoice` (`src/client/verifactu-client.ts:155`) llama a `this.chain.processInvoice()`
**antes** de enviar, y `processInvoice` actualiza el estado interno de forma incondicional
(`src/crypto/chain.ts:105-110`). Si la respuesta es `Rechazado`, el estado no se revierte: el
método devuelve el resultado con normalidad (`:199`) y la cadena queda apuntando a una huella
que la AEAT no ha registrado.

`submitInvoiceWithRetry` restaura el estado guardado (`:399`), pero solo en el callback
`onRetry`, es decir **únicamente cuando se lanza una excepción**. Un rechazo de negocio no es
una excepción: es una respuesta correcta con `accepted: false`.

**Impacto.** Todos los registros posteriores encadenan contra una huella inexistente y son
rechazados en cascada. Recuperarse exige reconstruir la cadena a mano.

**Cómo arreglarlo.** Confirmar el avance de la cadena solo tras una respuesta aceptada
(`Correcto` o `AceptadoConErrores`), y revertir en cualquier otro caso. Conviene separar el
cálculo de la huella del avance del estado —`prepare()` y `commit()`— para que la distinción sea
explícita en el tipo.

</details>

---

### VF-012

**No se implementa el control de flujo** · 🟠 Alta · `src/client/verifactu-client.ts`

`parseAltaResponse` (`src/client/verifactu-client.ts:766`) lee `EstadoRegistro`, `CSV`,
`CodigoErrorRegistro` y `DescripcionErrorRegistro`, pero ignora dos campos de la respuesta:

- **`EstadoEnvio`** — el estado global del envío, distinto del estado de cada registro.
- **`TiempoEsperaEnvio`** — los segundos que la AEAT indica que hay que esperar antes del
  siguiente envío.

**Impacto.** Sin respetar `TiempoEsperaEnvio`, la AEAT empieza a rechazar envíos por exceso de
frecuencia. El `ConcurrencyLimiter` no cubre esto: limita peticiones simultáneas, no la cadencia
mínima entre peticiones consecutivas.

**Cómo arreglarlo.** Exponer ambos campos en el tipo de respuesta y hacer que el cliente
programe el siguiente envío respetando el tiempo de espera indicado.

---

### VF-013

**La URL del QR lleva un parámetro de más y codifica mal los espacios** · 🟠 Alta · `src/qr/url-builder.ts`

`buildQrUrl` (`src/qr/url-builder.ts:62-69`) añade cinco parámetros:

```ts
searchParams.set('nif', params.nif);
searchParams.set('numserie', params.numserie);
searchParams.set('fecha', params.fecha);
searchParams.set('importe', params.importe);
searchParams.set('huella', params.huella);   // ← no está en la especificación
```

La URL de cotejo lleva **cuatro** parámetros: `nif`, `numserie`, `fecha` (dd-mm-yyyy) e
`importe` (con punto decimal). La huella no forma parte de ellos; incluirla alarga el contenido
del QR sin motivo y desvía del formato normalizado.

> **Rectificación.** La segunda mitad de este hallazgo era falsa y se ha retirado. Decía que
> `URLSearchParams` codifica mal el espacio (como `+` en vez de `%20`) y proponía usar
> `encodeURIComponent`. La especificación oficial del QR (v0.5.0, §4.1) adjunta su implementación
> de referencia en Java, `java.net.URLEncoder.encode(param, "UTF-8")`, que codifica el espacio
> **como `+`**. Contrastado carácter a carácter sobre todo ASCII 32-126: `URLSearchParams`
> coincide con la referencia en 0 diferencias, `encodeURIComponent` diverge en 6. **El
> comportamiento actual es el correcto**; aplicar la corrección propuesta lo habría roto.
>
> Lo que sí falla en su lugar: §4 exige contenido **ASCII 32-126** y §10 tipifica el error 2003
> («el número de serie contiene caracteres no permitidos»). Hoy una serie con `Ñ` se codifica como
> `%C3%91` y la Sede la rechaza — es un problema de **validación**, no de codificación. Y
> `validateQrParams` **nunca se invoca desde `buildQrUrl`**, así que los datos inválidos llegan al
> QR impreso sin un aviso. Detalle en
> [`PLAN_CORRECCIONES.md` §2.2](PLAN_CORRECCIONES.md#22-vf-013--la-mitad-sobre-el-20-es-incorrecta).

**Coste medido de llevar el parámetro de más.** La URL pasa de 133 a 205 caracteres, el QR de
versión 8 a 10, y el módulo impreso encoge un 12 % en un código que debe caber entre 30 y 40 mm.

**Detalle menor, mismo fichero.** `validateQrParams` (`:111`) da por válida cualquier huella de
más de 20 caracteres. La comprobación debe **eliminarse**, no endurecerse: la huella deja de viajar
en la URL, y validar su formato corresponde al módulo de huella ([VF-002](#vf-002)), no aquí.

---

### VF-014

**La tabla de prefijos de CIF rechaza identificadores válidos** · 🟡 Media · `src/validation/nif-validator.ts`

`src/validation/nif-validator.ts:42-44`:

```ts
const CIF_LETTER_ONLY_PREFIXES = ['K', 'L', 'M'];
const CIF_DIGIT_ONLY_PREFIXES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
```

La clasificación habitual es: control **numérico** para `A, B, E, H`; control **alfabético** para
`K, P, Q, R, S, N, W`; y cualquiera de los dos para el resto (`C, D, F, G, J, L, M, U, V`).

**Impacto.** Dos errores en sentidos opuestos. Los prefijos `C, D, F, G` se fuerzan a dígito, de
modo que un CIF válido con letra de control se rechaza (falso negativo, el más grave: bloquea
facturar a un cliente legítimo). Y `P, Q, R, S, N, W` caen en la rama permisiva, aceptando
combinaciones que deberían rechazarse (falso positivo).

**Criterio de aceptación.** Una tabla de casos con al menos un identificador real por cada letra
de prefijo, en ambas variantes de control.

---

### VF-015

**El offset horario se calcula mal en husos de media hora** · 🟡 Media · `src/crypto/hash.ts`

`src/crypto/hash.ts:215-219`:

```ts
const offsetMinutes = date.getTimezoneOffset();
const offsetHours = Math.abs(Math.floor(offsetMinutes / 60));
const offsetMins = Math.abs(offsetMinutes % 60);
```

`Math.floor` se aplica **antes** de `Math.abs`, así que redondea hacia abajo un número negativo.
En UTC+5:30, `getTimezoneOffset()` devuelve `-330`; `Math.floor(-330/60)` es `-6`, y el
resultado es `+06:30` en lugar de `+05:30`.

El signo (`:218`) sí es correcto. Basta invertir el orden de las operaciones:
`Math.floor(Math.abs(offsetMinutes) / 60)`.

**Impacto.** Bajo en la práctica —la facturación española opera en husos de hora completa— pero
la huella sería incorrecta al ejecutar en un servidor configurado en uno de esos husos, y el
fallo es silencioso. Se arregla en una línea.

---

### VF-016

**El pipeline de release apunta a `master`; la rama por defecto es `main`** · 🟡 Media · `.releaserc.json`

`.releaserc.json:2` declara `"branches": ["master"]` y `.github/workflows/release.yml:5` se
dispara con `branches: [master]`. La rama por defecto del repositorio es `main`.

**Impacto.** `semantic-release` no se ejecuta nunca. El `ROADMAP.md` atribuye la ausencia de
publicaciones a que falta configurar `NPM_TOKEN`; ese es un requisito real, pero **no es el
único bloqueo**, y arreglar solo el token no resolvería nada.

---

### VF-017

**`package.json` incompleto y `files` referencia una carpeta inexistente** · 🟡 Media · `package.json`

- `repository.url` y `author` están vacíos. npm no mostrará enlaces al repositorio, y la
  generación de provenance en la publicación falla sin `repository.url`.
- `files: ["dist", "schemas"]` incluye una carpeta `schemas/` que no existe en el repositorio.
  Encaja bien con [VF-006](#vf-006) y [VF-018](#vf-018): incorporar ahí los XSD oficiales
  convierte esta entrada en correcta y habilita la validación de esquema.

---

### VF-018

**No hay validación contra XSD ni tests de integración** · 🟡 Media · `tests/`

Los 691 tests son unitarios y verifican que el código hace lo que hace. Ninguno comprueba que lo
que hace sea lo que exige la norma. De ahí que hallazgos como [VF-001](#vf-001),
[VF-002](#vf-002) o [VF-004](#vf-004) convivan con una suite en verde.

Faltan tres niveles:

1. **Validación de esquema.** Incorporar los XSD oficiales a `schemas/` y validar contra ellos
   cada XML generado. Es la red de seguridad que habría evitado [VF-006](#vf-006) entero.
2. **Vectores de prueba de la huella.** Comprobar los ejemplos publicados por la AEAT en el
   documento de especificaciones de la huella, comparando la cadena concatenada completa y el
   digest resultante.
3. **Integración contra preproducción.** Un test opcional, activado por variable de entorno, que
   envíe un registro real contra `prewww1.aeat.es` con un certificado de pruebas. Es la única
   forma de cerrar [VF-007](#vf-007) con certeza.

Merece la pena reescribir los tests de los módulos afectados *antes* de tocar el código, para
que fijen la especificación y no la implementación actual.

---

### VF-019

**Los `.p12` heredados de la FNMT fallan en OpenSSL 3 sin mensaje útil** · 🟡 Media · `src/crypto/certificate.ts`

Node 18+ va contra OpenSSL 3, que rechaza por defecto los PKCS#12 cifrados con algoritmos
heredados (RC2-40, típico en exportaciones antiguas de la FNMT y de otras AC). El error que
emerge es un `mac verify failure` o `unsupported` genérico, que `loadPfxCertificate`
(`src/crypto/certificate.ts:158-172`) propaga tal cual.

**Impacto.** Un usuario con un certificado perfectamente válido recibe un mensaje incomprensible
y sin salida documentada.

**Cómo arreglarlo.** Detectar el patrón del error y lanzar un `CertificateError` que explique la
causa y ofrezca las dos vías: reexportar el `.p12` con cifrado moderno, o arrancar Node con el
proveedor legacy de OpenSSL. Documentarlo en el README junto a la configuración de certificados.

---

### VF-020

**El cliente SOAP ignora el código de estado HTTP** · 🟢 Baja · `src/client/soap-client.ts`

`sendSoapRequest` (`src/client/soap-client.ts:86-115`) parsea el cuerpo y busca un `Fault`, pero
nunca comprueba `res.statusCode`. Ante un 403 o un 502 que devuelva una página HTML, el fallo se
presenta como `Failed to parse SOAP response`, ocultando la causa real (certificado no
autorizado, servicio caído, proxy interpuesto).

Debería inspeccionarse el estado antes de parsear y construir un error de red que lo incluya.

---

### VF-021

**Sin soporte de compresión gzip** · 🟢 Baja · `src/client/soap-client.ts`

No se envía `Accept-Encoding` ni se descomprime la respuesta. En envíos por lotes —hasta 1.000
registros por petición— el ahorro de ancho de banda es considerable. Mejora, no defecto.

---

### VF-022

**Badge de Codecov apuntando a la rama `master`** · 🟢 Baja · `README.md`

`README.md:8` y `README.en.md:6` enlazan a `codecov.io/gh/ramoncoroso/verifactu/branch/master`.
La rama es `main`, así que el badge no refleja la cobertura real. Mismo origen que
[VF-016](#vf-016).

---

## Referencias

- [AEAT · Sistemas informáticos de facturación y Veri\*Factu](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html)
- [AEAT · Preguntas frecuentes: huella o «hash»](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/huella-hash.html)
- [WSDL y XSD de Veri\*Factu (`SuministroInformacion.xsd`, `SuministroLR.xsd`, `RespuestaSuministro.xsd`)](https://github.com/hectorsipe/aeat-verifactu)
- [Guía técnica de referencia de la comunidad](https://github.com/JoseRGWeb/Veri-factuSender/blob/main/docs/Verifactu-Guia-Tecnica.md)
- [Cálculo de la huella hash: desarrollo y ejemplos](https://seoxan.es/articulo/huella-hash-verifactu-calculo-sha256)
- [Especificación del código QR de Veri\*Factu](https://www.codigonext.com/recursos/verifactu-codigo-qr/)

## Cómo contribuir a la resolución

Cada hallazgo tiene una issue abierta con el mismo identificador. Al abordar uno:

1. Comenta en la issue para evitar trabajo duplicado.
2. Escribe primero el test que fija **lo que dice la norma**, y comprueba que falla.
3. Referencia el identificador en el commit: `fix(hash): huella en hexadecimal mayúsculas (VF-002)`.
4. Si al resolverlo descubres que el análisis de este documento es incorrecto o incompleto,
   corrígelo en el mismo PR. Este documento debe seguir siendo fiable.
