# Procedencia de los esquemas

Ficheros descargados **byte a byte** de la fuente oficial. No se modifican en disco:
el `schemaLocation` remoto de `xmldsig-core-schema.xsd` se reescribe **en memoria**
en `tests/helpers/xsd.ts`, para que estos `sha256` sigan siendo comparables con los
originales de la AEAT.

Regenerar con `npm run schemas:fetch`; verificar con `npm run schemas:check`.

| Fichero | Bytes | sha256 | Origen |
|---|---:|---|---|
| `SuministroLR.xsd` | 1574 | `26bacfc6229d1a31…` | https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SuministroLR.xsd |
| `SuministroInformacion.xsd` | 49540 | `ee4c1655175644de…` | https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SuministroInformacion.xsd |
| `RespuestaSuministro.xsd` | 6259 | `82acf80f785643ca…` | https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/RespuestaSuministro.xsd |
| `ConsultaLR.xsd` | 3886 | `bf2cdb8fc4b95b29…` | https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/ConsultaLR.xsd |
| `RespuestaConsultaLR.xsd` | 10058 | `de35063acb8d9ba0…` | https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/RespuestaConsultaLR.xsd |
| `SistemaFacturacion.wsdl` | 8780 | `05919120708ff765…` | https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl |
| `errores.properties` | 25078 | `e1fb776f148077a3…` | https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/errores.properties |
| `xmldsig-core-schema.xsd` | 10292 | `d102ad3df7664c30…` | https://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd |

Descargados el 2026-08-02.

## Notas

- La ruta de descarga es `tikeV1.0`, pero el `targetNamespace` de los esquemas
  es `…/tike/cont/ws/…`. **No coinciden**, y es lo esperado: no lo "corrijas".
- `xmldsig-core-schema.xsd` procede del W3C, no de la AEAT. Es necesaria porque
  `SuministroInformacion.xsd` la importa con una URL absoluta y sin ella el
  esquema no compila en un entorno sin red.
- `errores.properties` es el catálogo oficial de códigos de error. No participa
  en la validación; se vendoriza como referencia para la taxonomía de errores.
