/**
 * Endpoints del servicio Veri*Factu de la AEAT.
 *
 * Todo lo que hay aquí procede de `schemas/SistemaFacturacion.wsdl`, que está
 * vendorizado en el repositorio y congelado por sha256.
 * `tests/conformance/endpoints-wsdl.test.ts` comprueba que este fichero y el WSDL
 * no divergen.
 */

/**
 * Entorno de la AEAT.
 */
export type Environment = 'production' | 'sandbox';

/**
 * Tipo de certificado con el que se accede al servicio.
 *
 * No es un detalle de autenticación: **cambia el host**. El WSDL declara puertos
 * distintos para el certificado de representante y para el de sello de entidad.
 */
export type CertificateKind = 'representative' | 'seal';

/**
 * URLs del servicio, por entorno y tipo de certificado.
 *
 * Los cuatro puertos del WSDL (`SistemaVerifactu`, `SistemaVerifactuSello`,
 * `SistemaVerifactuPruebas`, `SistemaVerifactuSelloPruebas`) comparten la misma
 * ruta `/VerifactuSOAP` y difieren solo en el host.
 */
export const VERIFACTU_SERVICE_URLS = {
  production: {
    representative:
      'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    seal: 'https://www10.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
  },
  sandbox: {
    representative: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    seal: 'https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
  },
} as const;

/**
 * URL del servicio para un entorno y tipo de certificado.
 *
 * Es **una sola URL para todo**: alta, anulación y consulta comparten binding y
 * puerto en el WSDL.
 */
export function getServiceUrl(
  environment: Environment,
  certificateKind: CertificateKind = 'representative'
): string {
  return VERIFACTU_SERVICE_URLS[environment][certificateKind];
}

/**
 * URLs de los servicios.
 *
 * @deprecated Las tres apuntan a la misma URL: el WSDL no define endpoints
 * separados para alta, anulación ni consulta. La anulación viaja como
 * `RegistroAnulacion` dentro del mismo mensaje `RegFactuSistemaFacturacion`, y la
 * consulta es otra operación sobre el mismo puerto. Usa {@link getServiceUrl}.
 */
export interface ServiceEndpoints {
  /** Alta (registro de facturación). */
  alta: string;
  /** Anulación. Misma URL que `alta`. */
  anulacion: string;
  /** Consulta. Misma URL que `alta`. */
  consulta: string;
}

function endpointsFor(environment: Environment): ServiceEndpoints {
  const url = getServiceUrl(environment);
  return { alta: url, anulacion: url, consulta: url };
}

/** @deprecated Usa {@link getServiceUrl}. */
export const PRODUCTION_ENDPOINTS: ServiceEndpoints = endpointsFor('production');

/** @deprecated Usa {@link getServiceUrl}. */
export const SANDBOX_ENDPOINTS: ServiceEndpoints = endpointsFor('sandbox');

/** @deprecated Usa {@link getServiceUrl}. */
export function getEndpoints(environment: Environment): ServiceEndpoints {
  return environment === 'production' ? PRODUCTION_ENDPOINTS : SANDBOX_ENDPOINTS;
}

/**
 * Valor de la cabecera HTTP `SOAPAction`.
 *
 * El WSDL declara `soapAction=""` en **las tres** operaciones, y SOAP 1.1 exige
 * que la cabecera esté presente y su valor entrecomillado. De ahí que el valor
 * sea la cadena de dos comillas, no la cadena vacía.
 */
export const SOAP_ACTION_HEADER = '""';

/**
 * Nombres de las operaciones del WSDL.
 *
 * **No son valores de `SOAPAction`**: son el nombre de la operación y del
 * elemento raíz del cuerpo del mensaje.
 */
export const SOAP_OPERATIONS = {
  /** Altas y anulaciones. Ambas viajan en este mensaje. */
  SUMINISTRO: 'RegFactuSistemaFacturacion',
  /** Consulta de registros. */
  CONSULTA: 'ConsultaFactuSistemaFacturacion',
} as const;

/**
 * Cabeceras `SOAPAction` por operación.
 *
 * @deprecated Las tres valen lo mismo. Usa {@link SOAP_ACTION_HEADER}.
 */
export const SOAP_ACTIONS = {
  ALTA: SOAP_ACTION_HEADER,
  ANULACION: SOAP_ACTION_HEADER,
  CONSULTA: SOAP_ACTION_HEADER,
} as const;

/**
 * Máximo de registros por envío.
 *
 * `SuministroLR.xsd` declara `maxOccurs="1000"` en `RegistroFactura`.
 */
export const MAX_RECORDS_PER_SUBMISSION = 1000;

/**
 * Tiempo de espera inicial entre envíos, en segundos.
 *
 * Valor que fija el art. 16.2 de la OM HAC/1177/2024. La AEAT devuelve un valor
 * actualizado en cada respuesta (`TiempoEsperaEnvio`), que la librería todavía no
 * lee.
 */
export const INITIAL_WAIT_SECONDS = 60;

/**
 * URL de cotejo del QR.
 *
 * Ojo: la especificación define **cuatro**, no dos. Los sistemas que no emiten
 * facturas verificables usan `ValidarQRNoVerifactu`, que la librería no modela
 * todavía.
 */
export const QR_VERIFICATION_URLS = {
  production: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
  sandbox: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
} as const;

/** URL de cotejo del QR para un entorno. */
export function getQrVerificationUrl(environment: Environment): string {
  return QR_VERIFICATION_URLS[environment];
}
