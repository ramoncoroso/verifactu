/**
 * Espacios de nombres de Veri*Factu.
 *
 * Las URI se comprueban contra el `targetNamespace` de los XSD vendorizados en
 * `tests/conformance/namespaces.test.ts`. Hasta esa comprobación, `SUM` contenía
 * `SusministroLR.xsd` —con una `s` de más— y el test que lo cubría usaba
 * `toContain('agenciatributaria.gob.es')`, que la dejaba pasar.
 */

/**
 * AEAT Verifactu namespaces
 */
export const Namespaces = {
  /** SOAP envelope namespace */
  SOAP_ENV: 'http://schemas.xmlsoap.org/soap/envelope/',
  /** SOAP encoding namespace */
  SOAP_ENC: 'http://schemas.xmlsoap.org/soap/encoding/',
  /** XML Schema namespace */
  XSD: 'http://www.w3.org/2001/XMLSchema',
  /** XML Schema Instance namespace */
  XSI: 'http://www.w3.org/2001/XMLSchema-instance',
  /**
   * SuministroLR.xsd. Solo tres elementos viven aquí: `RegFactuSistemaFacturacion`,
   * `Cabecera` y `RegistroFactura`. Todo lo demás —incluido el CONTENIDO de la
   * cabecera— es de {@link Namespaces.SUM_INFO}.
   */
  SUM: 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd',
  /**
   * SuministroInformacion.xsd. El contenido de `Cabecera`, `RegistroAlta`,
   * `RegistroAnulacion` y todos sus descendientes.
   */
  SUM_INFO: 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd',
  /** Digital signature namespace */
  DS: 'http://www.w3.org/2000/09/xmldsig#',
} as const;

/**
 * Namespace prefixes
 */
export const NsPrefix = {
  SOAP_ENV: 'soapenv',
  SOAP_ENC: 'soapenc',
  XSD: 'xsd',
  XSI: 'xsi',
  SUM: 'sfLR',
  SUM_INFO: 'sf',
  DS: 'ds',
} as const;

/**
 * Build namespace declarations for XML
 */
export function buildNamespaceDeclarations(
  prefixes: (keyof typeof NsPrefix)[]
): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const key of prefixes) {
    const prefix = NsPrefix[key];
    const uri = Namespaces[key];
    declarations[`xmlns:${prefix}`] = uri;
  }
  return declarations;
}

/**
 * Standard namespace declarations for SOAP messages
 */
export const SOAP_NS_DECLARATIONS = buildNamespaceDeclarations([
  'SOAP_ENV',
  'XSD',
  'XSI',
]);

/**
 * Verifactu specific namespace declarations
 */
export const VERIFACTU_NS_DECLARATIONS = buildNamespaceDeclarations([
  'SUM',
  'SUM_INFO',
]);
