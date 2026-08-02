/**
 * Parser XML mínimo para las respuestas de la AEAT.
 *
 * El dominio de entrada es acotado —documentos SOAP de un único emisor— y por eso
 * se mantiene propio en vez de añadir una dependencia. Pero «mínimo» no puede
 * significar «frágil»: la versión anterior descartaba **en silencio** todos los
 * hermanos posteriores a un comentario, convertía el contenido de un `CDATA` en un
 * elemento con nombre basura, y ante un `<!DOCTYPE html>` de una página de error
 * devolvía un árbol vacío sin lanzar, de modo que el fallo emergía tres capas más
 * arriba como un error de negocio inventado.
 *
 * **No resuelve entidades externas ni DTD.** Es deliberado: evita XXE. Si algún
 * día se sustituye por una librería, hay que desactivarlas explícitamente.
 */

import { XmlParseError } from '../errors/xml-errors.js';

/** Nodo del árbol. */
export interface XmlNode {
  /** Nombre local, sin prefijo. */
  name: string;
  /** Nombre completo, con prefijo si lo hay. */
  fullName: string;
  /** Prefijo de espacio de nombres. */
  prefix?: string;
  /** Atributos, ya desescapados. */
  attributes: Record<string, string>;
  /** Texto concatenado de los hijos de texto y `CDATA`. */
  text?: string;
  /** Elementos hijos. */
  children: XmlNode[];
}

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * Desescapa entidades nombradas y referencias de carácter.
 *
 * Una sola pasada, para que `&amp;lt;` produzca `&lt;` y no `<`.
 */
export function unescapeXml(value: string): string {
  return value.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (completo, cuerpo: string) => {
    if (cuerpo.startsWith('#x') || cuerpo.startsWith('#X')) {
      const cp = Number.parseInt(cuerpo.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : completo;
    }
    if (cuerpo.startsWith('#')) {
      const cp = Number.parseInt(cuerpo.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : completo;
    }
    return ENTIDADES[cuerpo] ?? completo;
  });
}

interface Etiqueta {
  fullName: string;
  attributes: Record<string, string>;
  autoCerrada: boolean;
  fin: number;
}

/** Lee los atributos de una etiqueta ya delimitada. */
function leerAtributos(fragmento: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Acotado al fragmento, que es justo lo que faltaba: el bucle anterior buscaba
  // la siguiente comilla sin cota superior y se comía el resto del documento.
  const re = /([\w.:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragmento)) !== null) {
    const nombre = m[1]!;
    const valor = m[2] ?? m[3];
    const limpio = valor === undefined ? '' : unescapeXml(valor);
    attrs[nombre] = limpio;
    // También accesible por su nombre local, que es como se consultan en la
    // práctica. Si dos prefijos comparten nombre local, gana el primero.
    const idx = nombre.indexOf(':');
    if (idx !== -1) {
      const local = nombre.slice(idx + 1);
      if (attrs[local] === undefined) attrs[local] = limpio;
    }
  }
  return attrs;
}

/** Lee una etiqueta de apertura a partir de `<`. */
function leerEtiqueta(xml: string, inicio: number): Etiqueta {
  let i = inicio + 1;
  let comilla: '"' | "'" | null = null;
  while (i < xml.length) {
    const c = xml[i]!;
    if (comilla) {
      if (c === comilla) comilla = null;
    } else if (c === '"' || c === "'") {
      comilla = c;
    } else if (c === '>') {
      break;
    }
    i++;
  }
  if (i >= xml.length) throw new XmlParseError('Etiqueta sin cerrar');

  const cuerpo = xml.slice(inicio + 1, i);
  const autoCerrada = cuerpo.endsWith('/');
  const limpio = autoCerrada ? cuerpo.slice(0, -1) : cuerpo;
  const espacio = limpio.search(/\s/);
  const fullName = (espacio === -1 ? limpio : limpio.slice(0, espacio)).trim();
  const attrs = espacio === -1 ? {} : leerAtributos(limpio.slice(espacio));

  return { fullName, attributes: attrs, autoCerrada, fin: i + 1 };
}

function crearNodo(fullName: string, attributes: Record<string, string>): XmlNode {
  const idx = fullName.indexOf(':');
  const node: XmlNode = {
    name: idx === -1 ? fullName : fullName.slice(idx + 1),
    fullName,
    attributes,
    children: [],
  };
  if (idx !== -1) node.prefix = fullName.slice(0, idx);
  return node;
}

/** Parsea un documento XML. Lanza si no está bien formado. */
export function parseXml(xml: string): XmlNode {
  const pila: XmlNode[] = [];
  let raiz: XmlNode | undefined;
  let texto = '';
  let i = 0;

  const volcarTexto = (): void => {
    if (texto === '') return;
    const actual = pila[pila.length - 1];
    if (actual) {
      // Sin separador: inventar un espacio entre fragmentos de texto mixto
      // corrompía valores donde los espacios son significativos.
      actual.text = (actual.text ?? '') + unescapeXml(texto);
    }
    texto = '';
  };

  while (i < xml.length) {
    if (xml[i] !== '<') {
      const siguiente = xml.indexOf('<', i);
      const hasta = siguiente === -1 ? xml.length : siguiente;
      if (pila.length > 0) texto += xml.slice(i, hasta);
      i = hasta;
      continue;
    }

    // Comentario: se salta entero.
    if (xml.startsWith('<!--', i)) {
      const fin = xml.indexOf('-->', i + 4);
      if (fin === -1) throw new XmlParseError('Comentario sin cerrar');
      i = fin + 3;
      continue;
    }

    // CDATA: su contenido es texto literal, sin desescapar.
    if (xml.startsWith('<![CDATA[', i)) {
      const fin = xml.indexOf(']]>', i + 9);
      if (fin === -1) throw new XmlParseError('CDATA sin cerrar');
      volcarTexto();
      const actual = pila[pila.length - 1];
      if (actual) actual.text = (actual.text ?? '') + xml.slice(i + 9, fin);
      i = fin + 3;
      continue;
    }

    // DOCTYPE: se salta, contando corchetes por si trae subconjunto interno.
    if (xml.startsWith('<!DOCTYPE', i) || xml.startsWith('<!doctype', i)) {
      let j = i + 9;
      let corchetes = 0;
      while (j < xml.length) {
        const c = xml[j]!;
        if (c === '[') corchetes++;
        else if (c === ']') corchetes--;
        else if (c === '>' && corchetes <= 0) break;
        j++;
      }
      if (j >= xml.length) throw new XmlParseError('DOCTYPE sin cerrar');
      i = j + 1;
      continue;
    }

    // Declaración XML o instrucción de proceso: se salta.
    if (xml.startsWith('<?', i)) {
      const fin = xml.indexOf('?>', i + 2);
      if (fin === -1) throw new XmlParseError('Instrucción de proceso sin cerrar');
      i = fin + 2;
      continue;
    }

    // Etiqueta de cierre.
    if (xml.startsWith('</', i)) {
      const fin = xml.indexOf('>', i);
      if (fin === -1) throw new XmlParseError('Etiqueta de cierre sin terminar');
      volcarTexto();
      const nombre = xml.slice(i + 2, fin).trim();
      const actual = pila[pila.length - 1];
      if (!actual) throw new XmlParseError(`Cierre inesperado de </${nombre}>`);
      if (actual.fullName !== nombre) {
        throw new XmlParseError(
          `Etiqueta mal anidada: se esperaba </${actual.fullName}> y se encontró </${nombre}>`
        );
      }
      pila.pop();
      i = fin + 1;
      continue;
    }

    // Etiqueta de apertura.
    volcarTexto();
    const etiqueta = leerEtiqueta(xml, i);
    const nodo = crearNodo(etiqueta.fullName, etiqueta.attributes);
    const padre = pila[pila.length - 1];
    if (padre) padre.children.push(nodo);
    else if (raiz) throw new XmlParseError('El documento tiene más de un elemento raíz');
    else raiz = nodo;
    if (!etiqueta.autoCerrada) pila.push(nodo);
    i = etiqueta.fin;
  }

  if (pila.length > 0) {
    throw new XmlParseError(`Etiqueta sin cerrar: <${pila[pila.length - 1]!.fullName}>`);
  }
  if (!raiz) throw new XmlParseError('El documento no contiene ningún elemento');
  return raiz;
}

/** Busca el primer nodo con ese nombre local, en profundidad. */
export function findNode(node: XmlNode, name: string): XmlNode | undefined {
  if (node.name === name) return node;
  for (const child of node.children) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return undefined;
}

/** Busca todos los nodos con ese nombre local, en profundidad. */
export function findAllNodes(node: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  if (node.name === name) out.push(node);
  for (const child of node.children) out.push(...findAllNodes(child, name));
  return out;
}

/**
 * Hijo directo con ese nombre local.
 *
 * Preferible a {@link findNode} siempre que se pueda: dentro de `RespuestaLinea`,
 * `CodigoErrorRegistro` aparece dos veces —una en la línea y otra en
 * `RegistroDuplicado`— y una búsqueda en profundidad las mezcla.
 */
export function getChild(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((c) => c.name === name);
}

/** Texto de un hijo directo. */
export function getChildText(node: XmlNode, name: string): string | undefined {
  return getChild(node, name)?.text;
}

/** Hijos directos con ese nombre local. */
export function getChildren(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((c) => c.name === name);
}

/** Vuelca los hijos directos con texto a un objeto plano. */
export function nodeToObject(node: XmlNode): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const child of node.children) out[child.name] = child.text;
  return out;
}
