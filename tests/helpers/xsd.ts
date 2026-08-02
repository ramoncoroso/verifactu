/**
 * Validación contra los XSD oficiales de la AEAT vendorizados en `schemas/`.
 *
 * Los ficheros de `schemas/` están byte a byte como los publica la AEAT, para que
 * su sha256 siga siendo comparable con el original. `SuministroInformacion.xsd`
 * importa `xmldsig-core-schema.xsd` con una URL absoluta, lo que impediría
 * compilar el esquema sin red; esa única `schemaLocation` se reescribe **aquí, en
 * memoria**, no en disco.
 *
 * Motor: libxml2 compilado a WASM. Sin toolchain nativo, sin JDK y sin recompilar
 * en la matriz Node 18/20/22 del CI.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  XmlBufferInputProvider,
  XmlDocument,
  XmlLibError,
  XsdValidator,
  xmlRegisterInputProvider,
} from 'libxml2-wasm';

const SCHEMAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemas');

const XMLDSIG_REMOTE = 'http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd';
const XMLDSIG_LOCAL = 'xmldsig-core-schema.xsd';

/** Esquemas que se sirven al resolutor de `import`. */
const SCHEMA_FILES = [
  'SuministroLR.xsd',
  'SuministroInformacion.xsd',
  'RespuestaSuministro.xsd',
  'ConsultaLR.xsd',
  'RespuestaConsultaLR.xsd',
  XMLDSIG_LOCAL,
] as const;

function loadSchemaSource(file: string): string {
  const raw = readFileSync(join(SCHEMAS_DIR, file), 'utf8');
  // Única modificación, y solo en memoria: el import remoto de la firma XML.
  return raw.split(XMLDSIG_REMOTE).join(XMLDSIG_LOCAL);
}

/**
 * libxml2 corre dentro de WASM y no ve el sistema de ficheros del anfitrión, así
 * que los `import` entre esquemas hay que servírselos desde memoria — y ya
 * parcheados, porque `SuministroLR.xsd` importa a `SuministroInformacion.xsd`,
 * que a su vez importa la firma XML. La clave es la ruta absoluta que libxml2
 * resuelve a partir de la `url` del documento.
 */
let providerRegistered = false;
function ensureInputProvider(): void {
  if (providerRegistered) return;
  const buffers: Record<string, Uint8Array> = {};
  for (const file of SCHEMA_FILES) {
    buffers[join(SCHEMAS_DIR, file)] = Buffer.from(loadSchemaSource(file), 'utf8');
  }
  xmlRegisterInputProvider(new XmlBufferInputProvider(buffers));
  providerRegistered = true;
}

/** Validadores compilados una sola vez: compilar cuesta ~20 ms, validar ~2 ms. */
const validators = new Map<string, XsdValidator>();

function getValidator(schemaFile: string): XsdValidator {
  let validator = validators.get(schemaFile);
  if (!validator) {
    ensureInputProvider();
    const doc = XmlDocument.fromString(loadSchemaSource(schemaFile), {
      url: join(SCHEMAS_DIR, schemaFile),
    });
    validator = XsdValidator.fromDoc(doc);
    validators.set(schemaFile, validator);
  }
  return validator;
}

export interface XsdValidationResult {
  valid: boolean;
  /** Mensajes de libxml2, uno por error. Vacío si `valid`. */
  errors: string[];
}

/**
 * Valida un documento XML contra uno de los esquemas de `schemas/`.
 *
 * El documento debe tener como raíz un elemento **global** del esquema. Los tres
 * únicos elementos globales de Veri*Factu son `RegFactuSistemaFacturacion`,
 * `RegistroAlta` y `RegistroAnulacion`: un sobre SOAP completo no valida
 * directamente, hay que extraer antes el contenido del `Body`.
 */
export function validateAgainstXsd(xml: string, schemaFile: string): XsdValidationResult {
  const validator = getValidator(schemaFile);
  let doc: XmlDocument;
  try {
    doc = XmlDocument.fromString(xml);
  } catch (err) {
    return { valid: false, errors: [`XML mal formado: ${(err as Error).message}`] };
  }
  try {
    validator.validate(doc);
    return { valid: true, errors: [] };
  } catch (err) {
    const errors =
      err instanceof XmlLibError
        ? err.details.map((d) => d.message.trim())
        : [(err as Error).message];
    return { valid: false, errors };
  } finally {
    doc.dispose();
  }
}

/** Atajo para el caso más común: un mensaje de suministro completo. */
export function validateSuministro(xml: string): XsdValidationResult {
  return validateAgainstXsd(xml, 'SuministroLR.xsd');
}

/** Atajo para una respuesta de la AEAT a un envío. */
export function validateRespuestaSuministro(xml: string): XsdValidationResult {
  return validateAgainstXsd(xml, 'RespuestaSuministro.xsd');
}

/**
 * Extrae el contenido del `soapenv:Body` de un sobre SOAP.
 *
 * Necesario porque el sobre no forma parte de ningún XSD de la AEAT: lo define
 * el WSDL. Sin esto, validar la salida del cliente daría siempre «no matching
 * global declaration», que oculta los errores reales del registro.
 */
export function extractSoapBody(envelope: string): string {
  const match = /<(?:[\w.-]+:)?Body[^>]*>([\s\S]*)<\/(?:[\w.-]+:)?Body>/.exec(envelope);
  if (!match?.[1]) {
    throw new Error('No se encontró soapenv:Body en el sobre');
  }
  const inner = match[1].trim();
  // El sobre declara los prefijos en el elemento raíz; al recortar el Body hay
  // que reponer esas declaraciones o el documento suelto no resuelve los ns.
  const nsDecls = [...envelope.matchAll(/xmlns:([\w.-]+)="([^"]+)"/g)]
    .filter(([, prefix]) => prefix !== 'soapenv' && prefix !== 'soap' && prefix !== 'env')
    .map(([, prefix, uri]) => ` xmlns:${prefix}="${uri}"`)
    .join('');

  if (!nsDecls) return inner;
  return inner.replace(/^<([\w.-]+(?::[\w.-]+)?)/, (_m, tag: string) => `<${tag}${nsDecls}`);
}

/** Formatea los errores para un mensaje de aserción legible. */
export function formatXsdErrors(result: XsdValidationResult): string {
  return result.errors.map((e) => `  · ${e}`).join('\n');
}
