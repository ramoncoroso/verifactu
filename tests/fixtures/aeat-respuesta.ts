/**
 * Respuestas de la AEAT construidas desde `schemas/RespuestaSuministro.xsd`.
 *
 * Los 28 tests de `tests/unit/verifactu-client.test.ts` alimentan al parser un
 * formato inventado (`<RespuestaRegFactura>`, `<EstadoRegistro>` colgando de la
 * raíz) que no existe en ningún esquema de la AEAT. Por eso pasan mientras el
 * parser es incapaz de leer una respuesta real (issue #33).
 *
 * Estas respuestas se validan contra el XSD oficial en el propio test antes de
 * pasárselas al parser, de modo que no puedan derivar hacia la ficción.
 */

const NS_R =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd';
const NS_SF =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

export interface RespuestaLineaInput {
  readonly nif?: string;
  readonly numSerie?: string;
  readonly fecha?: string;
  readonly tipoOperacion?: 'Alta' | 'Anulacion';
  readonly estadoRegistro: 'Correcto' | 'AceptadoConErrores' | 'Incorrecto';
  readonly codigoError?: number;
  readonly descripcionError?: string;
}

export interface RespuestaInput {
  readonly csv?: string;
  readonly estadoEnvio?: 'Correcto' | 'ParcialmenteCorrecto' | 'Incorrecto';
  readonly tiempoEsperaEnvio?: string;
  readonly lineas?: readonly RespuestaLineaInput[];
}

/** Genera una respuesta conforme a `RespuestaSuministro.xsd`. */
export function buildRespuestaSuministro(input: RespuestaInput = {}): string {
  const {
    csv = 'A-B4CD5EF6GH7IJ8K',
    estadoEnvio = 'Correcto',
    tiempoEsperaEnvio = '60',
    lineas = [{ estadoRegistro: 'Correcto' }],
  } = input;

  const cuerpoLineas = lineas
    .map((l) => {
      const {
        nif = 'B12345678',
        numSerie = 'FC0001',
        fecha = '02-08-2026',
        tipoOperacion = 'Alta',
        estadoRegistro,
        codigoError,
        descripcionError,
      } = l;
      const error =
        codigoError === undefined
          ? ''
          : `\n    <sfR:CodigoErrorRegistro>${codigoError}</sfR:CodigoErrorRegistro>` +
            `\n    <sfR:DescripcionErrorRegistro>${descripcionError ?? 'Error'}</sfR:DescripcionErrorRegistro>`;
      return `  <sfR:RespuestaLinea>
    <sfR:IDFactura>
      <sf:IDEmisorFactura>${nif}</sf:IDEmisorFactura>
      <sf:NumSerieFactura>${numSerie}</sf:NumSerieFactura>
      <sf:FechaExpedicionFactura>${fecha}</sf:FechaExpedicionFactura>
    </sfR:IDFactura>
    <sfR:Operacion>
      <sf:TipoOperacion>${tipoOperacion}</sf:TipoOperacion>
    </sfR:Operacion>
    <sfR:EstadoRegistro>${estadoRegistro}</sfR:EstadoRegistro>${error}
  </sfR:RespuestaLinea>`;
    })
    .join('\n');

  return `<sfR:RespuestaRegFactuSistemaFacturacion xmlns:sfR="${NS_R}" xmlns:sf="${NS_SF}">
  <sfR:CSV>${csv}</sfR:CSV>
  <sfR:DatosPresentacion>
    <sf:NIFPresentador>B12345678</sf:NIFPresentador>
    <sf:TimestampPresentacion>2026-08-02T14:00:00+02:00</sf:TimestampPresentacion>
  </sfR:DatosPresentacion>
  <sfR:Cabecera>
    <sf:ObligadoEmision>
      <sf:NombreRazon>Mi Empresa SL</sf:NombreRazon>
      <sf:NIF>B12345678</sf:NIF>
    </sf:ObligadoEmision>
  </sfR:Cabecera>
  <sfR:TiempoEsperaEnvio>${tiempoEsperaEnvio}</sfR:TiempoEsperaEnvio>
  <sfR:EstadoEnvio>${estadoEnvio}</sfR:EstadoEnvio>
${cuerpoLineas}
</sfR:RespuestaRegFactuSistemaFacturacion>`;
}

/** Envuelve una respuesta en un sobre SOAP, como llega por el cable. */
export function wrapSoapResponse(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">
  <env:Body>
${body}
  </env:Body>
</env:Envelope>`;
}

const NS_C =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaConsultaLR.xsd';

/** Genera una respuesta de consulta conforme a `RespuestaConsultaLR.xsd`. */
export function buildRespuestaConsulta(
  input: { readonly estadoRegistro?: string; readonly timestamp?: string } = {}
): string {
  const { estadoRegistro = 'Correcto', timestamp = '2026-08-02T12:00:00+02:00' } = input;
  return `<sfLRRC:RespuestaConsultaFactuSistemaFacturacion xmlns:sfLRRC="${NS_C}" xmlns:sf="${NS_SF}">
  <sfLRRC:RegistroRespuestaConsultaFactuSistemaFacturacion>
    <sfLRRC:IDFactura>
      <sf:IDEmisorFactura>B12345678</sf:IDEmisorFactura>
      <sf:NumSerieFactura>FC0001</sf:NumSerieFactura>
      <sf:FechaExpedicionFactura>02-08-2026</sf:FechaExpedicionFactura>
    </sfLRRC:IDFactura>
    <sfLRRC:EstadoRegistro>
      <sfLRRC:TimestampUltimaModificacion>${timestamp}</sfLRRC:TimestampUltimaModificacion>
      <sfLRRC:EstadoRegistro>${estadoRegistro}</sfLRRC:EstadoRegistro>
    </sfLRRC:EstadoRegistro>
  </sfLRRC:RegistroRespuestaConsultaFactuSistemaFacturacion>
</sfLRRC:RespuestaConsultaFactuSistemaFacturacion>`;
}
